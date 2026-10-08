import { describe, expect, it } from "vitest";
import { helpSeekingLine } from "./useStudentProfile";

/**
 * T142. The categories are an untyped map, and the one vocabulary on the
 * contract near them is Ask Nevo's tokens - so a teacher could read that a
 * child asked "mostly about lesson_help".
 */

const evidence = (categories: Record<string, number>) => ({
  interactionCount: 4,
  periodDays: 7,
  categories,
  privacy: "aggregate_only",
});

describe("the help-seeking line", () => {
  it("names what most of it was about, when that is words", () => {
    expect(helpSeekingLine(evidence({ fractions: 3, angles: 1 }))).toBe(
      "Asked Nevo for help 4 times this week, mostly about fractions.",
    );
  });

  it("stops before a code rather than printing it", () => {
    const line = helpSeekingLine(evidence({ lesson_help: 3, general: 1 }));

    expect(line).toBe("Asked Nevo for help 4 times this week.");
    expect(line).not.toMatch(/_/);
  });

  it("still says nothing about a tie", () => {
    expect(helpSeekingLine(evidence({ fractions: 2, angles: 2 }))).toBe(
      "Asked Nevo for help 4 times this week.",
    );
  });
});
