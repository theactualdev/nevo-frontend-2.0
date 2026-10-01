import { describe, expect, it } from "vitest";
import { scaffoldAttemptFor } from "./scaffoldAttempt";

/**
 * What a scaffold attempt is keyed on, and the four ways there is nothing to
 * report.
 *
 * The engine decides how much support a child gets on a concept from these, so
 * a body keyed on the wrong thing is worse than no body: an attempt filed
 * against the wrong problem or the wrong concept teaches it something untrue
 * about a child.
 */

const question = { id: "cp-7", conceptId: "c-1" };

describe("what it reports", () => {
  it("keys on the checkpoint id and the concept", () => {
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
    });

    expect(out).toEqual({
      studentId: "s-1",
      conceptId: "c-1",
      problemId: "cp-7",
      responseCorrect: true,
    });
  });

  it("reports a wrong answer as wrong", () => {
    const out = scaffoldAttemptFor({
      question,
      correct: false,
      studentId: "s-1",
    });

    expect(out?.responseCorrect).toBe(false);
  });

  it("derives nothing - no intensity, no streak, no score", () => {
    /*
     * Rule 3. The server answers with the next intensity and why; computing
     * either here would be the console deciding something the engine owns.
     */
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
    });

    expect(Object.keys(out!).sort()).toEqual([
      "conceptId",
      "problemId",
      "responseCorrect",
      "studentId",
    ]);
  });
});

describe("when there is nothing to report", () => {
  it("says nothing without a checkpoint id", () => {
    /*
     * A question from one of the two authored mocks. An id derived from the
     * question's POSITION would key the engine's per-problem history to an
     * array index that moves whenever content is re-authored.
     */
    const out = scaffoldAttemptFor({
      question: { conceptId: "c-1" },
      correct: true,
      studentId: "s-1",
    });

    expect(out).toBeNull();
  });

  it("says nothing without a concept", () => {
    // The engine is keyed per student per concept. Guessing which concept a
    // lesson "is about" would attribute an answer to something nobody said it
    // was about.
    const out = scaffoldAttemptFor({
      question: { id: "cp-7" },
      correct: true,
      studentId: "s-1",
    });

    expect(out).toBeNull();
  });

  it.each([[null], [undefined], [""]])(
    "says nothing for a visitor with no session (%s)",
    (studentId) => {
      // The designed walkthrough. Nobody to record an attempt for, and the
      // endpoint is Bearer-only.
      const out = scaffoldAttemptFor({
        question,
        correct: true,
        studentId: studentId as string | null | undefined,
      });

      expect(out).toBeNull();
    },
  );

  it("never returns a half-filled body for the server to refuse", () => {
    // Letting a 422 make this decision would put it in the wrong place.
    const out = scaffoldAttemptFor({
      question: {},
      correct: true,
      studentId: "s-1",
    });

    expect(out).toBeNull();
  });
});

describe("how long the answer took", () => {
  it("travels when it was measured, as the whole milliseconds the contract takes", () => {
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
      responseTimeMs: 4210.6,
    });

    expect(out?.responseTimeMs).toBe(4211);
  });

  it("is left out, not zeroed, when nothing timed it", () => {
    const out = scaffoldAttemptFor({ question, correct: true, studentId: "s-1" });

    expect(out).not.toHaveProperty("responseTimeMs");
  });
});
