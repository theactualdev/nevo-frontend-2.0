import { describe, expect, it } from "vitest";
import { bandForRoster, dotPairs } from "./bands";

/**
 * The roster's closed `AgeBand` (B5, 1 Oct) onto the four tiers here. Each
 * names the same school stage as one tier, so the map is one to one; anything
 * else is no band, and the caller asks rather than assumes.
 */

describe("bandForRoster", () => {
  it("maps each school stage onto its tier", () => {
    expect(bandForRoster("early_primary")).toBe("p13");
    expect(bandForRoster("upper_primary")).toBe("p46");
    expect(bandForRoster("junior_secondary")).toBe("jss");
    expect(bandForRoster("senior_secondary")).toBe("ss");
  });

  it("gives no band for a row with none", () => {
    expect(bandForRoster(null)).toBeNull();
    expect(bandForRoster(undefined)).toBeNull();
  });

  it("does not guess at a value outside the closed set", () => {
    // The free-text values from before 1 Oct convert on read server-side;
    // anything still arriving like this is not ours to interpret.
    expect(bandForRoster("Year 4")).toBeNull();
    expect(bandForRoster("12")).toBeNull();
  });
});

/**
 * Module 3B's dot pairs (D76, 6 Oct): "Ratio tightening from 2:1 to 1.1:1 is
 * the architecture, and trials 2 and 3 derive from the ratio in all of them."
 * Three bands ran hand-written second and third pairs that sat off their own
 * ratio. This is the stimulus spec, written down: the table a child in each
 * band is shown, the same every run.
 */
describe("dotPairs", () => {
  it("is the frame's pair, then two derived from the band's ratio", () => {
    expect(dotPairs("p13")).toEqual([
      { a: 8, b: 4 },
      { a: 6, b: 3 },
      { a: 10, b: 5 },
    ]);
    expect(dotPairs("p46")).toEqual([
      { a: 9, b: 5 },
      { a: 7, b: 4 },
      { a: 11, b: 6 },
    ]);
    expect(dotPairs("jss")).toEqual([
      { a: 12, b: 8 },
      { a: 11, b: 7 },
      { a: 14, b: 9 },
    ]);
    // The pairs SS already ran, which design took as derived from 1.1:1.
    expect(dotPairs("ss")).toEqual([
      { a: 13, b: 12 },
      { a: 12, b: 11 },
      { a: 14, b: 13 },
    ]);
  });

  it.each([
    ["p13", 2],
    ["p46", 1.8],
    ["jss", 1.5],
    ["ss", 1.1],
  ] as const)(
    "keeps %s's later pairs within a whole dot of its %s:1 ratio",
    (band, ratio) => {
      for (const { a, b } of dotPairs(band).slice(1)) {
        expect(a).toBeGreaterThan(b);
        expect(Math.abs(a - b * ratio)).toBeLessThanOrEqual(0.5);
      }
    },
  );
});
