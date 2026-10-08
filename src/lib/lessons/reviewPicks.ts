import type { LessonQuestionAttempt } from "@/lib/api/lessons";
import type { AssessmentQuestion } from "@/lib/types";

/** One question's pick, as Review Answers draws it. */
export interface ReviewPick {
  questionIndex: number;
  selectedId: string;
}

/**
 * The child's picks for the after-lesson check, read back from the answers
 * the account holds (`GET /api/v1/lessons/{id}/attempts`), so Review Answers
 * shows them on another visit or another tablet.
 *
 * Every session's answers, not one: the review is its own route and does not
 * know which visit the check ran on, and a check picked up where it was left
 * (B49) spans two. The newest answer to a question speaks for it - by when the
 * server took it, then by its attempt number within a session.
 *
 * Matched on the option's own value, which is what was stored (`attemptFor`).
 * A question with no id, or an answer that matches no option the lesson still
 * has, has no pick: nothing here can say what was chosen.
 */
export function picksFromAttempts(
  attempts: readonly LessonQuestionAttempt[],
  questions: readonly Pick<AssessmentQuestion, "id" | "options">[],
): ReviewPick[] {
  const picks: ReviewPick[] = [];
  questions.forEach((question, questionIndex) => {
    if (!question.id) return;
    const newest = attempts
      .filter((a) => a.source === "assessment" && a.questionId === question.id)
      .sort(
        (a, b) =>
          Date.parse(b.submittedAt) - Date.parse(a.submittedAt) ||
          b.attemptNumber - a.attemptNumber,
      )[0];
    const option = newest
      ? question.options.find(
          (o) => o.value !== undefined && o.value === newest.answer,
        )
      : undefined;
    if (option) picks.push({ questionIndex, selectedId: option.id });
  });
  return picks;
}

/**
 * The account's picks, with the device's filling only the questions the
 * account has no answer for.
 *
 * WHY THE DEVICE STILL COUNTS. Each answer is written as it is given, fire and
 * forget, and "Review answers" opens the moment the last one is given - so the
 * read can arrive before the last write has landed, and a write that failed
 * never lands at all. The device knows those picks for certain: this child
 * made them in this tab. Where both know a question, the account's answer is
 * the record and wins; the device's copy is only ever this tab's.
 */
export function mergePicks(
  account: readonly ReviewPick[],
  device: readonly ReviewPick[],
): ReviewPick[] {
  const known = new Set(account.map((p) => p.questionIndex));
  return [...account, ...device.filter((p) => !known.has(p.questionIndex))];
}
