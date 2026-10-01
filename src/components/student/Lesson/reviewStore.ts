import { getSession } from "@/lib/auth/session";

/**
 * Bridges the after-lesson assessment (in the immersive player) to the Review
 * Answers screen (a separate in-shell route). The player records which option
 * the student picked per question; the review screen reads it back to show
 * "your answer" vs the correct one.
 *
 * sessionStorage (not context) so it survives the route change from the bare
 * player to the in-shell review, and is naturally scoped to the tab/session.
 *
 * ONE CHILD'S PICKS. This was keyed by lesson alone, and sessionStorage
 * outlives signing out on the same tab - so on a shared tablet the next child
 * to open the same lesson's review was shown the last child's answers as their
 * own. Keyed by account now; a signed-out visitor (the designed walkthrough)
 * has a shelf of their own that no signed-in child reads.
 *
 * TODO(api): `GET /api/v1/lessons/{id}/attempts` now returns a child's own
 * marked answers, per account and server-side (`lessonsApi.attempts`). Swap
 * this for that read once the player writes them - see the docblock there.
 */
export interface ReviewAnswer {
  questionIndex: number;
  selectedId: string;
}

const key = (lessonId: string) =>
  `nevo:review:${getSession()?.userId ?? "signed-out"}:${lessonId}`;

export function saveReviewAnswers(
  lessonId: string,
  answers: ReviewAnswer[],
): void {
  try {
    sessionStorage.setItem(key(lessonId), JSON.stringify(answers));
  } catch {
    // ignore unavailable storage
  }
}

export function loadReviewAnswers(lessonId: string): ReviewAnswer[] {
  try {
    const raw = sessionStorage.getItem(key(lessonId));
    return raw ? (JSON.parse(raw) as ReviewAnswer[]) : [];
  } catch {
    return [];
  }
}
