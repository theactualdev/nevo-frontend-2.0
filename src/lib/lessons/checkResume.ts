import {
  LESSON_STATUS,
  type LessonProgressResponse,
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
 *   - WHERE: `checkPosition` on the progress row, written by the exit.
 *   - WHAT WAS ANSWERED: the stored `assessment` attempts for the session.
 *
 * Same day only. "A check finished a week later is measuring something else."
 */

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
  row:
    | Pick<
        LessonProgressResponse,
        "status" | "checkPosition" | "checkResumableUntil"
      >
    | null
    | undefined,
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
 * `landed` is how many of those the SERVER marked right, so the result does
 * not tell a child who got the first two right before leaving that nothing
 * landed. NULL WHEN IT CANNOT BE KNOWN: a question with no stored verdict
 * (the write failed, or it could not be marked) might have been right, so a
 * zero would be a claim. Any right answer is known for certain, though, so a
 * count above zero stands whatever else is missing.
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
  landed: number | null;
} {
  const picks: { questionIndex: number; selectedId: string }[] = [];
  let landed = 0;
  let unknown = false;
  questions.slice(0, at).forEach((question, questionIndex) => {
    const newest = attempts
      .filter((a) => a.source === "assessment" && a.questionId === question.id)
      .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
    if (!question.id || !newest || typeof newest.correct !== "boolean") {
      unknown = true;
    } else if (newest.correct) {
      landed += 1;
    }
    const option = newest
      ? question.options.find(
          (o) => o.value !== undefined && o.value === newest.answer,
        )
      : undefined;
    if (option) picks.push({ questionIndex, selectedId: option.id });
  });
  return { picks, landed: landed > 0 || !unknown ? landed : null };
}
