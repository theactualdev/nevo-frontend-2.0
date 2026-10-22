import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

/**
 * The bar was read aloud as a percentage.
 *
 * `aria-valuenow` on a 0-100 range, with nothing else, is announced as
 * "40 percent" - a number about a child's progress, which rule 9 keeps off the
 * screen and is no better in their ear. Every caller already names the
 * position in words; those words are what is spoken now.
 */

afterEach(() => cleanup());

describe("ProgressBar", () => {
  it("speaks the position in words, from its label", () => {
    render(<ProgressBar value={0.4} aria-label="Segment 3 of 8" />);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuetext")).toBe("Segment 3 of 8");
    expect(bar.getAttribute("aria-valuetext")).not.toMatch(/%|percent/i);
  });

  it("takes other words when it is given them", () => {
    render(
      <ProgressBar
        value={0.5}
        aria-label="Lesson progress"
        valueText="Step 2 of 4"
      />,
    );

    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "Step 2 of 4",
    );
  });

  it("leaves the number off entirely when there are no words for it", () => {
    render(<ProgressBar value={0.4} />);

    expect(
      screen.getByRole("progressbar").hasAttribute("aria-valuenow"),
    ).toBe(false);
  });
});

/*
 * THE LESSON PLAYER'S TRACK (frame d6b9fbc, measured in its source on the
 * 22 Oct on-screen check): near-black at 10%, square ends on the track and
 * the fill. Everyone else keeps the rounded line on a faint navy track.
 */
describe("ProgressBar's track", () => {
  const classes = (el: Element) => el.className.split(" ");

  it("is the Lesson Player frame's for the player, and stays as it was for everyone else", () => {
    render(<ProgressBar value={0.5} aria-label="Segment 1 of 2" lesson />);
    const lesson = screen.getByRole("progressbar");
    expect(classes(lesson)).toContain("bg-nevo-near-black/10");
    expect(classes(lesson)).not.toContain("rounded-full");
    expect(classes(lesson.firstElementChild!)).not.toContain("rounded-full");
    cleanup();

    render(<ProgressBar value={0.5} aria-label="Step 2 of 4" />);
    const shared = screen.getByRole("progressbar");
    expect(classes(shared)).toEqual(
      expect.arrayContaining(["rounded-full", "bg-nevo-navy/12"]),
    );
    expect(classes(shared.firstElementChild!)).toContain("rounded-full");
  });
});
