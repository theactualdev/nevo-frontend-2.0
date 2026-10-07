import { describe, expect, it } from "vitest";
import type { CohortIndicator } from "@/lib/api/analytics";
import { acrossLine, comparisonLine, figure } from "./transformationLines";

/**
 * The comparison under each school-wide figure. `trend` is the server's
 * better-or-behind, not a direction - for time to finish a lesson fewer
 * minutes is "up" - so the line never says rose or fell, and never subtracts.
 */

const ind = (over: Partial<CohortIndicator>): CohortIndicator => ({
  value: 82.5,
  previous: 78,
  trend: "up",
  learnerCount: 240,
  ...over,
});

describe("comparisonLine", () => {
  it("names the earlier figure and the server's judgement, never a difference", () => {
    expect(comparisonLine(ind({}), "%")).toBe("Better than the four weeks before (78%)");
    expect(comparisonLine(ind({ trend: "down", previous: 85 }), "%")).toBe(
      "Behind the four weeks before (85%)",
    );
    expect(comparisonLine(ind({ trend: "steady", previous: 82 }), "%")).toBe(
      "Much the same as the four weeks before (82%)",
    );
  });

  it("reads 'up' as better even when the number fell - fewer minutes to finish", () => {
    expect(comparisonLine(ind({ value: 12.4, previous: 14.1, trend: "up" }), " min")).toBe(
      "Better than the four weeks before (14.1 min)",
    );
  });

  it("says nothing when there is nothing to compare with", () => {
    expect(comparisonLine(ind({ previous: null, trend: "unknown" }), "%")).toBeNull();
    expect(comparisonLine(ind({ trend: "unknown" }), "%")).toBeNull();
    // Never "(null%)" - even if a trend ever arrived without its earlier figure.
    expect(comparisonLine(ind({ previous: null, trend: "steady" }), "%")).toBeNull();
  });
});

describe("figure and acrossLine", () => {
  it("shows a server number as written", () => {
    expect(figure(82.5)).toBe("82.5");
    expect(figure(12)).toBe("12");
    expect(figure(1240)).toBe("1,240");
  });

  it("states the cohort a figure is over", () => {
    expect(acrossLine(240)).toBe("Across 240 students");
    expect(acrossLine(1)).toBe("Across 1 student");
  });
});
