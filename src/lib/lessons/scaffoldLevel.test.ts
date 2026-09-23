import { describe, expect, it } from "vitest";
import { levelForIntensity } from "./scaffoldLevel";
import { SCAFFOLD_FILLED, SCAFFOLD_LEVELS } from "@/lib/constants/scaffold";

/**
 * The mapping is four-to-four and ordered, so the thing worth testing is the
 * ORDER rather than the four lookups - an inverted map would still pass any
 * test that only checked "returns a level".
 */

describe("each intensity reaches the circles the frame draws", () => {
  it.each([
    ["full_support", SCAFFOLD_LEVELS.FULL, 4],
    ["partial_support", SCAFFOLD_LEVELS.MODERATE, 3],
    ["hints_only", SCAFFOLD_LEVELS.LIGHT, 2],
    ["independent", SCAFFOLD_LEVELS.MINIMAL, 1],
  ])("%s fills %s (%i of 4)", (intensity, level, filled) => {
    expect(levelForIntensity(intensity)).toBe(level);
    expect(SCAFFOLD_FILLED[level]).toBe(filled);
  });

  it("runs most support to least, so an inverted map cannot pass", () => {
    // The one property a per-value test cannot catch on its own.
    const order = [
      "full_support",
      "partial_support",
      "hints_only",
      "independent",
    ];
    const filled = order.map(
      (i) => SCAFFOLD_FILLED[levelForIntensity(i)!],
    );

    expect(filled).toEqual([4, 3, 2, 1]);
  });

  it("reaches minimal, which the adaptation plan cannot express at all", () => {
    /*
     * The finding this mapping exists for. `ScaffoldingLevel` is
     * `light | standard | strong` - three values - so one filled dot has been
     * unreachable on every lesson since the indicator shipped. Not a mapping
     * bug: there was no fourth value to map from.
     */
    expect(levelForIntensity("independent")).toBe(SCAFFOLD_LEVELS.MINIMAL);
    expect(SCAFFOLD_FILLED[SCAFFOLD_LEVELS.MINIMAL]).toBe(1);
  });
});

describe("when there is nothing to say", () => {
  it.each([[null], [undefined], [""]])("%s is null, not a level", (v) => {
    // Absence is an instruction. The caller leaves the indicator alone rather
    // than filling the gap with a default in either direction.
    expect(levelForIntensity(v as string | null | undefined)).toBeNull();
  });

  it("an unrecognised value is null rather than the nearest guess", () => {
    // A value we do not know is not evidence a child needs any amount of help,
    // and the indicator is a statement about them.
    expect(levelForIntensity("scaffolded_to_the_gills")).toBeNull();
    expect(levelForIntensity("strong")).toBeNull();
  });

  it("never returns OFF, which is the caller's decision and not the engine's", () => {
    // OFF hides the indicator entirely. Nothing the engine sends should be
    // able to make it disappear - that is a rendering choice.
    const all = [
      "full_support",
      "partial_support",
      "hints_only",
      "independent",
      "unknown",
      "",
    ];

    for (const v of all) expect(levelForIntensity(v)).not.toBe(SCAFFOLD_LEVELS.OFF);
  });
});
