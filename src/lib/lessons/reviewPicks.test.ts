import { describe, expect, it } from "vitest";
import type { LessonQuestionAttempt } from "@/lib/api/lessons";
import { mergePicks, picksFromAttempts } from "./reviewPicks";

/**
 * Review Answers, read from the account rather than the tab (audit 61).
 *
 * The picks lived in sessionStorage only, so the same child opening the same
 * review on another visit or another tablet was shown no picks at all. The
 * account has held every answer since 1 Oct; this is how they come back.
 */

const attempt = (
  questionId: string,
  answer: unknown,
  submittedAt: string,
  attemptNumber = 1,
  source: "assessment" | "checkpoint" = "assessment",
) =>
  ({
    questionId,
    answer,
    submittedAt,
    attemptNumber,
    source,
  }) as LessonQuestionAttempt;

const question = (id?: string) => ({
  id,
  options: [
    { id: "2", label: "Two", value: 2 },
    { id: "3", label: "Three", value: 3 },
  ],
});
const QUESTIONS = [question("cp-1"), question("cp-2")];
const MON = "2026-10-05T09:00:00Z";
const TUE = "2026-10-06T09:00:00Z";

describe("the picks the account holds", () => {
  it("are matched to the lesson's options on the value that was stored", () => {
    expect(
      picksFromAttempts(
        [attempt("cp-1", 3, MON), attempt("cp-2", 2, MON)],
        QUESTIONS,
      ),
    ).toEqual([
      { questionIndex: 0, selectedId: "3" },
      { questionIndex: 1, selectedId: "2" },
    ]);
  });

  it("are the newest answer to each question, across visits", () => {
    // Monday's run, then Tuesday's on another tablet. The review shows
    // Tuesday's, whichever order the rows arrive in.
    expect(
      picksFromAttempts(
        [attempt("cp-1", 2, TUE), attempt("cp-1", 3, MON)],
        QUESTIONS,
      ),
    ).toEqual([{ questionIndex: 0, selectedId: "2" }]);
    expect(
      picksFromAttempts(
        [attempt("cp-1", 3, MON), attempt("cp-1", 2, TUE)],
        QUESTIONS,
      ),
    ).toEqual([{ questionIndex: 0, selectedId: "2" }]);
  });

  it("break a tie in time on the attempt number", () => {
    expect(
      picksFromAttempts(
        [attempt("cp-1", 2, MON, 2), attempt("cp-1", 3, MON, 1)],
        QUESTIONS,
      ),
    ).toEqual([{ questionIndex: 0, selectedId: "2" }]);
  });

  it("are only the after-lesson check's", () => {
    // An inline quick check sharing an id is not this check's answer.
    expect(
      picksFromAttempts([attempt("cp-1", 2, MON, 1, "checkpoint")], QUESTIONS),
    ).toEqual([]);
  });

  it("say nothing where nothing can be matched", () => {
    expect(
      picksFromAttempts(
        [attempt("cp-1", 9, MON), attempt("", 2, MON)],
        [question("cp-1"), question()],
      ),
    ).toEqual([]);
  });
});

describe("the account's picks and this tab's", () => {
  it("lets this tab fill a question the account has no answer for yet", () => {
    // The last answer's write can still be on its way when the review opens.
    expect(
      mergePicks(
        [{ questionIndex: 0, selectedId: "a" }],
        [
          { questionIndex: 0, selectedId: "b" },
          { questionIndex: 1, selectedId: "c" },
        ],
      ),
    ).toEqual([
      { questionIndex: 0, selectedId: "a" },
      { questionIndex: 1, selectedId: "c" },
    ]);
  });
});
