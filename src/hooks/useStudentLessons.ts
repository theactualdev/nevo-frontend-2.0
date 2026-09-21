"use client";

import { useMemo } from "react";

import type {
  LessonStatus,
  LessonSummary,
} from "@/components/student/Lessons/lessonCatalog";
import { isOpenToStudent } from "@/lib/lessons/availability";
import { useStudentDashboard } from "./useStudentDashboard";

/**
 * The lessons a student actually has, for the Lessons tab.
 *
 * SOURCE. Not `GET /api/content/lessons` - that is the school's whole parsed
 * library, which is the teacher's view of the world. A child's Lessons tab is
 * THEIR lessons, and the only endpoint that knows which those are is
 * `GET /api/v1/students/me/dashboard`. It carries the assignments with each
 * lesson summary nested, and the student's own recent progress, which is
 * exactly the two halves this screen needs. Home already reads it, so this
 * costs no extra call.
 *
 * WHAT THE CONTRACT CANNOT ANSWER, corrected 21 Sep. This said assignments
 * carry no subject and no time estimate, and both halves were out of date: the
 * nested `LessonSummaryResponse` has carried `subject` since 31 Aug and
 * `estimatedMinutes` since 1 Sep, checked against the deployed spec rather
 * than against this comment. They are read now, so a signed-in child's list
 * groups by subject like the designed one and says how long a lesson is.
 *
 * What the contract still cannot answer is the "what you'll do" description -
 * nothing writes one for a child, and a generated stand-in would be us
 * describing a lesson we have not read. The preview still omits it.
 *
 * STATUS is real, though, and that matters: it comes from the student's own
 * progress rows, so the filter chips filter on something true instead of on a
 * fixture's invented state. `exited` reads as in-progress - a child who left
 * partway has started it, whatever the backend calls that.
 */

/** Backend `LessonCompletionStatus` -> the calm indicator the cards draw. */
function statusFrom(raw: string | undefined): LessonStatus {
  if (raw === "completed") return "completed";
  if (raw === "in_progress" || raw === "exited") return "in_progress";
  return "not_started";
}

export interface StudentLessons {
  lessons: LessonSummary[];
  /** Signed in and reading live data - fixtures must not show. */
  live: boolean;
  loading: boolean;
  failed: boolean;
}

export function useStudentLessons(): StudentLessons {
  const { data, failed, loading } = useStudentDashboard();

  // Memoised so the array identity is stable between renders - callers put it
  // straight into a `useMemo`, and a fresh array every render defeats theirs.
  const lessons = useMemo<LessonSummary[]>(() => {
    if (!data) return [];

    // Newest row per lesson wins; the feed is not guaranteed to be ordered.
    const latest = new Map<string, (typeof data.recentProgress)[number]>();
    for (const row of data.recentProgress) {
      const held = latest.get(row.lessonId);
      if (!held || Date.parse(row.updatedAt) > Date.parse(held.updatedAt)) {
        latest.set(row.lessonId, row);
      }
    }

    /*
     * A cancelled assignment is not this child's lesson, and one that opens on
     * Friday is not yet. Neither was filtered here at all - this was a bare
     * `.map`, so every assignment the dashboard returned became a card.
     *
     * It matters more on this screen than on Home, because the Lessons tab is
     * the child's whole list: the empty state ("nothing has been assigned yet")
     * is gated on this array, so a child whose only assignment was cancelled
     * was never told their list was empty - they were shown the cancelled
     * lesson instead.
     */
    return data.assignments
      .filter((a) => isOpenToStudent(a))
      .map<LessonSummary>((a) => {
        const row = latest.get(a.lesson.id);
        const status = statusFrom(row?.status);
        const count = a.lesson.segmentCount;
        /*
         * ZERO AND ABSENT BOTH MEAN "NO ESTIMATE", and neither may be drawn as
         * "0 min". `estimatedMinutes` is floored per content type, so a real
         * lesson is never 0 - which makes 0 (its schema default) indisputably
         * the unset case rather than a very short lesson.
         *
         * "About" because it is a planning figure estimated from word count at
         * a school reading pace, not a measurement of this child. The segment
         * count stays as the fallback: it is the honest thing to say when
         * nobody has estimated anything.
         */
        const minutes = a.lesson.estimatedMinutes;
        const timeEstimate =
          minutes && minutes > 0
            ? `About ${minutes} min`
            : `${count} ${count === 1 ? "section" : "sections"}`;
        // Free text from the staged upload routes, so it is shown as written
        // or not at all - blank is not a subject.
        const subject = a.lesson.subject?.trim();
        // Coarse on purpose, like Home: whether segmentPosition is 0- or
        // 1-based is unstated, so this may be off by a segment. It drives a
        // bar, never a number shown to a child.
        const progress =
          status === "in_progress" && row && count > 0
            ? Math.max(0, Math.min(1, row.segmentPosition / count))
            : undefined;

        return {
          id: a.lesson.id,
          lessonId: a.lesson.id,
          title: a.lesson.title,
          timeEstimate,
          ...(subject ? { subject } : {}),
          status,
          ...(progress !== undefined ? { progress } : {}),
        };
      });
  }, [data]);

  if (!data) return { lessons, live: false, loading, failed };
  return { lessons, live: true, loading: false, failed: false };
}
