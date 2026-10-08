"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  uploadsApi,
  type UploadStage,
  type UploadStatus,
  type UploadStructure,
  type UploadSegment,
} from "@/lib/api/uploads";
import { ApiError, incidentId } from "@/lib/api/client";
import { getToken } from "@/lib/auth/session";

/**
 * Drives the staged (block) upload: stage a file, then poll until the parse
 * settles.
 *
 * POLLING, not a race. The status endpoint is the only way to learn a parse
 * has finished, and there is no push - so this asks again on an interval and
 * stops when the contract says it is done. It does NOT cap the wait and call
 * a slow parse a failure: only `status: "failed"`, or a rejected request, is
 * a failure. A parse that takes longer than expected is still a parse.
 *
 * `stage` is the backend's own vocabulary (`lessons` -> `structure` ->
 * `complete`), enumerated on 1 Sep - before that it was an unconstrained
 * string and nothing could be mapped onto the designed steps.
 */

const POLL_MS = 2000;
/** Long enough to say "this is taking a while", never to give up. */
const SLOW_AFTER_MS = 30_000;
/**
 * One blip is not an answer - the rule `awaitParseRun` in content.ts already
 * keeps, and this poll did not.
 *
 * A single rejected status request used to end the wait: the screen said we
 * could not reach Nevo while the parse carried on server-side and finished
 * without anyone watching. Three consecutive failures is a real outage; one
 * is traffic. A success in between starts the count again.
 */
const POLL_FAILURES_ALLOWED = 3;

export interface StagedUpload {
  uploadId: string | null;
  status: UploadStatus | null;
  stage: UploadStage | null;
  structure: UploadStructure | null;
  /**
   * The named rows under each section. Modules point at these by key, so this
   * is what turns the review screen's third level from a count into a list.
   * Undefined - not empty - when the upload predates the field, so a caller
   * can tell "no segments reported" from "a section with none".
   */
  segments: UploadSegment[] | undefined;
  /**
   * Pages the parser could not read cleanly. Empty when there are none, and
   * empty again once a retry has been asked for - the list describes what is
   * outstanding, not what went wrong historically.
   */
  failedPages: number[];
  /** A retry is in flight. */
  retrying: boolean;
  /** The unit's own title, when the parse found one. */
  lessonTitle: string | null;
  /** The parse failed, or the request did. */
  failed: boolean;
  /**
   * WHICH of the three, because they are not the same thing to say.
   *
   * `file` - the server read the request and refused THIS FILE. A 4xx on
   *   the upload is an answer about the document, so a different one is the
   *   thing to try.
   * `parse` - Nevo took the file and could not finish reading it. The
   *   server says why in `error`, and the file is not the problem to solve.
   * `request` - the call itself failed, or answered 5xx. That is the
   *   connection, and trying the SAME file again is the right advice.
   *
   * The first two used to set `failed` alone and the screen said "We
   * couldn't read that one" over either - blaming a teacher's file for our
   * own server. Backend asked for that split on 18 Sep.
   *
   * `file` is the third, added when the single-lesson path moved onto this
   * hook. That path classified an upload rejection by status and this one did
   * not, so every refusal here - including a 422 about the document itself -
   * was reported as our server being unreachable.
   */
  failureKind: "file" | "parse" | "request" | null;
  /**
   * The server's own reason, when it gave one - AND NOT SOMETHING TO SHOW A
   * TEACHER.
   *
   * This field was unreadable until 23 Sep: the status route answered 500 for
   * the whole in-flight window, so nobody had ever seen what `error` actually
   * contains. The first real one, captured on a live upload that day, was a
   * raw asyncpg exception - driver class, the full INSERT statement, bound
   * UUIDs. Two screens were rendering it verbatim as the sentence a teacher
   * reads when their upload fails.
   *
   * So it stays on the hook, because it is the contract's answer and it is
   * what gets quoted in a bug report, and nothing renders it. If a
   * teacher-safe message is wanted on that screen it needs to be a field that
   * promises to be one; asked of backend on 23 Sep.
   */
  error: string | null;
  /**
   * THE SENTENCE A SCREEN MAY SHOW. Added to the contract 24 Sep, after this
   * console asked backend for a field that PROMISES prose rather than one that
   * happens to contain it.
   *
   * A small closed list of recognised causes - no readable text, timed out,
   * rate limited - and an honest generic line for everything else, because
   * "a guess dressed as a diagnosis is worse than saying plainly we don't
   * know". Null unless the parse failed, and null on an older deployment, so a
   * caller keeps its own generic line for both rather than rendering nothing.
   */
  failureReason: string | null;
  /**
   * The backend's reference for a failure nobody planned for.
   *
   * A 500 is the one failure this console can say nothing useful about, and
   * until now it could not help a teacher report one either: a staged upload
   * answered 500 on ~18 Sep and backend could not find it from their side,
   * because there was nothing to match on. Null for every failure that is not
   * an unhandled one, which is most of them.
   */
  incident: string | null;
  /** Still going, and long enough that a teacher deserves telling. */
  slow: boolean;
  /**
   * Resolves with what happened to the file: `refused` is the server's 4xx
   * answer about the file itself, `failed` is ours. The caller decides where
   * a refusal belongs on screen - C07 draws it on the file step.
   */
  start: (file: File, scope: string, subject?: string) => Promise<StartOutcome>;
  /**
   * Ask for the faint pages again. Sends whatever is outstanding, adopts the
   * status the server answers with, and lets the poll take over from there -
   * a retry puts the upload back into parsing, so the screen must follow it
   * rather than sit on the structure it already has.
   */
  retryFailedPages: () => void;
  /**
   * Pick the SAME upload back up after the connection failed while watching it.
   *
   * Only for `request` with an upload id: the file was staged and the parse
   * may well have carried on, so asking about it again is right and sending the
   * file a second time would stage a duplicate. Does nothing otherwise - a
   * refused file or a failed parse is an answer, and asking again changes
   * nothing.
   */
  resume: () => void;
  reset: () => void;
}

export type StartOutcome = "staged" | "refused" | "failed" | "skipped";

export function useStagedUpload(): StagedUpload {
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [structure, setStructure] = useState<UploadStructure | null>(null);
  const [segments, setSegments] = useState<UploadSegment[] | undefined>(undefined);
  const [failedPages, setFailedPages] = useState<number[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [lessonTitle, setLessonTitle] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureKind, setFailureKind] = useState<
    "file" | "parse" | "request" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [incident, setIncident] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  /**
   * Bumped after every poll so the effect below always re-schedules.
   *
   * Keying the effect on `status` alone stopped the polling dead: the create
   * response already says "processing", so the first tick set it to the same
   * value, nothing changed, and no further tick was ever scheduled. One poll
   * and then silence, with the screen waiting for ever.
   */
  const [tick, setTick] = useState(0);
  const startedAt = useRef<number | null>(null);
  /** Status requests that have failed in a row. Only a success clears it. */
  const pollFailures = useRef(0);

  const reset = useCallback(() => {
    setUploadId(null);
    setStatus(null);
    setStage(null);
    setStructure(null);
    setSegments(undefined);
    setFailedPages([]);
    setRetrying(false);
    setLessonTitle(null);
    setFailed(false);
    setFailureKind(null);
    setError(null);
    setFailureReason(null);
    setIncident(null);
    setSlow(false);
    setTick(0);
    startedAt.current = null;
    pollFailures.current = 0;
  }, []);

  const start = useCallback(
    (file: File, scope: string, subject?: string): Promise<StartOutcome> => {
      if (!getToken()) return Promise.resolve("skipped");
      reset();
      startedAt.current = Date.now();
      return uploadsApi
        .create(file, scope, subject)
        .then((res): StartOutcome => {
          setUploadId(res.uploadId);
          setStatus(res.status);
          setStage(res.stage);
          return "staged";
        })
        .catch((err: unknown) => {
          setFailed(true);
          setIncident(incidentId(err instanceof ApiError ? err.detail : null));
          // Any 4xx is the server's ANSWER about this file: it read the
          // request and rejected it. Only a 5xx, or no status at all - the
          // call never arrived - is ours.
          const status = err instanceof ApiError ? err.status : undefined;
          const refused = status !== undefined && status < 500;
          setFailureKind(refused ? "file" : "request");
          return refused ? "refused" : "failed";
        });
    },
    [reset],
  );

  const retryFailedPages = useCallback(() => {
    // The contract takes 1 to 100 page numbers; an empty list is a 422, so a
    // retry with nothing outstanding is not sent at all.
    if (!uploadId || failedPages.length === 0 || retrying) return;
    setRetrying(true);
    void uploadsApi
      .retryPages(uploadId, failedPages)
      .then((res) => {
        setRetrying(false);
        // The pages that went back are no longer outstanding. The next poll
        // replaces this with whatever the re-parse could not read either.
        setFailedPages([]);
        setStatus(res.status);
        setStage(res.stage);
        setStructure(res.structure ?? null);
        /*
         * NOTHING BUMPS `tick` HERE, and that was a line of mine until a
         * mutation run showed it killed nothing. The poll effect keys on
         * `status` as well, and this handler always moves it off `ready` -
         * so the status write is what re-arms the poll. A redundant bump
         * would be a line nobody could ever remove with confidence.
         */
      })
      .catch(() => {
        // The upload is untouched and the pages are still outstanding, so the
        // control stays where it is rather than the screen claiming a failure
        // of the parse itself.
        setRetrying(false);
      });
  }, [uploadId, failedPages, retrying]);

  const resume = useCallback(() => {
    if (!uploadId || failureKind !== "request") return;
    pollFailures.current = 0;
    setFailed(false);
    setFailureKind(null);
    setIncident(null);
    // Status is still whatever the last good poll said - in flight - so a new
    // tick is all the effect below needs to ask again.
    setTick((n) => n + 1);
  }, [uploadId, failureKind]);

  // Poll while the parse is still running. Settles on ready/confirmed, and
  // stops on failed or cancelled with the server's reason kept.
  useEffect(() => {
    if (!uploadId) return;
    if (status === "ready" || status === "confirmed") return;
    if (status === "failed" || status === "cancelled") return;
    let cancelled = false;
    const tick = setTimeout(() => {
      void uploadsApi
        .status(uploadId)
        .then((res) => {
          if (cancelled) return;
          pollFailures.current = 0;
          setStatus(res.status);
          setStage(res.stage);
          setStructure(res.structure ?? null);
          // Both landed on 3 Sep. `segments` is what lets the review screen
          // NAME its third level instead of counting it; absent on an older
          // upload, so it stays undefined rather than becoming [].
          setSegments(res.segments);
          // Absent and empty mean the same thing: nothing outstanding.
          setFailedPages(res.failedPages ?? []);
          setLessonTitle(res.lessonTitle ?? null);
          setError(res.error);
          setFailureReason(res.failureReason ?? null);
          if (res.status === "failed") {
            setFailed(true);
            // Nevo answered. It read the file and could not finish, which
            // is a different sentence from a call that never landed.
            setFailureKind("parse");
            /*
             * THE REFERENCE FOR A FAILURE WITH NO 500 BEHIND IT.
             *
             * A parse dies in a background task, so nothing ever rejected and
             * the reader in the catch below never ran - a teacher looking at a
             * failed parse had no reference to quote, which is the one thing
             * that screen can offer them. It is a plain field on the job now.
             */
            setIncident(res.incidentId ?? null);
          }
          if (startedAt.current) {
            setSlow(Date.now() - startedAt.current > SLOW_AFTER_MS);
          }
          setTick((n) => n + 1);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          pollFailures.current += 1;
          if (pollFailures.current < POLL_FAILURES_ALLOWED) {
            // Ask again on the next interval, as if it had answered.
            setTick((n) => n + 1);
            return;
          }
          setFailed(true);
          setFailureKind("request");
          setIncident(incidentId(err instanceof ApiError ? err.detail : null));
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(tick);
    };
    // `tick` is what guarantees the next poll; `status` is what stops it.
  }, [uploadId, status, tick]);

  return {
    uploadId,
    status,
    stage,
    structure,
    segments,
    failedPages,
    retrying,
    lessonTitle,
    failed,
    failureKind,
    error,
    failureReason,
    incident,
    slow,
    start,
    retryFailedPages,
    resume,
    reset,
  };
}
