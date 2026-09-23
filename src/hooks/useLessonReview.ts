"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lessonsApi, type KeyPoint, type LessonReview } from "@/lib/api/lessons";

/**
 * The review a teacher does on their own lesson (SCRUM-153).
 *
 * THE UNIT IS THE KEY POINT. This hook's predecessor settled a SEGMENT, and
 * that was a contract fact rather than a preference: `needsReview` was a
 * property of a segment, `POST .../segments/{id}/approve` approved a segment,
 * and `textVariant.keyPoints` carried no per-point state or confidence at all.
 * Backend shipped the real thing on 21 Sep - a key point is a row now, with
 * `sourceText`, a measured `confidence` and a `reviewState` - so the fallback
 * goes and the ticket's own unit takes over.
 *
 * NOTHING HERE COUNTS ANYTHING. `outstandingCount` and `readyToAssign` are the
 * server's, and each of the three actions returns the WHOLE review, so the
 * count and the moment Assign comes alive arrive with the action that caused
 * them. Backend asked for this by name: *"enable Assign on `readyToAssign`,
 * not by counting the list yourself. Client and server disagreeing about ready
 * is how this started."*
 *
 * A LESSON IS ALSO HELD BY A FLAGGED SEGMENT NOBODY APPROVED, and that half is
 * not in this payload - `readyToAssign` accounts for it, the key point list
 * does not. So the section review still exists beside this one, and `refresh`
 * is what a segment approval calls to bring `readyToAssign` back in step.
 *
 * WHAT A FAILED READ MEANS. Not "outstanding". A screen that blocked Assign
 * because it could not reach the review would be refusing a teacher over our
 * own outage, and the server refuses an assignment it is not ready for
 * anyway - with a 409 that names what is left. So an unknown review does not
 * block; it is the one case where the door stays open.
 */

export type KeyPointAction = "accept" | "amend" | "remove";

export interface LessonReviewState {
  /** Every key point, in the order the lesson makes them. */
  keyPoints: KeyPoint[];
  /** The server's count of what is still holding this lesson. */
  outstanding: number;
  /** The server's answer to whether this can go to a class. */
  ready: boolean;
  /** This lesson had something to settle at some point in this visit. */
  hadReview: boolean;
  loading: boolean;
  /** The review could not be read. Distinct from "nothing to review". */
  failed: boolean;
  /** The key point with an action in flight, and which action. */
  working: { id: string; action: KeyPointAction } | null;
  /** The key point whose action did not land. */
  actionFailed: string | null;
  accept: (keyPointId: string) => void;
  amend: (keyPointId: string, text: string) => void;
  remove: (keyPointId: string) => void;
  /** Re-read, after something outside this hook changed the review. */
  refresh: () => void;
}

export function useLessonReview(
  lessonId: string,
  /**
   * Called once, when the last thing holding this lesson is settled.
   *
   * LR-05 is "a quiet state change plus the SCRUM-152 system message", and
   * this is the half that tells the screen the moment arrived. It fires from
   * the ACTION's own response - not from an effect watching `ready` - so it
   * cannot fire on a re-read that merely reports a lesson already ready, and
   * a teacher opening a settled lesson is not congratulated for work they did
   * last week.
   */
  onBecameReady?: () => void,
): LessonReviewState {
  const [review, setReview] = useState<LessonReview | null>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped by `refresh`, which is the only way to re-run the read. */
  const [nonce, setNonce] = useState(0);
  const [working, setWorking] = useState<{
    id: string;
    action: KeyPointAction;
  } | null>(null);
  const [actionFailed, setActionFailed] = useState<string | null>(null);
  /**
   * Whether this lesson EVER had something to settle, kept across the moment
   * the last one is settled.
   *
   * Without it, finishing the review makes the whole section vanish and a
   * teacher is left wondering what they just did. LR-05 wants a quiet state
   * change, not a disappearance.
   */
  const [hadReview, setHadReview] = useState(false);

  /** What the last answer said, so a transition can be told from a repeat. */
  const wasReady = useRef<boolean | null>(null);

  const adopt = useCallback(
    (next: LessonReview, fromAction = false) => {
      setReview(next);
      if (next.outstandingCount > 0) setHadReview(true);
      const before = wasReady.current;
      wasReady.current = next.readyToAssign;
      // Only a real crossing, and only one a teacher caused.
      if (fromAction && next.readyToAssign && before === false) {
        onBecameReady?.();
      }
    },
    [onBecameReady],
  );

  useEffect(() => {
    let cancelled = false;
    void lessonsApi
      .review(lessonId)
      .then((res) => {
        if (cancelled) return;
        adopt(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, nonce, adopt]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  /**
   * One shape for all three, because they ARE one shape: send it, adopt the
   * review that comes back, and on a refusal say so beside the card without
   * touching what is on screen. Nothing about the lesson has changed when an
   * action fails, so nothing about the lesson should move.
   */
  const act = useCallback(
    (
      keyPointId: string,
      action: KeyPointAction,
      call: () => Promise<LessonReview>,
    ) => {
      if (working) return;
      setWorking({ id: keyPointId, action });
      setActionFailed(null);
      void call()
        .then((res) => {
          setWorking(null);
          adopt(res, true);
        })
        .catch(() => {
          setWorking(null);
          setActionFailed(keyPointId);
        });
    },
    [working, adopt],
  );

  const accept = useCallback(
    (id: string) =>
      act(id, "accept", () => lessonsApi.acceptKeyPoint(lessonId, id)),
    [act, lessonId],
  );

  const amend = useCallback(
    (id: string, text: string) =>
      act(id, "amend", () => lessonsApi.amendKeyPoint(lessonId, id, text)),
    [act, lessonId],
  );

  const remove = useCallback(
    (id: string) =>
      act(id, "remove", () => lessonsApi.removeKeyPoint(lessonId, id)),
    [act, lessonId],
  );

  return {
    keyPoints: review?.keyPoints ?? [],
    outstanding: review?.outstandingCount ?? 0,
    // Unknown is not "not ready" - see the note at the top.
    ready: review ? review.readyToAssign : true,
    hadReview,
    loading: review === null && !failed,
    failed,
    working,
    actionFailed,
    accept,
    amend,
    remove,
    refresh,
  };
}
