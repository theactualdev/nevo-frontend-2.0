"use client";

import { useCallback, useMemo, useState } from "react";
import { lessonsApi, type LessonSegment } from "@/lib/api/lessons";

/**
 * The review a teacher does on their own lesson (SCRUM-153).
 *
 * WHAT THIS EXISTS FOR. Assignment is gated on every section being approved,
 * and until now the only screen that could approve one was the variant review,
 * reachable from a link inside a row. A teacher who uploaded a lesson was told
 * it needed a review, told to do it on a page that does not exist, and had no
 * way to assign their own lesson. It stopped a demonstration on 19 September.
 *
 * THE UNIT IS THE SECTION, NOT THE KEY POINT, and that is a contract fact
 * rather than a preference. SCRUM-153 rules that only low-confidence key
 * points need settling, but `needsReview` and `reviewReasons` are properties
 * of a SEGMENT, `POST .../segments/{id}/approve` approves a segment, and
 * `textVariant.keyPoints` carries no per-point state or confidence at all.
 * Raised with backend; until a key point can carry its own signal, a teacher
 * settles a section.
 *
 * COUNTS COME FROM THE SERVER, never from counting what is on screen. The
 * approve response returns `approvedSegmentCount`, `segmentCount` and
 * `lessonApproved`, so the remaining count and the moment assignment unlocks
 * are the server's answer - which matters because the 409 gate that refuses
 * an assignment is the same server's answer, and a screen that disagreed with
 * it would unlock a button that then fails.
 */

export interface SegmentReview {
  /** Sections still waiting, in the order they appear in the lesson. */
  outstanding: LessonSegment[];
  /** How many are left. Server's count once anything has been approved. */
  remaining: number;
  /** Every section is approved: the lesson can go to students. */
  ready: boolean;
  /** The section currently being sent, so its own control can say so. */
  approving: string | null;
  /** The section whose approval did not land. */
  failed: string | null;
  approve: (segmentId: string) => void;
  /** Has this section been approved, counting what we have just done? */
  isApproved: (segment: LessonSegment) => boolean;
}

export function useSegmentReview(
  lessonId: string,
  segments: LessonSegment[],
): SegmentReview {
  const [justApproved, setJustApproved] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** The server's own tally, once it has given us one. */
  const [serverCounts, setServerCounts] = useState<{
    approved: number;
    total: number;
    lessonApproved: boolean;
  } | null>(null);

  const isApproved = useCallback(
    (segment: LessonSegment) => segment.approved || justApproved.has(segment.id),
    [justApproved],
  );

  const outstanding = useMemo(
    () => segments.filter((s) => !isApproved(s)),
    [segments, isApproved],
  );

  const approve = useCallback(
    (segmentId: string) => {
      if (approving) return;
      setApproving(segmentId);
      setFailed(null);
      void lessonsApi
        .approveSegment(lessonId, segmentId)
        .then((res) => {
          setApproving(null);
          setJustApproved((prev) => new Set(prev).add(segmentId));
          setServerCounts({
            approved: res.approvedSegmentCount,
            total: res.segmentCount,
            lessonApproved: res.lessonApproved,
          });
        })
        .catch(() => {
          // The section is still outstanding and the gate still holds. Saying
          // so beside the control is the whole of the recovery: nothing about
          // the lesson has changed.
          setApproving(null);
          setFailed(segmentId);
        });
    },
    [approving, lessonId],
  );

  return {
    outstanding,
    // The server's tally wins where we have one. Before that, the count is
    // the sections this page was handed - which is the same number, and is
    // what a teacher is looking at.
    remaining: serverCounts
      ? Math.max(0, serverCounts.total - serverCounts.approved)
      : outstanding.length,
    ready: serverCounts ? serverCounts.lessonApproved : outstanding.length === 0,
    approving,
    failed,
    approve,
    isApproved,
  };
}
