import { describe, expect, it } from "vitest";
import type { LessonQuestionAttempt } from "@/lib/api/lessons";
import { answersBefore, checkResumeAt } from "./checkResume";

/**
 * Picking a check up where it was left (B49, D36): where, until when, and
 * what had already been answered.
 *
 * Same day only, and the day is the SERVER's - `checkResumableUntil` - so two
 * tablets agree on when a check has lapsed. A version that worked "today" out
 * on the device would pass a test written with a local clock, which is why
 * every case here hands the deadline in as an instant.
 */

const UNTIL = "2026-10-06T22:59:59Z";
const BEFORE = Date.parse("2026-10-06T15:00:00Z");
const AFTER = Date.parse("2026-10-06T23:00:00Z");

const row = (over: Record<string, unknown> = {}) => ({
  status: "in_progress",
  checkPosition: 2,
  checkResumableUntil: UNTIL,
  ...over,
});

describe("where the check reopens", () => {
  it("is the place it was left, before the server's deadline", () => {
    expect(checkResumeAt(row(), 4, BEFORE)).toBe(2);
  });

  it("is nowhere once the deadline has passed - it starts fresh", () => {
    expect(checkResumeAt(row(), 4, AFTER)).toBeNull();
    // The deadline itself is past it.
    expect(checkResumeAt(row(), 4, Date.parse(UNTIL))).toBeNull();
  });

  it("is nowhere without a deadline from the server", () => {
    // Deciding "today" here is exactly what the field exists to stop.
    expect(checkResumeAt(row({ checkResumableUntil: null }), 4, BEFORE)).toBeNull();
    expect(checkResumeAt(row({ checkResumableUntil: "soon" }), 4, BEFORE)).toBeNull();
  });

  it("is nowhere without a place", () => {
    expect(checkResumeAt(row({ checkPosition: null }), 4, BEFORE)).toBeNull();
    expect(checkResumeAt(row({ checkPosition: -1 }), 4, BEFORE)).toBeNull();
    expect(checkResumeAt(row({ checkPosition: 1.5 }), 4, BEFORE)).toBeNull();
    expect(checkResumeAt(null, 4, BEFORE)).toBeNull();
  });

  it("is the first question when it was left there", () => {
    expect(checkResumeAt(row({ checkPosition: 0 }), 4, BEFORE)).toBe(0);
  });

  it("is the result when every question was answered", () => {
    expect(checkResumeAt(row({ checkPosition: 4 }), 4, BEFORE)).toBe(4);
  });

  it("is nowhere past the end - the check has changed since", () => {
    expect(checkResumeAt(row({ checkPosition: 5 }), 4, BEFORE)).toBeNull();
  });

  it("is read off the lesson session too, which has no status (B82)", () => {
    const session = { checkPosition: 2, checkResumableUntil: UNTIL };

    expect(checkResumeAt(session, 4, BEFORE)).toBe(2);
    expect(checkResumeAt(session, 4, AFTER)).toBeNull();
  });

  it("is nowhere for a lesson already completed", () => {
    expect(checkResumeAt(row({ status: "completed" }), 4, BEFORE)).toBeNull();
  });
});

const attempt = (
  questionId: string,
  answer: unknown,
  correct: boolean | null,
  attemptNumber = 1,
  source: "assessment" | "checkpoint" = "assessment",
) =>
  ({
    questionId,
    answer,
    correct,
    attemptNumber,
    source,
  }) as LessonQuestionAttempt;

const question = (id: string) => ({
  id,
  options: [
    { id: "2", label: "Two", value: 2 },
    { id: "3", label: "Three", value: 3 },
  ],
});
const QUESTIONS = [question("cp-1"), question("cp-2"), question("cp-3")];

describe("what had been answered before", () => {
  it("refills the picks from the stored answers, matched on the value", () => {
    const out = answersBefore(
      [attempt("cp-1", 3, false), attempt("cp-2", 2, true)],
      QUESTIONS,
      2,
    );

    expect(out.picks).toEqual([
      { questionIndex: 0, selectedId: "3" },
      { questionIndex: 1, selectedId: "2" },
    ]);
  });

  it("counts nothing: whether anything landed is the server's word (B98)", () => {
    const out = answersBefore(
      [attempt("cp-1", 2, true), attempt("cp-2", 3, false)],
      QUESTIONS,
      2,
    );

    expect(Object.keys(out)).toEqual(["picks"]);
  });

  it("takes the newest answer to a question", () => {
    const out = answersBefore(
      [attempt("cp-1", 3, false, 1), attempt("cp-1", 2, true, 2)],
      QUESTIONS,
      1,
    );

    expect(out.picks).toEqual([{ questionIndex: 0, selectedId: "2" }]);
  });

  it("reads only the after-lesson check's answers, and only before the point", () => {
    const out = answersBefore(
      [
        // An inline check sharing an id is not this check's answer.
        attempt("cp-1", 2, true, 1, "checkpoint"),
        // Past the point it reopens at: not answered "before".
        attempt("cp-3", 2, true),
      ],
      QUESTIONS,
      2,
    );

    expect(out.picks).toEqual([]);
  });

  it("reads nothing before the first question", () => {
    expect(answersBefore([attempt("cp-1", 2, true)], QUESTIONS, 0)).toEqual({
      picks: [],
    });
  });
});
