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

beforeEach(() => mediaUrl.mockReset());
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
