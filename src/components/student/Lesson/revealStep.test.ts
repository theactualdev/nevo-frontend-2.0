import { describe, expect, it } from "vitest";
import { revealPlan } from "./revealStep";

/**
 * Which part of a step to bring into view above the docked pad: the first
 * stretch, most first, that fits the column - moved the least distance.
 */
const view = { top: 100, bottom: 400 };
const span = (top: number, bottom: number) => ({ top, bottom });

describe("revealPlan", () => {
  it("leaves a stretch that is already in view where it is", () => {
    expect(revealPlan([span(150, 380)], view)).toEqual({ index: 0, align: null });
  });

  it("brings one that ends below the view up by its end", () => {
    expect(revealPlan([span(300, 520)], view)).toEqual({ index: 0, align: "end" });
  });

  it("brings one that starts above the view down by its start", () => {
    expect(revealPlan([span(40, 200)], view)).toEqual({ index: 0, align: "start" });
  });

  it("takes the first that fits, passing over any taller than the view", () => {
    // Question to hint link (360px), question to Check (290px).
    expect(revealPlan([span(300, 660), span(300, 590)], view)).toEqual({
      index: 1,
      align: "end",
    });
  });

  it("takes one exactly the view's height", () => {
    expect(revealPlan([span(400, 700)], view)).toEqual({ index: 0, align: "end" });
  });

  it("does nothing when none fits", () => {
    expect(revealPlan([span(0, 500), span(100, 450)], view)).toBeNull();
  });
});
