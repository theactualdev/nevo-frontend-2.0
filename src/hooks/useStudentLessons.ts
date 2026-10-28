"use client";

import { useEffect, useMemo } from "react";

import type {
  LessonStatus,
  LessonSummary,
} from "@/components/student/Lessons/lessonCatalog";
import { unavailableReason } from "@/lib/lessons/availability";
import { isFinishedRow } from "@/lib/lessons/finishedRow";
import { onHeldProgressLanded } from "@/lib/lessons/pendingProgress";
import { segmentPlace } from "@/lib/lessons/segmentPlace";
import { useStudentAssignments } from "./useStudentAssignments";
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
 * EXCEPT FINISHED WORK, which the dashboard leaves out. So the child's full
 * assignment list is read beside it (`useStudentAssignments`), and a lesson
 * they finished stays on their list under Completed (22 Oct production run).
 *
 * WHAT THE CONTRACT CANNOT ANSWER, corrected 21 Sep. This said assignments
 * carry no subject and no time estimate, and both halves were out of date: the
 * nested `LessonSummaryResponse` has carried `subject` since 31 Aug and
 * `estimatedMinutes` since 1 Sep, checked against the deployed spec rather
 * than against this comment. They are read now, so a signed-in child's list
 * groups by subject like the designed one and says how long a lesson is.
 *
 * The "what you'll do" line followed on 1 Oct: the nested summary carries a
 * nullable `description`, read as given. Null still means the preview has no
 * line, never one we composed about a lesson we have not read.
 *
 * STATUS is real, though, and that matters: it comes from the student's own
 * progress rows, so the filter chips filter on something true instead of on a
 * fixture's invented state. `exited` reads as in-progress - a child who left
 * partway has started it, whatever the backend calls that.
 */

/**
 * The child's progress row -> the calm indicator the cards draw. A row
 * carrying `completedAt` is finished whatever its status says (Teslim, 21
 * Oct) - see `isFinishedRow` - so it files under Completed, with the card's
 * own check and "Look again", and no new words.
 */
function statusFrom(
  row: Parameters<typeof isFinishedRow>[0],
): LessonStatus {
  if (isFinishedRow(row)) return "completed";
  const raw = row?.status;
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
  const { data, failed, loading, refresh } = useStudentDashboard();
  // Read again once anything this device held reaches the server, so a
  // completion that lands after the first read still files under Completed.
  // See `onHeldProgressLanded`.
  useEffect(() => onHeldProgressLanded(refresh), [refresh]);
  /*
   * AND EVERY ASSIGNMENT, FINISHED ONES INCLUDED - which the dashboard leaves
   * out (22 Oct production run: a child whose only lesson was finished read
   * "Your lessons will show up here soon"). A supplement only: the dashboard
   * alone still decides loading and failure, so this read never holds the
   * tab or fails it. See `useStudentAssignments`.
   */
  const { data: everyAssignment } = useStudentAssignments();

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
     *
     * A FINISHED ONE STAYS, under Completed. Not `isOpenToStudent`, which
     * means "still to do" and so drops it - this is the child's whole list.
     */
    /*
     * THE DASHBOARD'S ASSIGNMENTS, AND THE ONES IT LEAVES OUT: the full list's
     * by assignment id, where the dashboard's own entry stands when both carry
     * it. The filter below is the same for both, so a cancelled one, or one
     * not open yet, stays out whichever read brought it.
     */
    const onDashboard = new Set(data.assignments.map((a) => a.id));
    const assignments = [
      ...data.assignments,
      ...(everyAssignment ?? []).filter((a) => !onDashboard.has(a.id)),
    ];

    const cards = assignments
      .filter((a) => unavailableReason(a) === null)
      .map<LessonSummary>((a) => {
        const row = latest.get(a.lesson.id);
        // The assignment's own `completed` wins. The progress feed is recent
        // activity, not a full history, so a lesson finished a while ago may
        // have no row left in it - and read "Not started".
        const status =
          a.status === "completed" ? "completed" : statusFrom(row);
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
        const description = a.lesson.description?.trim();
        // THE TRUE FRACTION, FROM THE ROW ALONE (backend B51). Position and
        // count arrive together on the progress row, so neither is borrowed
        // from the summary. Only for a lesson still part-way: a finished one
        // wears its check, never a full ring.
        const place = status === "in_progress" ? segmentPlace(row) : null;

        return {
          id: a.lesson.id,
          lessonId: a.lesson.id,
          // Which set work this card is, so opening it files progress there
          // and shows the teacher's note - see `lessonHref`.
          assignmentId: a.id,
          title: a.lesson.title,
          timeEstimate,
          ...(subject ? { subject } : {}),
          ...(description ? { description } : {}),
          ...(place ? { place } : {}),
          status,
        };
      });

    /*
     * UNTIL THE FULL LIST HAS ANSWERED - or when it could not be read - a
     * finished lesson is still known from the child's own progress row, so it
     * is filed under Completed from that: a row that `isFinishedRow`, for a
     * lesson no dashboard assignment names (one that does was decided above,
     * cancelled included). Its title and subject are the row's own (B52), as
     * Home's library pick-up reads them; a row with no title is left off, as
     * there. Its length is the row's section count, or nothing when the row
     * does not say. No assignment rides its link, since none is known.
     */
    const fromRows: LessonSummary[] = everyAssignment
      ? []
      : [...latest.values()]
          .filter((row) => isFinishedRow(row))
          .filter((row) => !data.assignments.some((a) => a.lesson.id === row.lessonId))
          .flatMap((row) => {
            const title = row.title?.trim();
            if (!title) return [];
            const subject = row.subject?.trim();
            const count = row.segmentCount ?? 0;
            return [
              {
                id: row.lessonId,
                lessonId: row.lessonId,
                title,
                timeEstimate:
                  count > 0
                    ? `${count} ${count === 1 ? "section" : "sections"}`
                    : "",
                ...(subject ? { subject } : {}),
                status: "completed" as const,
              },
            ];
          });

    // ONE CARD A LESSON. A lesson can be set for a child more than once, and
    // the two reads overlap; the first card for a lesson stands, so the
    // dashboard's comes before the full list's and both before a row's.
    const seen = new Set<string>();
    return [...cards, ...fromRows].filter((card) => {
      if (seen.has(card.lessonId)) return false;
      seen.add(card.lessonId);
      return true;
    });
  }, [data, everyAssignment]);

  if (!data) return { lessons, live: false, loading, failed };
  return { lessons, live: true, loading: false, failed: false };
}
