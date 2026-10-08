"use client";

import { useRouter } from "next/navigation";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useStudentLesson } from "@/hooks/useStudentLesson";
import { useHydrated } from "@/hooks/useHydrated";
import { LessonLoadingSkeleton } from "./LessonLoadingSkeleton";
import { LessonMessage } from "./LessonMessage";
import { LessonNotOpened } from "./LessonNotOpened";
import { LessonSummaryScreen } from "./LessonSummaryScreen";
import { ReviewAnswersScreen } from "./ReviewAnswersScreen";

/**
 * The two screens that come AFTER a lesson: its summary, and its answers.
 *
 * Both routes resolved `getMockLesson(lessonId)` and `notFound()` on anything
 * else — so they worked for exactly the two authored demo lessons and dropped
 * every real one out of the app onto "This page doesn't exist". That was
 * survivable only because nothing linked to them: `LessonPlayer` gates "See
 * summary" on `lesson.summary`, which no real lesson carried.
 *
 * It carries one now. So this had to be built in the same change as the recap
 * mapping, or the first child to finish a real lesson would have been handed a
 * button that 404s.
 *
 * IT DOES NOT ADAPT. `useAdaptation` posts `mode: "lesson_load"`, and firing
 * that from the summary would tell the engine a child has just started a lesson
 * they have just finished — a fabricated signal about their learning. Gating on
 * `live` would not catch it, because a real lesson's summary is live.
 *
 * The states are `LessonRoute`'s, deliberately: a child who cannot open their
 * summary should meet the same words as a child who cannot open the lesson.
 */
const LESSONS_HREF = "/student/lessons";

export function LessonEndingRoute({
  lessonId,
  screen,
}: {
  lessonId: string;
  screen: "summary" | "review";
}) {
  const router = useRouter();
  const { lesson, live, loading, failed, empty } = useStudentLesson(lessonId, {
    adapt: false,
  });
  const hydrated = useHydrated();

  // The server cannot read the token, so it cannot know whether this lesson
  // resolves. Draw the skeleton rather than deciding wrongly.
  if (!hydrated || loading) return <LessonLoadingSkeleton />;

  /*
   * THE SUMMARY ROUTE APPLIES THE PLAYER'S OWN GATE.
   *
   * `LessonPlayer` offers "See summary" only when `lesson.summary` exists, so
   * from inside the app this screen is unreachable without one. The ROUTE had
   * no such gate: typed, bookmarked, or opened from a link, it rendered
   * `LessonSummaryScreen` for any lesson at all - and every block in that
   * screen is `summary?.…`, so a lesson without one drew a page of headings
   * with nothing under them.
   *
   * "Isn't ready yet" is the truthful version of that, and it is the message
   * this route already uses for a lesson with no segments. Review is NOT
   * gated the same way: it reads the child's own answers, not the summary.
   */
  if (lesson && screen === "summary" && !lesson.summary) {
    return (
      <LessonMessage
        title="This lesson isn’t ready yet"
        body="There’s no summary for it yet. Your teacher will know when there is."
        actionLabel="Back to my lessons"
        onAction={() => router.push(LESSONS_HREF)}
      />
    );
  }

  if (lesson) {
    const view =
      screen === "summary" ? (
        <LessonSummaryScreen lesson={lesson} />
      ) : (
        <ReviewAnswersScreen lesson={lesson} live={live} />
      );
    /*
     * `live` false means one of the two authored lessons, which only a
     * SIGNED-OUT visitor can now reach. The mark is what an end-to-end run
     * asserts the absence of once signed in.
     */
    return live ? (
      view
    ) : (
      <SampleRegion kind={`student:lesson-${screen}`}>{view}</SampleRegion>
    );
  }

  if (failed) {
    return (
      <LessonMessage
        title="We couldn’t open this just now"
        body="It hasn’t gone anywhere. Give it a moment and try again."
        actionLabel="Try again"
        onAction={() => window.location.reload()}
        onBack={() => router.push(LESSONS_HREF)}
      />
    );
  }

  /*
   * No lesson, and the read did not fail — it 404'd, or it arrived with no
   * segments. Either way there is nothing to summarise, and the child is told
   * that in their own words rather than dropped onto the app's "This page
   * doesn't exist", which is written for a developer and has no way back in.
   * The 404 is the lesson route's own D90 screen, so the two cannot drift.
   */
  if (!empty) {
    return <LessonNotOpened onBack={() => router.push(LESSONS_HREF)} />;
  }
  return (
    <LessonMessage
      title="This lesson isn’t ready yet"
      body="Nevo is still getting it set up. Your teacher will know when it’s ready."
      actionLabel="Back to my lessons"
      onAction={() => router.push(LESSONS_HREF)}
    />
  );
}
