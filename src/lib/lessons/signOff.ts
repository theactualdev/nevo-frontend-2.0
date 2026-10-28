import { lessonsApi } from "@/lib/api/lessons";

/**
 * ASSIGN WAITS FOR THE LESSON-WIDE SIGN-OFF (Lydia, 25 Oct): "Assigning a
 * lesson whose media and checks have not been approved puts unreviewed content
 * in front of children, which is the thing all of this exists to prevent."
 *
 * The sign-off is the server's `reviewComplete` on `GET /lessons/{id}/review`,
 * and it is only there. The library list carries no such field, so the two
 * doors that pick a lesson from the list - the assign wizard and the
 * recommend sheet - ask the review of each lesson they are about to send,
 * and only those.
 *
 * Only a lesson the server says is NOT signed off is held. A review that could
 * not be read holds nothing: refusing a teacher over our own outage is worse
 * than letting the server refuse with a reason, the rule the lesson page
 * already keeps.
 */
export async function awaitingSignOff(lessonIds: string[]): Promise<Set<string>> {
  const answers = await Promise.all(
    lessonIds.map((id) =>
      Promise.resolve()
        .then(() => lessonsApi.review(id))
        .then((review) => (review.reviewComplete === false ? id : null))
        .catch(() => null),
    ),
  );
  return new Set(answers.filter((id): id is string => id !== null));
}

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
