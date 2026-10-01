import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { VisualSegment } from "./VisualSegment";

/**
 * A lesson picture had no failure path at all.
 *
 * Generated pictures sit behind signed links that expire. One that had aged
 * out - or never loaded offline - drew the browser's broken-image icon in the
 * middle of the lesson, and `storagePath`, the one thing that could re-issue
 * the link, was dropped on the way in.
 */

const mediaUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/content", () => ({
  contentApi: { mediaUrl: (...a: unknown[]) => mediaUrl(...a) },
}));

const CONTENT = {
  heading: "The leaf",
  illustration: {
    src: "https://cdn.example/leaf.png",
    alt: "A leaf in sunlight",
    caption: "A leaf in sunlight",
    storagePath: "images/leaf.png",
    width: 800,
    height: 400,
  },
};

const picture = () => screen.queryByRole("img", { name: "A leaf in sunlight" });

// A block, not an expression: `mockReset` returns the mock, and a function
// returned from `beforeEach` is run as its teardown - which called
// `mediaUrl()` after every test and failed any test that made it reject.
beforeEach(() => {
  mediaUrl.mockReset();
});
afterEach(() => cleanup());

describe("a lesson picture that will not load", () => {
  it("is re-issued once from where it is stored", async () => {
    mediaUrl.mockResolvedValue({ url: "https://cdn.example/fresh.png" });
    render(<VisualSegment content={CONTENT} />);

    fireEvent.error(picture()!);

    await waitFor(() =>
      expect(picture()?.getAttribute("src")).toBe(
        "https://cdn.example/fresh.png",
      ),
    );
    expect(mediaUrl).toHaveBeenCalledWith("images/leaf.png");
  });

  it("becomes the quiet tile, not a broken image, when it still fails", async () => {
    mediaUrl.mockResolvedValue({ url: "https://cdn.example/fresh.png" });
    render(<VisualSegment content={CONTENT} />);

    fireEvent.error(picture()!);
    await waitFor(() =>
      expect(picture()?.getAttribute("src")).toContain("fresh"),
    );
    fireEvent.error(picture()!);

    expect(picture()).toBeNull();
    // The words that describe it stay.
    expect(screen.getByText("A leaf in sunlight")).toBeTruthy();
  });

  it("comes back when the connection does", () => {
    render(
      <VisualSegment
        content={{
          ...CONTENT,
          illustration: { ...CONTENT.illustration, storagePath: undefined },
        }}
      />,
    );
    fireEvent.error(picture()!);
    expect(picture()).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(picture()).not.toBeNull();
  });

  it("keeps its own shape when the wire says what it is", () => {
    render(<VisualSegment content={CONTENT} />);

    expect(picture()?.getAttribute("width")).toBe("800");
    expect(picture()?.getAttribute("height")).toBe("400");
  });
});

/**
 * D26 / B12: the quiet tile alone read as a picture meant to be blank. The
 * segment now says the picture did not load, keeps everything else, and the
 * engine is told - once, and only when it really failed.
 */
describe("a picture that did not load, said and reported", () => {
  const NOTICE = /picture didn.t load/i;

  it("says so under the tile, and keeps the rest of the segment", () => {
    render(
      <VisualSegment
        content={{
          ...CONTENT,
          illustration: { ...CONTENT.illustration, storagePath: undefined },
        }}
      />,
    );

    fireEvent.error(picture()!);

    expect(screen.getByRole("status").textContent).toMatch(NOTICE);
    expect(screen.getByText("The leaf")).toBeTruthy();
    expect(screen.getByText("A leaf in sunlight")).toBeTruthy();
  });

  it("says nothing for a segment that never had a picture", () => {
    render(<VisualSegment content={{ heading: "The leaf" }} />);

    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("says nothing while the picture is fine", () => {
    render(<VisualSegment content={CONTENT} />);

    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("tells the engine once, after the fresh link fails too", async () => {
    mediaUrl.mockResolvedValue({ url: "https://cdn.example/fresh.png" });
    const onMediaFailed = vi.fn();
    render(<VisualSegment content={CONTENT} onMediaFailed={onMediaFailed} />);

    fireEvent.error(picture()!);
    await waitFor(() =>
      expect(picture()?.getAttribute("src")).toContain("fresh"),
    );
    // An expired link that was re-issued is not a failure.
    expect(onMediaFailed).not.toHaveBeenCalled();

    fireEvent.error(picture()!);

    expect(onMediaFailed).toHaveBeenCalledTimes(1);
    expect(onMediaFailed).toHaveBeenCalledWith("load_error");
  });

  it("says the link could not be re-issued when that is what happened", async () => {
    mediaUrl.mockRejectedValue(new Error("503"));
    const onMediaFailed = vi.fn();
    render(<VisualSegment content={CONTENT} onMediaFailed={onMediaFailed} />);

    fireEvent.error(picture()!);
    await act(async () => {});

    expect(onMediaFailed).toHaveBeenCalledWith("refresh_failed");
  });

  it("says the device was offline when it was", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const onMediaFailed = vi.fn();
    render(
      <VisualSegment
        content={{
          ...CONTENT,
          illustration: { ...CONTENT.illustration, storagePath: undefined },
        }}
        onMediaFailed={onMediaFailed}
      />,
    );

    fireEvent.error(picture()!);
    online.mockRestore();

    expect(onMediaFailed).toHaveBeenCalledWith("offline");
  });
});
