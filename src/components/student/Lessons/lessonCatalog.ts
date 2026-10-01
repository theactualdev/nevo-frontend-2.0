import { BookOpen, Calculator, Leaf, type LucideIcon } from "lucide-react";
import { FIRST_LESSON_ID } from "@/lib/mocks";

/** Where a student is with a lesson (shown as a calm indicator, never a %). */
export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface LessonSummary {
  id: string;
  title: string;
  /**
   * Absent on live lessons: assignments carry no subject, so the list renders
   * ungrouped and the preview omits the chip rather than guessing one.
   */
  subject?: string;
  /** Adaptive time estimate — personalised per learner (backend later). */
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
   * The playable lesson this routes to. TODO(api): every summary carries its own
   * real lesson; for now they all open the one built lesson.
   */
  lessonId: string;
  /**
   * The set work this card came from, when it came from one. The preview's
   * Start carries it as `?assignment=`, exactly as a Home card's link did
   * before Today's cards opened the preview. Absent is the truth for a lesson
   * that was never assigned.
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
 * Historic note, since it explains the shape below. This once read "replace with
 * `GET /api/content/lessons`. Subject grouping, status and adaptive estimates
 * have no source there - the teacher library hides its subject filter for
 * exactly that reason - so those still need somewhere to come from.
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
