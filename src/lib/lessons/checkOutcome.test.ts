import { describe, expect, it } from "vitest";
import type { LessonProgressResponse } from "@/lib/api/lessons";
import { checkOutcomeFrom } from "./checkOutcome";

/**
 * "From the check-in" is the server's (B26). These fields were never set, so
 * the section only ever showed sample content; now the completion write
 * brings them back and the client marks nothing.
 */

const row = (over: Partial<LessonProgressResponse> = {}): LessonProgressResponse => ({
  lessonId: "lesson-1",
  status: "completed",
  modulePosition: 0,
  segmentPosition: 3,
  intelligence: {},
  masteredConcepts: [
    { conceptId: null, conceptName: "Adding like fractions", asked: 2, correct: 2 },
  ],
  revisitConcepts: [
    { conceptId: null, conceptName: "Unlike denominators", asked: 2, correct: 0 },
  ],
  resultNote: "  You showed you can add fractions with the same bottom.  ",
  ...over,
});

describe("the check-in's outcome", () => {
  it("names the concepts, as the server split them", () => {
    expect(checkOutcomeFrom(row())).toEqual({
      mastered: ["Adding like fractions"],
      revisit: ["Unlike denominators"],
      note: "You showed you can add fractions with the same bottom.",
    });
  });

  it("carries no count of a child's answers", () => {
    // `asked` and `correct` are a mark in all but name (rule 9).
    const text = JSON.stringify(checkOutcomeFrom(row()));
    expect(text).not.toMatch(/\d/);
  });

  it("comes only from the write that completed the lesson", () => {
    // An earlier write's answer could describe half a check.
    expect(checkOutcomeFrom(row({ status: "in_progress" }))).toBeNull();
    expect(checkOutcomeFrom(row({ status: "exited" }))).toBeNull();
    expect(checkOutcomeFrom(null)).toBeNull();
  });

  it("is empty, not invented, when the server sent nothing", () => {
    expect(
      checkOutcomeFrom(
        row({
          masteredConcepts: undefined,
          revisitConcepts: [],
          resultNote: undefined,
        }),
      ),
    ).toEqual({ mastered: [], revisit: [], note: "" });
  });

  it("names each concept once, and skips a blank one", () => {
    const out = checkOutcomeFrom(
      row({
        masteredConcepts: [
          { conceptName: "Halves", asked: 1, correct: 1 },
          { conceptName: " Halves ", asked: 1, correct: 1 },
          { conceptName: "  ", asked: 1, correct: 1 },
        ],
      }),
    );
    expect(out?.mastered).toEqual(["Halves"]);
  });
});
