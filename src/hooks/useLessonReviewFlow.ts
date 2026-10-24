"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import {
  lessonsApi,
  type LessonDetailResponse,
  type LessonModule,
  type LessonReview,
  type MissingKeyPointWrite,
} from "@/lib/api/lessons";
import { mediaApi } from "@/lib/api/media";
import { getToken } from "@/lib/auth/session";

/**
 * C07k's reads and writes (Lydia's redesign and Teslim's contract, 19 Oct).
 *
 * TWO READS, because the review carries the key points and the sign-offs but
 * not the rewrites themselves: those are on the lesson's segments. Every write
 * returns the whole review, so nothing here counts or decides anything; a
 * rewrite edit also re-reads the lesson, because that is where its new
 * wording lives (backend: "reload the lesson detail to read the persisted
 * body").
 *
 * THE ONE PRESS SIGNS WHAT WAS SHOWN. Each approval sends back the content
 * hash of the read the teacher was looking at. If the lesson moved underneath
 * them the server answers 409 `review_content_changed`; this re-reads both and
 * says so, rather than retrying with the new hash - that would sign material
 * nobody has seen, which is the thing the hash exists to prevent.
 */

export type ReviewWork =
  | "keyPoints"
  | "rewrites"
  | `point:${string}`
  | `missing:${string}`
  | `rewrite:${string}:${string}`
  | "media"
  | `retry:${string}`;

export interface LessonReviewFlowState {
  lesson: LessonDetailResponse | null;
  modules: LessonModule[];
  review: LessonReview | null;
  loading: boolean;
  missing: boolean;
  failed: boolean;
  /** The write in flight, so its own control can say so. */
  working: ReviewWork | null;
  /** The write that did not land, and the server's reason when it gave one. */
  refused: { work: ReviewWork; message: string | null } | null;
  /** The lesson changed under an approval, and what is shown is the new one. */
  changed: boolean;
  approveKeyPoints: () => Promise<boolean>;
  approveRewrites: () => Promise<boolean>;
  amendPoint: (keyPointId: string, text: string) => Promise<boolean>;
  resolveMissing: (segmentId: string, write: MissingKeyPointWrite) => Promise<boolean>;
  editRewrite: (
    segmentId: string,
    variant: "simplified" | "expanded",
    body: string,
  ) => Promise<boolean>;
  /**
   * Step 1's one press: the flagged items are sent back to be made again,
   * then everything else shown is approved. Remakes go first and a refused one
   * stops the press, so a teacher's flag is never overridden by the approval.
   */
  approveMedia: (approve: string[], remake: string[]) => Promise<boolean>;
  /** Try a failed picture or recording again. */
  retryMedia: (mediaId: string) => Promise<boolean>;
}

export function useLessonReviewFlow(lessonId: string): LessonReviewFlowState {
  const [lesson, setLesson] = useState<LessonDetailResponse | null>(null);
  const [review, setReview] = useState<LessonReview | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState<ReviewWork | null>(null);
  const [refused, setRefused] = useState<LessonReviewFlowState["refused"]>(null);
  const [changed, setChanged] = useState(false);

  const readLesson = useCallback(
    () => lessonsApi.detail(lessonId).then(setLesson),
    [lessonId],
  );

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    Promise.all([lessonsApi.detail(lessonId), lessonsApi.review(lessonId)])
      .then(([detail, read]) => {
        if (cancelled) return;
        setLesson(detail);
        setReview(read);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 422)) {
          setMissing(true);
        } else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const act = useCallback(
    async (
      work: ReviewWork,
      call: () => Promise<LessonReview>,
      after?: () => Promise<unknown>,
    ): Promise<boolean> => {
      if (working) return false;
      setWorking(work);
      setRefused(null);
      try {
        const next = await call();
        setReview(next);
        setChanged(false);
        if (after) await after().catch(() => {});
        return true;
      } catch (err: unknown) {
        const detail = err instanceof ApiError ? err.detail : undefined;
        if (apiErrorCode(detail) === "review_content_changed") {
          await Promise.all([lessonsApi.review(lessonId).then(setReview), readLesson()]).catch(
            () => {},
          );
          setChanged(true);
        } else {
          setRefused({ work, message: apiErrorMessage(detail) });
        }
        return false;
      } finally {
        setWorking(null);
      }
    },
    [working, lessonId, readLesson],
  );

  const approveKeyPoints = useCallback(
    () =>
      act("keyPoints", () =>
        lessonsApi.approveAllKeyPoints(lessonId, review?.keyPointsContentHash ?? ""),
      ),
    [act, lessonId, review?.keyPointsContentHash],
  );

  const approveRewrites = useCallback(
    () =>
      // The segments carry each rewrite's review stamp, so they are re-read
      // with the sign-off rather than left saying "pending".
      act(
        "rewrites",
        () => lessonsApi.approveAllRewrites(lessonId, review?.rewritesContentHash ?? ""),
        readLesson,
      ),
    [act, lessonId, review?.rewritesContentHash, readLesson],
  );

  const amendPoint = useCallback(
    (keyPointId: string, text: string) =>
      act(`point:${keyPointId}`, () => lessonsApi.amendKeyPoint(lessonId, keyPointId, text)),
    [act, lessonId],
  );

  const resolveMissing = useCallback(
    (segmentId: string, write: MissingKeyPointWrite) =>
      act(`missing:${segmentId}`, () =>
        lessonsApi.resolveMissingKeyPoint(lessonId, segmentId, write),
      ),
    [act, lessonId],
  );

  const editRewrite = useCallback(
    (segmentId: string, variant: "simplified" | "expanded", body: string) =>
      act(
        `rewrite:${segmentId}:${variant}`,
        () => lessonsApi.editRewrite(lessonId, segmentId, variant, body),
        readLesson,
      ),
    [act, lessonId, readLesson],
  );

  /*
   * Approving media writes the picture or recording onto its section, and a
   * remake or an approval changes what the key-point snapshot holds, so both
   * reads come back after either.
   */
  const rereadAll = useCallback(
    () => Promise.all([lessonsApi.review(lessonId).then(setReview), readLesson()]),
    [lessonId, readLesson],
  );

  const approveMedia = useCallback(
    async (approve: string[], remake: string[]) => {
      if (working) return false;
      setWorking("media");
      setRefused(null);
      try {
        for (const id of remake) await mediaApi.retry(lessonId, id);
        if (approve.length > 0) await mediaApi.approve(lessonId, approve);
        await rereadAll().catch(() => {});
        return true;
      } catch (err: unknown) {
        const detail = err instanceof ApiError ? err.detail : undefined;
        setRefused({ work: "media", message: apiErrorMessage(detail) });
        // Something may have landed before the refusal; show what is true now.
        await rereadAll().catch(() => {});
        return false;
      } finally {
        setWorking(null);
      }
    },
    [working, lessonId, rereadAll],
  );

  const retryMedia = useCallback(
    async (mediaId: string) => {
      if (working) return false;
      setWorking(`retry:${mediaId}`);
      setRefused(null);
      try {
        await mediaApi.retry(lessonId, mediaId);
        await rereadAll().catch(() => {});
        return true;
      } catch (err: unknown) {
        const detail = err instanceof ApiError ? err.detail : undefined;
        setRefused({ work: `retry:${mediaId}`, message: apiErrorMessage(detail) });
        return false;
      } finally {
        setWorking(null);
      }
    },
    [working, lessonId, rereadAll],
  );

  return {
    lesson,
    modules: [...(lesson?.modules ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    review,
    loading: Boolean(getToken()) && !(lesson && review) && !missing && !failed,
    missing,
    failed,
    working,
    refused,
    changed,
    approveKeyPoints,
    approveRewrites,
    amendPoint,
    resolveMissing,
    editRewrite,
    approveMedia,
    retryMedia,
  };
}
