import { describe, expect, it } from "vitest";
import type { LessonProgressResponse } from "@/lib/api/lessons";
import { checkOutcomeFrom, rerouteFrom, resultStateFrom } from "./checkOutcome";

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

describe("how the lesson went, as the server says (B98)", () => {
  const REROUTE = {
    sessionId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    lessonId: "lesson-1",
    depth: "lower" as const,
    segmentPosition: 0,
    reason: "nothing_landed" as const,
  };

  it("is the server's word, from the completed row", () => {
    expect(resultStateFrom(row({ resultState: "partly_landed" }))).toBe(
      "partly_landed",
    );
    expect(resultStateFrom(row({ resultState: "nothing_landed" }))).toBe(
      "nothing_landed",
    );
  });

  it("is nothing from a row that is not the completion, or says nothing", () => {
    expect(
      resultStateFrom(row({ status: "exited", resultState: "nothing_landed" })),
    ).toBeNull();
    expect(resultStateFrom(row({ resultState: null }))).toBeNull();
    expect(resultStateFrom(row())).toBeNull();
    expect(resultStateFrom(null)).toBeNull();
  });

  it("is nothing for a value it does not know", () => {
    expect(
      resultStateFrom(row({ resultState: "mastered" as never })),
    ).toBeNull();
  });

  it("follows a reroute only when nothing landed", () => {
    expect(
      rerouteFrom(row({ resultState: "nothing_landed", reroute: REROUTE })),
    ).toEqual(REROUTE);
    expect(
      rerouteFrom(row({ resultState: "partly_landed", reroute: REROUTE })),
    ).toBeNull();
  });

  it("never sends an unattempted lesson down this way - it resumes", () => {
    expect(
      rerouteFrom(
        row({
          resultState: "not_attempted",
          reroute: { ...REROUTE, reason: "not_attempted" },
        }),
      ),
    ).toBeNull();
    // Nor by a reroute the server gave for that reason, whatever the state.
    expect(
      rerouteFrom(
        row({
          resultState: "nothing_landed",
          reroute: { ...REROUTE, reason: "not_attempted" },
        }),
      ),
    ).toBeNull();
  });

  it("has nothing to follow without the server's reroute, or a place in it", () => {
    expect(rerouteFrom(row({ resultState: "nothing_landed" }))).toBeNull();
    expect(
      rerouteFrom(
        row({
          resultState: "nothing_landed",
          reroute: { ...REROUTE, segmentPosition: -1 },
        }),
      ),
    ).toBeNull();
  });
});
