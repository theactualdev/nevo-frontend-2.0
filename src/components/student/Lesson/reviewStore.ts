import { getSession } from "@/lib/auth/session";
import type { CheckOutcome } from "@/lib/lessons/checkOutcome";

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

/**
 * THE CHECK-IN'S OUTCOME, CARRIED TO THE SUMMARY (B26).
 *
 * It arrives on the completion write's answer and on nothing else: no read in
 * the contract returns it, and the summary is its own route. So the player
 * keeps the server's answer here, the same way it keeps the picks, and the
 * summary's "From the check-in" reads it back. Per child, for the same reason
 * the picks are.
 *
 * Opened anywhere else - another tablet, another day - there is nothing here,
 * and the section is simply not drawn (rule 5). A read that carried it would
 * let the summary say it everywhere; that is raised with backend.
 */
const outcomeKey = (lessonId: string) =>
  `nevo:check-outcome:${getSession()?.userId ?? "signed-out"}:${lessonId}`;

/** Keep the outcome, or forget it with `null` when a new check begins. */
export function saveCheckOutcome(
  lessonId: string,
  outcome: CheckOutcome | null,
): void {
  try {
    if (outcome) {
      sessionStorage.setItem(outcomeKey(lessonId), JSON.stringify(outcome));
    } else {
      sessionStorage.removeItem(outcomeKey(lessonId));
    }
  } catch {
    // ignore unavailable storage
  }
}

export function loadCheckOutcome(lessonId: string): CheckOutcome | null {
  try {
    const raw = sessionStorage.getItem(outcomeKey(lessonId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    const { mastered, revisit, note } = parsed as Partial<CheckOutcome>;
    const names = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((n): n is string => typeof n === "string")
        : [];
    return {
      mastered: names(mastered),
      revisit: names(revisit),
      note: typeof note === "string" ? note : "",
    };
  } catch {
    return null;
  }
}
