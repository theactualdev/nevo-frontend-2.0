import { describe, expect, it } from "vitest";
import { densitySpacing } from "./densitySpacing";

/**
 * The engine's `DensityLevel` on screen. Design, 1 Oct (D25): "Density
 * renders as spacing and how many elements sit in view at once, never as a
 * label or chip." So this is a class and nothing a child can read.
 */

describe("density as spacing, and only spacing (D25)", () => {
  it("opens the gaps for low and closes them for high", () => {
    expect(densitySpacing("low")).toMatch(/mt-8/);
    expect(densitySpacing("high")).toMatch(/mt-3/);
  });

  it("leaves the segment as drawn for medium and for no level", () => {
    expect(densitySpacing("medium")).toBe("");
    expect(densitySpacing(null)).toBe("");
    expect(densitySpacing(undefined)).toBe("");
  });

  it("touches nothing but the gap between a segment's blocks", () => {
    // Not type, not opacity, not a pseudo-element that could carry words.
    for (const level of ["low", "high"] as const) {
      expect(densitySpacing(level)).toMatch(/^\[&_article>\*\+\*\]:mt-\d+$/);
    }
  });
});
