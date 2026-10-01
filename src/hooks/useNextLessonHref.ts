"use client";

import { useHasSession } from "./useHasSession";
import { isOpenToStudent } from "@/lib/lessons/availability";
import { lessonHref } from "@/lib/lessons/lessonHref";
import { useStudentDashboard } from "./useStudentDashboard";
import { FIRST_LESSON_ID } from "@/lib/mocks";

/**
 * Where "start your lesson" should actually go.
 *
 * Two screens hand a child into a lesson - the end of onboarding
 * ("You're In") and the end of the daily warm-up - and both had written the
 * same expression:
 *
 *     assigned ? real : dashboard ? "/student/lessons" : FIRST_LESSON_ID
 *
 * The intent was "signed out gets the demo lesson, because the whole of
 * onboarding is the designed walkthrough in that state". But `dashboard` is
 * the `data` of a live read, and `data === null` covers IN FLIGHT as well as
 * signed out. So a real child who tapped the button before their dashboard
 * landed - which is most of them, on the exact screen that fires immediately
 * after account creation - was sent to the mock photosynthesis lesson instead
 * of their own work.
 *
 * That is this codebase's most-repeated defect (a hook's `data === null`
 * standing in for "no session"), so the decision lives in ONE place now rather
 * than being written out a third time. Being signed in is what separates a
 * child from a visitor; the read's progress never was.
 *
 * A signed-in child with no assignment goes to their lessons list, which says
 * plainly that nothing is set yet. That is true while the read is still in
 * flight and true after it fails, which is why it is safe to send them there
 * without waiting.
 */
export function useNextLessonHref(): string {
  const signedIn = useHasSession();
  const { data } = useStudentDashboard();

  // Signed out: the designed walkthrough, where the demo lesson is the point.
  if (!signedIn) return `/student/lessons/${FIRST_LESSON_ID}`;

  /*
   * This read `a.status !== "completed"`, which can never be false -
   * `AssignmentStatus` is "assigned" | "cancelled". So the button took the
   * FIRST assignment whatever its state, and could hand a child straight into
   * a lesson their teacher had called off, or one that opens on Friday. It is
   * the button at the end of onboarding and after the warm-up, so it is the
   * first lesson many children ever open.
   */
  const assigned = data?.assignments.find((a) => isOpenToStudent(a));
  // With the assignment it came from - see `lessonHref`.
  return assigned
    ? lessonHref(assigned.lesson.id, assigned.id)
    : "/student/lessons";
}
