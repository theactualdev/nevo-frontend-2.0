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

/** 12 Oct: the server sends a phrase for each category key. */
describe("with the server's category labels", () => {
  const labelled = (categories: Record<string, number>, categoryLabels: Record<string, string>) => ({
    ...evidence(categories),
    categoryLabels,
  });

  it("names the top category in the server's words, inside the sentence", () => {
    expect(
      helpSeekingLine(labelled({ lesson_help: 3, general: 1 }, { lesson_help: "Lesson help", general: "General help" })),
    ).toBe("Asked Nevo for help 4 times this week, mostly about lesson help.");
  });

  it("still stops before a code the server gave no words for", () => {
    const line = helpSeekingLine(labelled({ flag_review: 3, general: 1 }, { general: "General help" }));

    expect(line).toBe("Asked Nevo for help 4 times this week.");
  });

  it("says nothing of 'mostly' on a tie, words or not", () => {
    expect(
      helpSeekingLine(labelled({ lesson_help: 2, general: 2 }, { lesson_help: "Lesson help", general: "General help" })),
    ).toBe("Asked Nevo for help 4 times this week.");
  });
});
