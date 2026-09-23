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
 * THE UNIT IS THE SECTION, NOT THE KEY POINT, and that WAS a contract fact
 * rather than a preference. SCRUM-153 rules that only low-confidence key
 * points need settling, but `needsReview` and `reviewReasons` are properties
 * of a SEGMENT, `POST .../segments/{id}/approve` approves a segment, and
 * `textVariant.keyPoints` carried no per-point state or confidence at all.
 * Raised with backend.
 *
 * BACKEND ANSWERED ON 21 SEP, AND THIS HOOK IS NOW THE SMALLER HALF OF THE
 * TICKET - not its fallback. `useLessonReview` beside it settles key points,
 * which is the ticket's own unit; this settles the OTHER thing that holds a
 * lesson back. Backend's ruling, in its own words: *"outstanding now means a
 * segment Nevo itself flagged and nobody approved, OR an ungrounded key
 * point. A lesson nobody doubted assigns with no clicking."*
 *
 * So both survive, and neither is the gate. `readyToAssign` is, and it is the
 * only thing that sees both halves - which is why `approve` takes a callback:
 * settling the last SECTION moves a verdict that lives in the other read.
 *
 * COUNTS COME FROM THE SERVER, never from counting what is on screen. The
 * approve response returns `approvedSegmentCount`, `segmentCount` and
 * `lessonApproved`, so the remaining count is the server's answer. `ready`
 * here is now only about sections; the screen asks `readyToAssign`.
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
  /**
   * Approve one section.
   *
   * `onApproved` exists because this is no longer the whole review: a
   * lesson is also held by an ungrounded key point, and `readyToAssign` -
   * which accounts for both - lives in a different read. Without a callback
   * the teacher settles the last section and Assign stays grey until they
   * reload.
   */
  approve: (segmentId: string, onApproved?: () => void) => void;
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

  /**
   * The sections a teacher can actually settle here: the ones NEVO FLAGGED
   * and nobody has approved.
   *
   * This counted every unapproved segment, which stopped being what
   * "outstanding" means when backend re-ruled it on 21 Sep - *"a segment Nevo
   * itself flagged and nobody approved, or an ungrounded key point"*. Only
   * flagged sections are drawn, so counting the rest produced a number with
   * no cards behind it, and QA met it as a lesson that could not be assigned
   * after everything on screen was done.
   */
  const outstanding = useMemo(
    () => segments.filter((s) => s.needsReview && !isApproved(s)),
    [segments, isApproved],
  );

  const approve = useCallback(
    (segmentId: string, onApproved?: () => void) => {
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
          onApproved?.();
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
    /*
     * COUNTED FROM THE CARDS, and that is an inversion worth stating.
     *
     * This used the approve response's `segmentCount - approvedSegmentCount`,
     * on the principle that the server's tally beats ours. That principle is
     * right for the GATE and wrong for this number: the server's tally is of
     * every segment, and this sentence is about the cards in front of the
     * teacher. Two different questions that happened to share a word.
     *
     * So: the verdict is `readyToAssign`, always. The count is what is on
     * screen, always. Neither borrows from the other.
     */
    remaining: outstanding.length,
    ready: serverCounts ? serverCounts.lessonApproved : outstanding.length === 0,
    approving,
    failed,
    approve,
    isApproved,
  };
}
