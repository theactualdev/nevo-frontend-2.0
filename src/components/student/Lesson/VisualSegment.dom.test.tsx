import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { STORAGE_RETRY_MS, reissueVerdict } from "./useMediaSource";
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

/**
 * B47: what a refused re-issue is worth doing about. A path storage does not
 * know is never asked about again; storage out of reach is asked once more,
 * after a short wait, and no more than that.
 */
describe("reissueVerdict", () => {
  const refusal = (status: number, code?: string) =>
    new ApiError(status, "x", code ? { detail: { code } } : undefined);

  it("retries a 502, the bucket out of reach", () => {
    expect(reissueVerdict(refusal(502, "storage_unavailable"))).toBe("retry");
    // A gateway's own 502 carries no code and is the same passing thing.
    expect(reissueVerdict(refusal(502))).toBe("retry");
  });

  it("never asks again about a path that is not storage's", () => {
    expect(reissueVerdict(refusal(400, "invalid_storage_path"))).toBe("never");
    expect(reissueVerdict(refusal(422))).toBe("never");
  });

  it("leaves everything else to the connection coming back", () => {
    expect(reissueVerdict(refusal(0))).toBe("fail");
    expect(reissueVerdict(refusal(500))).toBe("fail");
    expect(reissueVerdict(new Error("boom"))).toBe("fail");
  });
});

describe("a fresh link that storage refused", () => {
  const unreachable = () =>
    new ApiError(502, "x", { detail: { code: "storage_unavailable" } });

  it("is asked for once more when storage was out of reach", async () => {
    mediaUrl
      .mockRejectedValueOnce(unreachable())
      .mockResolvedValueOnce({ url: "https://cdn.example/fresh.png" });
    render(<VisualSegment content={CONTENT} />);

    fireEvent.error(picture()!);

    await waitFor(
      () =>
        expect(picture()?.getAttribute("src")).toBe(
          "https://cdn.example/fresh.png",
        ),
      { timeout: STORAGE_RETRY_MS + 1500 },
    );
    expect(mediaUrl).toHaveBeenCalledTimes(2);
  });

  it("is asked for only once more, then the picture is said not to load", async () => {
    mediaUrl.mockRejectedValue(unreachable());
    const onMediaFailed = vi.fn();
    render(<VisualSegment content={CONTENT} onMediaFailed={onMediaFailed} />);

    fireEvent.error(picture()!);

    await waitFor(() => expect(onMediaFailed).toHaveBeenCalled(), {
      timeout: STORAGE_RETRY_MS + 1500,
    });
    expect(onMediaFailed).toHaveBeenCalledWith("refresh_failed");
    expect(mediaUrl).toHaveBeenCalledTimes(2);
    expect(picture()).toBeNull();
  });

  it("is never asked for again when the path is not storage's", async () => {
    mediaUrl.mockRejectedValue(
      new ApiError(400, "x", { detail: { code: "invalid_storage_path" } }),
    );
    render(<VisualSegment content={CONTENT} />);

    fireEvent.error(picture()!);
    await act(async () => {});
    expect(picture()).toBeNull();
    expect(mediaUrl).toHaveBeenCalledTimes(1);

    // The connection returning retries the picture, but not the refusal.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    fireEvent.error(picture()!);
    await act(async () => {});

    expect(mediaUrl).toHaveBeenCalledTimes(1);
    expect(picture()).toBeNull();
  });
});

describe("the small copy of a picture (B47)", () => {
  const PREVIEWED = {
    ...CONTENT,
    illustration: {
      ...CONTENT.illustration,
      previewSrc: "https://cdn.example/leaf-small.png",
    },
  };
  const small = () =>
    document.querySelector('img[src="https://cdn.example/leaf-small.png"]');

  it("paints first, under a full picture still on its way", () => {
    render(<VisualSegment content={PREVIEWED} />);

    expect(small()).not.toBeNull();
    // Decorative: the picture's description is on the full one.
    expect(small()?.getAttribute("alt")).toBe("");
    expect(picture()?.className).toMatch(/\bopacity-0\b/);
  });

  it("gives way to the full picture once it has arrived", async () => {
    render(<VisualSegment content={PREVIEWED} />);

    // next/image reports a load after the picture decodes, a tick later.
    fireEvent.load(picture()!);
    await waitFor(() => expect(small()).toBeNull());

    expect(picture()?.className).not.toMatch(/\bopacity-0\b/);
  });

  it("is simply not drawn when it will not load itself", () => {
    const onMediaFailed = vi.fn();
    render(<VisualSegment content={PREVIEWED} onMediaFailed={onMediaFailed} />);

    fireEvent.error(small()!);

    expect(small()).toBeNull();
    expect(picture()?.className).not.toMatch(/\bopacity-0\b/);
    // Only the picture itself failing is a failure worth telling.
    expect(onMediaFailed).not.toHaveBeenCalled();
  });

  it("is absent on older pictures, which draw the full one as before", () => {
    render(<VisualSegment content={CONTENT} />);

    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(picture()?.className).not.toMatch(/\bopacity-0\b/);
  });
});
