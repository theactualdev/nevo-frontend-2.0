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
  | "checks"
  | "parts"
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
  /**
   * The write that did not land, and the server's reason when it gave one:
   * its sentence, and its code for a refusal that came without one.
   */
  refused: { work: ReviewWork; message: string | null; code?: string | null } | null;
  /** The lesson changed under an approval, and what is shown is the new one. */
  changed: boolean;
  approveKeyPoints: () => Promise<boolean>;
  /**
   * SCRUM-291's one press: the checks' sign-off, then the guiding questions',
   * each only where the server says it is needed (`parts`, read off the
   * review), and each with the hash of the review the teacher was shown.
   */
  approveChecks: (parts: { checks: boolean; guided: boolean }) => Promise<boolean>;
  /**
   * Every waiting calculation reveal part, in one press (8c4ccef). Its own,
   * not the checks': the parts never hold back Assign.
   */
  approveParts: () => Promise<boolean>;
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
  /**
   * The pictures and recordings this teacher flagged and sent back in this
   * visit (design 11; Lydia, 26 Oct: "show remade as remade"). The server
   * keeps an item's id through a remake and says nothing of it, so this is
   * the one record there is, and it lasts as long as the visit.
   */
  remade: ReadonlySet<string>;
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
  const [remade, setRemade] = useState<ReadonlySet<string>>(() => new Set());

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

  /**
   * A refusal, said where it happened. A moved lesson is re-read and said so;
   * anything else keeps the server's sentence, or its code when it sent none.
   */
  const fail = useCallback(
    async (work: ReviewWork, err: unknown) => {
      const detail = err instanceof ApiError ? err.detail : undefined;
      if (apiErrorCode(detail) === "review_content_changed") {
        await Promise.all([lessonsApi.review(lessonId).then(setReview), readLesson()]).catch(
          () => {},
        );
        setChanged(true);
      } else {
        setRefused({ work, message: apiErrorMessage(detail), code: apiErrorCode(detail) });
      }
    },
    [lessonId, readLesson],
  );

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
        await fail(work, err);
        return false;
      } finally {
        setWorking(null);
      }
    },
    [working, fail],
  );

  const approveKeyPoints = useCallback(
    () =>
      act("keyPoints", () =>
        lessonsApi.approveAllKeyPoints(lessonId, review?.keyPointsContentHash ?? ""),
      ),
    [act, lessonId, review?.keyPointsContentHash],
  );

  /*
   * TWO SIGN-OFFS, ONE PRESS, IN THE SERVER'S ORDER. The checks first - the
   * server refuses them until the key points are signed, and the step sits
   * after those - then the guiding questions. Both hashes are taken from the
   * review on screen before either call, so neither signs anything newer
   * than what was read. If the first lands and the second is refused, the
   * review it returned is kept: what is on screen is what is true.
   */
  const approveChecks = useCallback(
    async (parts: { checks: boolean; guided: boolean }) => {
      if (working || !review) return false;
      const checksHash = review.checksContentHash ?? "";
      const guidedHash = review.guidedStepsContentHash ?? "";
      setWorking("checks");
      setRefused(null);
      try {
        if (parts.checks) setReview(await lessonsApi.approveAllChecks(lessonId, checksHash));
        if (parts.guided) setReview(await lessonsApi.approveAllGuidedSteps(lessonId, guidedHash));
        setChanged(false);
        return true;
      } catch (err: unknown) {
        await fail("checks", err);
        return false;
      } finally {
        setWorking(null);
      }
    },
    [working, review, lessonId, fail],
  );

  const approveParts = useCallback(async () => {
    if (working || !review) return false;
    setWorking("parts");
    setRefused(null);
    try {
      setReview(
        await lessonsApi.approveAllCalculationParts(
          lessonId,
          review.calculationPartsContentHash ?? "",
        ),
      );
      setChanged(false);
      return true;
    } catch (err: unknown) {
      await fail("parts", err);
      return false;
    } finally {
      setWorking(null);
    }
  }, [working, review, lessonId, fail]);

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
        for (const id of remake) {
          await mediaApi.retry(lessonId, id);
          setRemade((s) => new Set(s).add(id));
        }
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
    approveChecks,
    approveParts,
    approveRewrites,
    amendPoint,
    resolveMissing,
    editRewrite,
    approveMedia,
    remade,
    retryMedia,
  };
}
