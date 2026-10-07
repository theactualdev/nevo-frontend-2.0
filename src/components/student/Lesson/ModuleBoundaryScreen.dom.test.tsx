import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModuleBoundaryScreen } from "./ModuleBoundaryScreen";

/**
 * SCRUM-101, as answered rather than as prototyped.
 *
 * The attention recap was uncapped on phones, where the spec caps it at two
 * lines so "Yes, continue" stays above the fold. And "Take a break first" is
 * gone (D91, 6 Oct): "The module boundary already carries the stretch, and
 * offering a break on top of a break turns a rhythm into a negotiation."
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
    ...over,
  };
  render(<ModuleBoundaryScreen {...props} />);
  return props;
};

describe("the boundary's one action", () => {
  it("offers no break (D91)", () => {
    renderBoundary();

    expect(screen.queryByRole("button", { name: /break/i })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText(/progress is saved/i)).toBeNull();
  });

  it("is 'Yes, continue', into the next module", () => {
    const props = renderBoundary();

    fireEvent.click(screen.getByRole("button", { name: "Yes, continue" }));

    expect(props.onAction).toHaveBeenCalledWith("continue");
    expect(props.onEnterNext).toHaveBeenCalledTimes(1);
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
