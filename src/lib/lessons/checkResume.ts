import {
  LESSON_STATUS,
  type LessonQuestionAttempt,
} from "@/lib/api/lessons";
import type { AssessmentQuestion } from "@/lib/types";

/**
 * Picking the after-lesson check up where a child left it (B49, design D36).
 *
 * Two facts, from two places, because neither can stand in for the other -
 * backend's words: "the attempts are the record of what was answered, and the
 * position is the place in the list, which attempts cannot tell you because a
 * skipped question leaves no attempt behind."
 *
 *   - WHERE: `checkPosition`, written by the exit. Read back on the dashboard's
 *     progress row, on the session the player opens (both B82, 8 Oct), and on
 *     a progress write's answer.
 *   - WHAT WAS ANSWERED: the stored `assessment` attempts for the session.
 *
 * Same day only. "A check finished a week later is measuring something else."
 */

/**
 * Anything that says where a check was left: a progress row (the dashboard's
 * or a write's answer), or the lesson session. A session has no `status`.
 */
export interface CheckLeft {
  status?: string;
  checkPosition?: number | null;
  checkResumableUntil?: string | null;
}

/**
 * The question to reopen the check on, or null to start it fresh.
 *
 * WALL CLOCK, DELIBERATELY. Rule 4 is about timings sent to the engine; this
 * sends nothing. It compares now with a moment the SERVER named - the end of
 * the day the check started - which is exactly why the server names it: two
 * tablets reading "today" off their own clocks would disagree about when a
 * check has lapsed, and the contract ruled that out. Nothing here decides
 * what a day is.
 *
 * A position equal to the question count is a check with every question
 * answered and its result not yet seen, so it reopens on the result. Past the
 * end is a check re-authored since it was left, and starts fresh.
 */
export function checkResumeAt(
  row: CheckLeft | null | undefined,
  questionCount: number,
  now: number = Date.now(),
): number | null {
  if (!row || row.status === LESSON_STATUS.COMPLETED) return null;
  const at = row.checkPosition;
  if (typeof at !== "number" || !Number.isInteger(at) || at < 0) return null;
  if (at > questionCount) return null;
  const until = row.checkResumableUntil
    ? Date.parse(row.checkResumableUntil)
    : Number.NaN;
  if (Number.isNaN(until)) return null;
  return now < until ? at : null;
}

/**
 * What the child had already answered before the point a check reopens at,
 * read back from their stored attempts.
 *
 * `picks` refill Review Answers, which reads them off the device - the
 * answers given before the exit were given on another visit, maybe another
 * tablet. Matched on the option's own value, which is what was stored.
 *
 * NO COUNT OF WHAT LANDED any more. This also counted how many the server
 * marked right, so the result could say whether anything landed; whether
 * anything landed is the server's own `resultState` since B98 (8 Oct), so
 * nothing here adds the marks up.
 *
 * The newest attempt per question speaks for it: that is the answer given in
 * this run of the check.
 */
export function answersBefore(
  attempts: readonly LessonQuestionAttempt[],
  questions: readonly Pick<AssessmentQuestion, "id" | "options">[],
  at: number,
): {
  picks: { questionIndex: number; selectedId: string }[];
} {
  const picks: { questionIndex: number; selectedId: string }[] = [];
  questions.slice(0, at).forEach((question, questionIndex) => {
    const newest = attempts
      .filter((a) => a.source === "assessment" && a.questionId === question.id)
      .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
    const option = newest
      ? question.options.find(
          (o) => o.value !== undefined && o.value === newest.answer,
        )
      : undefined;
    if (option) picks.push({ questionIndex, selectedId: option.id });
  });
  return { picks };
}
