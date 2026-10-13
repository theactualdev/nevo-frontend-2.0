/**
 * The authored lessons the signed-out walkthrough plays, and their plans. Each
 * lesson lives in its own file; this maps ids → content/plan.
 *
 * A signed-in child never gets one of these. `useStudentLesson` reads their
 * lesson from `GET /api/content/lessons/{id}` and their plan from
 * `intelligenceApi.getAdaptation`, and a failed read is shown as a failure,
 * not answered with the authored lesson of the same id.
 */
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { PHOTOSYNTHESIS, PHOTOSYNTHESIS_PLAN } from "./photosynthesis";
import { ADDING_FRACTIONS, ADDING_FRACTIONS_PLAN } from "./adding-fractions";

const LESSONS: Record<string, Lesson> = {
  [PHOTOSYNTHESIS.id]: PHOTOSYNTHESIS,
  [ADDING_FRACTIONS.id]: ADDING_FRACTIONS,
};

const PLANS: Record<string, AdaptationPlan> = {
  [PHOTOSYNTHESIS_PLAN.lessonId]: PHOTOSYNTHESIS_PLAN,
  [ADDING_FRACTIONS_PLAN.lessonId]: ADDING_FRACTIONS_PLAN,
};

/** An authored lesson by id, for the signed-out walkthrough. */
export function getMockLesson(lessonId: string): Lesson | null {
  return LESSONS[lessonId] ?? null;
}

/** Mock stand-in for `intelligenceApi.getAdaptation`. */
export function getMockAdaptation(lessonId: string): AdaptationPlan | null {
  return PLANS[lessonId] ?? null;
}

/**
 * The lesson a signed-out visitor is sent into after onboarding and the
 * warm-up - see `useNextLessonHref`.
 */
export const FIRST_LESSON_ID = PHOTOSYNTHESIS.id;
