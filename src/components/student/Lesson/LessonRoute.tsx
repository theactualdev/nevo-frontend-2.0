"use client";

import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHydrated } from "@/hooks/useHydrated";
import { useStudentLesson } from "@/hooks/useStudentLesson";
import { LessonError } from "./LessonError";
import { LessonLoadingSkeleton } from "./LessonLoadingSkeleton";
import { LessonMessage } from "./LessonMessage";
import { LessonNotOpened } from "./LessonNotOpened";
import { LessonPlayer } from "./LessonPlayer";
import { useLessonExit } from "./LessonExit";

const LESSONS_HREF = "/student/lessons";

/**
 * When a not-yet-open lesson opens, said plainly, or nothing at all.
 *
 * A date the child can act on is worth giving. But `availableFrom` is nullable
 * and can be unparseable, and a line reading "It opens on Invalid Date" is
 * worse than a line that simply does not promise a day - so the sentence
 * shrinks rather than guesses.
 */
function opensLine(opensAt: string | null): string {
  const when = opensAt ? new Date(opensAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return "Your teacher has set it for later on. It will be here when it opens.";
  }
  const day = when.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `Your teacher has set it for ${day}. It will be here then.`;
}

/**
 * Resolves a lesson route, live first.
 *
 * Same shape as the teacher side's `LessonRoute`, and for the same two
 * reasons. A real lesson is only ever itself, so the live read is tried before
 * the mock registry - a lesson must never be answered with a fixture that
 * happens to share its id. And nothing that reads the token may decide before
 * the client is running: `getToken()` is false on the server, so deciding
 * early made a real lesson answer HTTP 404 on any hard load.
 *
 * The copy differs, because the reader does. A child is told what happened in
 * their own language and always has a way back to their lessons - never a bare
 * error, never a technical one, and never a page that blames them.
 */
export function LessonRoute({
  lessonId,
  assignmentId,
  review = false,
  reviewConceptId,
}: {
  lessonId: string;
  /** The assignment this open came from, when it came from one. */
  assignmentId?: string;
  /** Spaced-retrieval variant (37d) - the same player, different framing. */
  review?: boolean;
  /** Which concept this review is for, from the due-review chip. */
  reviewConceptId?: string;
}) {
  // Leaving goes wherever this lesson was opened from - see `useLessonExit`.
  const exitTo = useLessonExit();
  const {
    lesson,
    live,
    plan,
    loading,
    failed,
    empty,
    resumeAt,
    lastWorkedAt,
    adaptSegments,
    unavailable,
    opensAt,
    placeUnknown,
    fromShelf,
    finished,
  } = useStudentLesson(lessonId);
  const hydrated = useHydrated();

  // The server cannot read the token, so it cannot yet know whether this
  // lesson resolves. Draw the skeleton rather than deciding wrongly.
  if (!hydrated || loading) return <LessonLoadingSkeleton />;

  /*
   * A LESSON THE TEACHER CALLED OFF, OR ONE THAT HAS NOT OPENED YET.
   *
   * Before the lesson branch, because the lesson loads perfectly well - it is
   * the child's permission to do it that is missing, not the content. A
   * cancelled lesson played identically to a live one and wrote the child's
   * progress against it.
   *
   * The two reasons are told apart on purpose. "Your teacher took this off your
   * list" and "this opens on Friday" are different facts, and only the second
   * gives a child something to do about it. Neither blames them, and both keep
   * the way back to their lessons that every state on this screen carries.
   *
   * Nothing is said about the work they may already have done: cancelling
   * removes what is ahead, and a child's record of what they finished is still
   * theirs. The summary and review screens are deliberately NOT gated for the
   * same reason.
   */
  if (unavailable === "cancelled") {
    return (
      <LessonMessage
        title="This one isn’t on your list any more"
        body="Your teacher took it off. Anything you already did on it is still saved."
        actionLabel="Back to my lessons"
        onAction={() => exitTo(LESSONS_HREF)}
      />
    );
  }
  if (unavailable === "not_yet") {
    return (
      <LessonMessage
        title="This one isn’t open yet"
        body={opensLine(opensAt)}
        actionLabel="Back to my lessons"
        onAction={() => exitTo(LESSONS_HREF)}
      />
    );
  }

  /*
   * THE LESSON LOADED AND THE CHILD'S PLACE IN IT DID NOT.
   *
   * Both are what the first frame is made of - the lesson is what it shows,
   * the dashboard is where it opens and whether it may - so with one of them
   * missing this is a load that failed, and it says so in the same words.
   * Opening anyway put `in_progress, 0` over the child's real place on the
   * first frame, and played a lesson their teacher may have called off.
   *
   * Not for a review, which writes no position and is not gated. Not for a
   * lesson opened from the offline shelf either: offline, the dashboard was
   * never going to answer, and the child saved it so it would open. That one
   * opens without writing where it opened - see `placeUnknown` on the player.
   */
  if (lesson && placeUnknown && !fromShelf && !review) {
    return (
      <LessonError
        onRetry={() => window.location.reload()}
        onGoBack={() => exitTo(LESSONS_HREF)}
      />
    );
  }

  if (lesson) {
    const player = (
      <LessonPlayer
        assignmentId={assignmentId}
        lesson={lesson}
        plan={plan}
        live={live}
        finished={finished}
        review={review}
        reviewConceptId={reviewConceptId}
        startAt={resumeAt ?? 0}
        placeUnknown={placeUnknown}
        lastWorkedAt={lastWorkedAt}
        adaptSegments={adaptSegments}
      />
    );
    // `live` false means this is one of the two authored lessons, which now
    // only a SIGNED-OUT visitor can reach: `useStudentLesson` no longer answers
    // a failed or 404'd read with a mock of the same id, so a signed-in child
    // gets the honest failure below instead of invented content. The mark stays
    // regardless - it is what an end-to-end run asserts the absence of.
    return live ? (
      player
    ) : (
      <SampleRegion kind="student:lesson">{player}</SampleRegion>
    );
  }

  // The player frame's own error state, in its own words: the system owns
  // the failure and the child is told plainly it was nothing they did.
  if (failed) {
    return (
      <LessonError
        onRetry={() => window.location.reload()}
        onGoBack={() => exitTo(LESSONS_HREF)}
      />
    );
  }

  if (empty) {
    return (
      <LessonMessage
        title="This lesson isn’t ready yet"
        body="Nevo is still getting it set up. Your teacher will know when it’s ready."
        actionLabel="Back to my lessons"
        onAction={() => exitTo(LESSONS_HREF)}
      />
    );
  }

  /*
   * Nothing resolved it. Either the live read said 404, or there was no read
   * to make - a signed-out visitor on an id the mock registry does not hold.
   *
   * Said here, in frame 28's D90 screen, rather than by `notFound()`. That
   * dropped the child onto the app's "This page doesn't exist", which is
   * written for a developer and whose only button is `router.back()` - off the
   * site entirely on a reload or a QR arrival.
   */
  return <LessonNotOpened onBack={() => exitTo(LESSONS_HREF)} />;
}
