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

/*
 * Lydia, 16 Nov: a group of parts is a STAGE. "Stage 2 of 3 done", and the
 * dots read "Stage 2 of 3" - in place of "Section complete" and "Module 2 of
 * 3". Section, segment and module never reach a child.
 */
describe("a group of parts is a stage (Lydia, 16 Nov)", () => {
  it("says the stage just finished, and the dots read it", () => {
    renderBoundary({ nextModuleIndex: 2, moduleCount: 3 });

    expect(screen.getByText("Stage 2 of 3 done")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Stage 2 of 3" })).toBeTruthy();
  });

  it("names the stage being entered in the chip and the bar", () => {
    renderBoundary({ nextModuleIndex: 2, moduleCount: 3 });

    expect(screen.getByText("Stage 3 of 3")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Stage 3 of 3" })).toBeTruthy();
  });

  it("never says section, segment or module to the child", () => {
    renderBoundary({
      finished: { id: "m-1", title: "", segmentIds: ["s1"] },
    });

    expect(document.body.textContent).not.toMatch(/section|segment|module/i);
    expect(screen.getByRole("heading").textContent).toBe(
      "You've finished this stage. Ready for the next part?",
    );
    for (const el of document.querySelectorAll("[aria-label]"))
      expect(el.getAttribute("aria-label")).not.toMatch(/section|segment|module/i);
  });
});

describe("the heading (D186, 13 Oct)", () => {
  it("names the finished module as written, with no article and no second title", () => {
    renderBoundary({
      finished: { id: "m-1", title: "What plants need", segmentIds: ["s1"] },
      next: { id: "m-2", title: "Newton's Laws", segmentIds: ["s2"] },
    });

    // Lydia's own example, verbatim.
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /^You've finished What plants need\. Ready for the next part\?$/,
    );
  });

  it("keeps a title's capitals, so a name in it survives", () => {
    renderBoundary({
      finished: { id: "m-1", title: "Rivers of Lagos", segmentIds: ["s1"] },
      next: { id: "m-2", title: "Newton's Laws", segmentIds: ["s2"] },
    });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /^You've finished Rivers of Lagos\. Ready for the next part\?$/,
    );
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
