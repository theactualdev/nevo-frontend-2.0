import { lessonsApi } from "@/lib/api/lessons";

/**
 * WHAT HOLDS ASSIGN, and how that changed on 2 Nov.
 *
 * Lydia, 25 Oct: "Assigning a lesson whose media and checks have not been
 * approved puts unreviewed content in front of children". So Assign waited
 * for the lesson-wide sign-off, the server's `reviewComplete`, at every door.
 *
 * Lydia, 2 Nov, revised: "unreviewed generated questions are simply not
 * served until approved". The checks stop holding Assign, because nothing
 * unreviewed reaches a child either way. Teslim's b0e0a4f is the server's
 * half: `canAssign` on the library list and the lesson read, `readyToAssign`
 * on the review without the checks, and the assignment guard on
 * `readyToAssign`. Key points, guiding questions and rewrites still hold it.
 *
 * WHICH SERVER IS THIS. `canAssign` arrives with that change and not before,
 * so its presence is the one honest signal that the split has happened. A
 * server without it still refuses an assignment the full review hasn't
 * signed (deploy order, Lydia 31 Oct: the client works with both).
 */
export function splitsAssignable(
  lesson: { canAssign?: boolean | null } | null | undefined,
): boolean {
  return typeof lesson?.canAssign === "boolean";
}

/**
 * Whether the full sign-off still GATES Assign, for the doors that read the
 * review: the lesson page, the upload finish and the review's last step. Where
 * the server has split them, `readyToAssign` - the gate those doors already
 * take - is the whole answer, and the sign-off is only part of the sentence.
 */
export function signOffGates(
  lesson: { canAssign?: boolean | null } | null | undefined,
): boolean {
  return !splitsAssignable(lesson);
}

/**
 * A library card the list doors (the assign wizard, the recommend sheet) may
 * offer. `canAssign` where the server sends it; before that, the rule they
 * kept since 25 Oct - only a lesson the server says is NOT signed off is held,
 * and an unread sign-off holds nothing.
 */
export function assignable(card: {
  canAssign?: boolean | null;
  reviewComplete?: boolean | null;
}): boolean {
  return typeof card.canAssign === "boolean"
    ? card.canAssign
    : card.reviewComplete !== false;
}

/**
 * Of the lessons about to be sent, the ones the server would refuse - asked
 * of each lesson's review at the moment of sending, because a verdict can
 * lapse after the list was read (new pictures or guiding questions arrive).
 *
 * `split` says which server: where it has split assignable from fully
 * reviewed, a lesson is held when its `readyToAssign` is false, which is what
 * its guard checks; before that, when its `reviewComplete` is false.
 *
 * A review that could not be read holds nothing: refusing a teacher over our
 * own outage is worse than letting the server refuse with a reason, the rule
 * the lesson page already keeps.
 */
export async function awaitingSignOff(
  lessonIds: string[],
  split = false,
): Promise<Set<string>> {
  const answers = await Promise.all(
    lessonIds.map((id) =>
      Promise.resolve()
        .then(() => lessonsApi.review(id))
        .then((review) =>
          (split ? review.readyToAssign === false : review.reviewComplete === false)
            ? id
            : null,
        )
        .catch(() => null),
    ),
  );
  return new Set(answers.filter((id): id is string => id !== null));
}

/**
 * Under a list that leaves out lessons that can't be sent yet. It said
 * "Lessons you haven't finished reviewing", which stopped being true once a
 * lesson with only its checks to review can be assigned and IS listed.
 */
export const UNREVIEWED_LEFT_OFF =
  "Lessons that can’t be assigned yet aren’t listed here. Review them from your library first.";

/** Where a lesson is reviewed (C07k). */
export const reviewHrefFor = (lessonId: string) =>
  `/teacher/lessons/${lessonId}/review`;

/** The line under an Assign that waits on the review and nothing else. */
export const REVIEW_TO_ASSIGN = "Review this lesson to assign it.";

/**
 * The rest of the wizard's sentence after the lessons' names: "Photosynthesis
 * isn’t reviewed yet...", "Photosynthesis and Osmosis aren’t...".
 */
export function notReviewedTail(count: number): string {
  return count === 1
    ? " isn’t reviewed yet, so it can’t be assigned. Review it first, or untick it."
    : " aren’t reviewed yet, so they can’t be assigned. Review them first, or untick them.";
}
