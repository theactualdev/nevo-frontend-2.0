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
