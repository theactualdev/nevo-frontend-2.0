import { api } from "./client";

/**
 * Spaced-review scheduling (`/api/scheduler/*`, Bearer).
 *
 * The scheduler owns WHEN a concept should be seen again. Until now the whole
 * group was unread by this frontend: the review-session route existed and could
 * render a lesson as a review variant, but nothing ever told a child a concept
 * was ready.
 *
 * A DUE CONCEPT OPENS ONLY WHERE THE SCHEDULE NAMES A LESSON. Each row carries
 * a nullable `lessonId` (below); where it is null the concept is due but has
 * nothing to open, and guessing a lesson from the shared subject would be
 * inventing the link. `useDueReviews` keeps the two apart.
 *
 * `POST /api/scheduler/record-review` is the write side, and the review
 * session calls it once at the end - see `recordReview` for what it may say.
 */

export interface ConceptSchedule {
  studentId: string;
  conceptId: string;
  /**
   * Spacing-engine parameters. Typed because the contract sends them, and
   * NEVER rendered - a number against a child's recall is the same
   * diagnostic-shaped measurement the Zero-Tag ruling bars elsewhere.
   */
  stability: number;
  difficulty: number;
  retrievability: number;
  lastReview: string;
  reviewCount: number;
  nextReviewDue: string;
  /**
   * The lesson that can actually be played for this concept, when one is
   * linked (backend, 3 Sep). Null where the concept has no playable lesson -
   * so a review can be DUE without being openable, and a caller must check
   * rather than assume a route exists.
   */
  lessonId: string | null;
}

export const schedulerApi = {
  /** Concepts the scheduler judges ready for another look. */
  dueReviews: (studentId: string) =>
    api.get<ConceptSchedule[]>(`/api/scheduler/due-reviews/${studentId}`),

  /**
   * Tell the scheduler how the review went. `POST /api/scheduler/record-review`.
   *
   * This was deliberately unwired, and the reason given was that `recallSuccessful`
   * needs a question and there was none to ask. That expired when the library
   * gained lessons carrying `comprehensionCheckpoints` and a four-question
   * assessment: a review session now asks, and the answers are marked.
   *
   * WHAT `recallSuccessful` IS ALLOWED TO MEAN HERE. Only the child's FIRST
   * answer to the questions tagged with the concept under review. Not whether
   * they eventually passed - a missed inline check re-opens until it is passed,
   * so "passed" is true of everyone by the end and would report perfect recall
   * for a child who got everything wrong twice. Not the whole assessment
   * either: a review is spaced retrieval on ONE concept, and crediting it with
   * a question about a different one is the same invention in a smaller shape.
   *
   * Not sent at all when the review asked nothing about that concept. There is
   * no evidence either way, and a cheerful `true` because the child reached the
   * end is precisely the invented signal Zero-Tag exists to stop.
   */
  recordReview: (body: {
    studentId: string;
    conceptId: string;
    recallSuccessful: boolean;
  }) => api.post<unknown>("/api/scheduler/record-review", body),
};
