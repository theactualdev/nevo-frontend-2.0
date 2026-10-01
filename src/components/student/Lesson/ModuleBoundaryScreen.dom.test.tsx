import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModuleBoundaryScreen } from "./ModuleBoundaryScreen";

/**
 * SCRUM-101, as answered rather than as prototyped.
 *
 * "Take a break first" rested on this screen with "Your progress is saved",
 * where the spec routes it to the break module and back - so a child who asked
 * for a break got no break and no break signal. And the attention recap was
 * uncapped on phones, where the spec caps it at two lines so "Yes, continue"
 * stays above the fold.
 */

afterEach(() => cleanup());

const RECAP =
  "You saw how leaves take in light and water, where photosynthesis happens inside the leaf, and why the leaf is green in the first place.";

const renderBoundary = (over: Record<string, unknown> = {}) => {
  const props = {
    lessonTitle: "Photosynthesis",
    finished: { id: "m-1", title: "Introduction", segmentIds: ["s1"], recap: RECAP },
    next: { id: "m-2", title: "Practice", segmentIds: ["s2"], preview: "Try it." },
    nextModuleIndex: 1,
    moduleCount: 2,
    lessonProgress: 0.5,
    showRecap: true,
    onReached: vi.fn(),
    onAction: vi.fn(),
    onEnterNext: vi.fn(),
    onTakeBreak: vi.fn(),
    ...over,
  };
  render(<ModuleBoundaryScreen {...props} />);
  return props;
};

describe("Take a break first", () => {
  it("goes to the break module rather than resting here", () => {
    const props = renderBoundary();

    fireEvent.click(screen.getByRole("button", { name: "Take a break first" }));

    expect(props.onAction).toHaveBeenCalledWith("break");
    expect(props.onTakeBreak).toHaveBeenCalledTimes(1);
    // No rest state, and no claim about saving.
    expect(screen.queryByText("Take your time")).toBeNull();
    expect(screen.queryByText(/progress is saved/i)).toBeNull();
    expect(props.onEnterNext).not.toHaveBeenCalled();
  });

  it("leaves 'Yes, continue' entering the next module", () => {
    const props = renderBoundary();

    fireEvent.click(screen.getByRole("button", { name: "Yes, continue" }));

    expect(props.onEnterNext).toHaveBeenCalledTimes(1);
    expect(props.onTakeBreak).not.toHaveBeenCalled();
  });
});

describe("the recap on a phone", () => {
  it("is capped at two lines, and only below tablet width", () => {
    // jsdom lays nothing out, so the cap is asserted where it lives: the
    // spec's "capped at two lines each" at 375x812, released from sm up.
    renderBoundary();

    for (const text of [RECAP, "Try it."]) {
      const line = screen.getByText(text);
      expect(line.className).toContain("line-clamp-2");
      expect(line.className).toContain("sm:line-clamp-none");
    }
  });
});
