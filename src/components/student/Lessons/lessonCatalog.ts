import { BookOpen, Calculator, Leaf, type LucideIcon } from "lucide-react";
import { FIRST_LESSON_ID } from "@/lib/mocks";

/** Where a student is with a lesson (shown as a calm indicator, never a %). */
export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface LessonSummary {
  id: string;
  title: string;
  /**
   * On a live lesson, the subject its upload recorded - free text, nullable on
   * the nested summary. Absent when there is none, and then the list puts the
   * lesson in an unheaded group and the preview omits the chip rather than
   * guessing one.
   */
  subject?: string;
  /**
   * How long the lesson takes, as the card prints it. On a live lesson it is
   * the summary's `estimatedMinutes` ("About 12 min"), a planning figure and
   * not a measure of this child, or the section count when there is none -
   * see `useStudentLessons`.
   */
  timeEstimate: string;
  status: LessonStatus;
  /**
   * Plain-language "what you'll do", shown in the preview. On a live lesson it
   * is the summary's own `description` (1 Oct), and absent when that is null -
   * a generated stand-in would be us describing a lesson we have not read.
   */
  description?: string;
  /** 0–1 through the lesson, when `in_progress`. */
  progress?: number;
  /**
   * The playable lesson this routes to. A live card opens its own lesson; the
   * signed-out fixtures each open one of the two authored lessons.
   */
  lessonId: string;
  /**
   * The assignment this card was built from. The preview's Start carries it
   * as `?assignment=`. Absent on the fixtures, which no teacher set, and on
   * a lesson that was never assigned.
   */
  assignmentId?: string;
}

/** Subject → icon for the card/preview. */
export const SUBJECT_ICON: Record<string, LucideIcon> = {
  Mathematics: Calculator,
  English: BookOpen,
  Science: Leaf,
};

/**
 * The Lessons Tab's SIGNED-OUT catalogue - the designed screen's content, and
 * no longer pending work: a signed-in child's list comes from their own
 * assignments via `useStudentLessons`. Kept because the walkthrough needs it.
 *
 * That list does not come from `GET /api/content/lessons`, which is the
 * school's whole library. `useStudentLessons` says why, and where each field
 * of a live card comes from.
 */
export const LESSON_CATALOG: LessonSummary[] = [
  {
    id: "adding-fractions",
    title: "Adding Fractions",
    subject: "Mathematics",
    timeEstimate: "About 12 min",
    status: "in_progress",
    progress: 0.55,
    description:
      "Learn how to add fractions with the same bottom number, using pictures of pizza and chocolate bars.",
    lessonId: "adding-fractions",
  },
  {
    id: "telling-the-time",
    title: "Telling the Time",
    subject: "Mathematics",
    timeEstimate: "About 10 min",
    status: "not_started",
    description:
      "Read clocks to the hour and half-hour, and match them to what happens in your day.",
    lessonId: FIRST_LESSON_ID,
  },
  {
    id: "counting-in-5s",
    title: "Counting in 5s",
    subject: "Mathematics",
    timeEstimate: "About 8 min",
    status: "completed",
    description:
      "Skip-count in fives and spot the pattern that makes bigger numbers easier.",
    lessonId: FIRST_LESSON_ID,
  },
  {
    id: "the-lighthouse",
    title: "The Lighthouse",
    subject: "English",
    timeEstimate: "About 15 min",
    status: "not_started",
    description:
      "Read a short story about a lighthouse keeper and spot the describing words along the way.",
    lessonId: FIRST_LESSON_ID,
  },
  {
    id: "rhyming-words",
    title: "Rhyming Words",
    subject: "English",
    timeEstimate: "About 9 min",
    status: "completed",
    description:
      "Find words that end with the same sound and use them to finish some silly rhymes.",
    lessonId: FIRST_LESSON_ID,
  },
  {
    id: "photosynthesis",
    title: "What is Photosynthesis?",
    subject: "Science",
    timeEstimate: "About 14 min",
    status: "not_started",
    description:
      "See how green plants make their own food from sunlight, water and air.",
    lessonId: FIRST_LESSON_ID,
  },
];
