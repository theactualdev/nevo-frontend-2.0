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

/**
 * How a review actually went (`ReviewOutcome`, B28). A REPORT OF WHAT
 * HAPPENED, NOT A MARK: right first time, right after a hint, right on a
 * second try, or not recalled. The contract's own reason for it is the point -
 * a bare `recallSuccessful` made the client decide what "all right first
 * time" meant. Whether each counts as recall is decided server-side.
 */
export type ReviewOutcome =
  | "first_time"
  | "after_hint"
  | "second_attempt"
  | "not_recalled";

/**
 * `RecordReviewResponse`. Typed now - it was `unknown`, which hid that the
 * schedule (and its `nextReviewDue`) has always come back on the write.
 *
 * `recallSuccessful` here is the SERVER's verdict on the outcome sent, not an
 * echo of anything the client decided.
 */
export interface RecordReviewResponse {
  schedule: ConceptSchedule;
  recallSuccessful: boolean;
  outcome?: ReviewOutcome | null;
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
   * IT SENDS `outcome` NOW, NOT `recallSuccessful` (B28). The four values are
   * what the screen observed about the questions tagged with the concept under
   * review - see `lib/lessons/reviewOutcome.ts`. Not whether they eventually
   * passed - a missed inline check re-opens until it is passed, so "passed" is
   * true of everyone by the end. Not the whole assessment either: a review is
   * spaced retrieval on ONE concept. `recallSuccessful` is optional on the
   * request and no longer sent, because the server derives it.
   *
   * Not sent at all when the review asked nothing about that concept. There is
   * no evidence either way, and a cheerful outcome because the child reached
   * the end is precisely the invented signal Zero-Tag exists to stop.
   */
  recordReview: (body: {
    studentId: string;
    conceptId: string;
    outcome: ReviewOutcome;
  }) =>
    api.post<RecordReviewResponse>("/api/scheduler/record-review", body),
};
