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


describe("the child's pick (B27)", () => {
  const LESSON = "6f2c1d8e-4b3a-4c5d-9e8f-7a6b5c4d3e2f";

  it("travels as the option's own value, with the lesson it came from", () => {
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
      choice: { id: "b", label: "Two", value: 2 },
      lessonId: LESSON,
    });

    // The value, as text - not the stringified option id, which is ours.
    expect(out?.answer).toBe("2");
    expect(out?.lessonId).toBe(LESSON);
  });

  it("keeps the verdict beside it, because nothing marks a lesson-level question", () => {
    /*
     * The contract marks the pick only where the attempt names a segment
     * whose calculation the server holds, and takes `responseCorrect`
     * elsewhere. After-lesson questions sit on no segment. Dropping the
     * verdict here would lose the attempt - until backend marks these too.
     */
    const out = scaffoldAttemptFor({
      question,
      correct: false,
      studentId: "s-1",
      choice: { id: "a", label: "One", value: 1 },
      lessonId: LESSON,
    });

    expect(out?.responseCorrect).toBe(false);
  });

  it("is left out where there is no value to send", () => {
    // The authored demo checks carry none.
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
      choice: { id: "a", label: "One" },
    });

    expect(out).not.toHaveProperty("answer");
  });

  it("is left out, not cut short, when it is too long to send whole", () => {
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
      choice: { id: "a", label: "Long", value: "x".repeat(401) },
    });

    expect(out).not.toHaveProperty("answer");
  });

  it("names no lesson whose id the contract would refuse", () => {
    // `format: uuid`; an authored lesson's invented id would 422 the write.
    const out = scaffoldAttemptFor({
      question,
      correct: true,
      studentId: "s-1",
      lessonId: "photo-1",
    });

    expect(out).not.toHaveProperty("lessonId");
  });
});
