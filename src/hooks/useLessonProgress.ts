"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LESSON_STATUS,
  lessonsApi,
  type LessonProgressResponse,
  type LessonStatus,
} from "@/lib/api/lessons";
import { getSession, getToken } from "@/lib/auth/session";
import {
  claimSlot,
  clearProgress,
  flushPendingProgress,
  holdProgress,
} from "@/lib/lessons/pendingProgress";
import { randomId } from "@/lib/utils";

/**
 * Writes down where a child has got to in a lesson.
 *
 * Nothing did this before. The player tracked position in React state, wrote
 * the assessment answers to sessionStorage, and on completion called
 * `router.push(HOME_HREF)` - that was the entire completion handler. Both
 * endpoints have been deployed the whole time and neither was called, so
 * closing the tab returned a lesson to unstarted and nothing a child did ever
 * accumulated.
 *
 * `POST /session` opens the session and `PUT /progress` requires its id, so
 * the session is opened first and every report waits on it. Reports that
 * arrive before it lands are held (one deep - only the latest position
 * matters) and flushed when it does, rather than dropped.
 *
 * ORDERING. Positions can complete out of order on a slow connection, and a
 * stale one landing last would move a child backwards. Each write carries a
 * sequence number and a response is only honoured if it is still the newest.
 *
 * FAILURE. Segment writes are best-effort and silent: interrupting a child
 * mid-lesson over a position that the next advance will re-send is the wrong
 * trade. The COMPLETION write is not - that is the one that decides whether
 * the lesson counts - so `completionFailed` is surfaced and the completion
 * screen says so, the way the daily warm-up already does.
 *
 * OFFLINE. "The next advance will re-send it" is true of a blip and false of a
 * disconnection: offline, every write fails and there is no next advance that
 * succeeds either. So the latest failed position is held and re-sent when the
 * browser says it is back. One position, not a log - only where the child got
 * to matters, and the newest answer is the only true one.
 *
 * This exists because the offline banner used to tell a child "your progress
 * is saved" at the exact moment it was not.
 *
 * NO SESSION IS NOT NO RECORD. A failed `POST /session` left every position
 * in memory with nothing to retry it, so a lesson opened offline - including
 * one opened from Downloads, which is what Downloads is for - was recorded as
 * never played. The session is retried when the connection returns and on
 * the next move, and meanwhile the position is held with no session, for the
 * flush to open one if the player has closed by then.
 */

export interface LessonProgressState {
  /**
   * Report a position. Safe to call before the session exists. `check` is
   * where the after-lesson check was left (B49), on the write that leaves it.
   */
  report: (status: LessonStatus, position: Position) => void;
  /** The completion write did not reach Nevo. */
  completionFailed: boolean;
  /** True once a completion write has landed. */
  completionSaved: boolean;
  /**
   * True only while the NEWEST position reported has landed. False while it
   * is in flight, waiting on a session, or held for a reconnect - and always
   * false when nothing is written at all. What a screen may say "saved" on.
   */
  positionSaved: boolean;
  /**
   * The session id the backend issued. Signals need the SAME id - the ingest
   * contract wants a UUID and `PUT /progress` wants this one, which is the
   * backend saying progress and signals are one session, not two.
   */
  sessionId: string | null;
  /**
   * What the newest write that landed came back with - the only read of a
   * lesson's progress row the contract has. Carries the check-in's outcome
   * (B26) after the completion write, and where a check was left (B49).
   * Null until a write lands; never an older write's answer.
   */
  saved: LessonProgressResponse | null;
}

type Position = { segment?: number; module?: number; check?: number };

const IDLE: LessonProgressState = {
  report: () => {},
  completionFailed: false,
  completionSaved: false,
  positionSaved: false,
  sessionId: null,
  saved: null,
};

export function useLessonProgress(
  lessonId: string,
  /**
   * False for the two authored mock lessons: their ids are not real, so a
   * write would 404 and a failure banner would be our own fault, not the
   * network's.
   */
  enabled: boolean,
  /**
   * The assignment this lesson was opened from, when it was opened from one.
   *
   * `ProgressWrite.assignmentId` has been on the wire and typed since the
   * contract shipped and nothing ever sent it, so every write recorded that a
   * child had moved through a LESSON and never which piece of set work that
   * was. A lesson can be assigned more than once, to the same child.
   *
   * ABSENT IS CORRECT AND COMMON: a lesson opened from the library is not an
   * assignment, and claiming one would file a child's own reading under a
   * teacher's instruction.
   */
  assignmentId?: string | null,
): LessonProgressState {
  const sessionId = useRef<string | null>(null);
  // Mirrored into state as well: the ref keeps the writes synchronous, and
  // signals need a re-render to learn the id exists.
  const [issued, setIssued] = useState<string | null>(null);
  const pending = useRef<{
    status: LessonStatus;
    segment?: number;
    module?: number;
    check?: number;
  } | null>(null);
  const seq = useRef(0);
  const landed = useRef(0);
  /** The most recent write that did not land, held for a reconnect. */
  const unsent = useRef<{
    status: LessonStatus;
    segment?: number;
    module?: number;
    check?: number;
  } | null>(null);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [completionSaved, setCompletionSaved] = useState(false);
  const [positionSaved, setPositionSaved] = useState(false);
  const [saved, setSaved] = useState<LessonProgressResponse | null>(null);
  /**
   * This player's own slot for a position held before any session exists.
   * Claimed while mounted, so the shell's flush leaves it to us.
   */
  const [localId] = useState(() => `local-${randomId()}`);
  /** The session open failed, so positions are held without one. */
  const sessionFailed = useRef(false);
  /** Re-attempts the session open; set by the effect that owns it. */
  const retryOpen = useRef<(() => void) | null>(null);

  const write = useCallback(
    (status: LessonStatus, position: Position) => {
      const id = sessionId.current;
      if (!id) return;
      const ticket = ++seq.current;
      const completing = status === LESSON_STATUS.COMPLETED;
      // Whose position this is, taken NOW. A 401 clears the session before
      // the failure below runs, and reading it then found nobody.
      const owner = getSession()?.userId ?? null;

      void lessonsApi
        .saveProgress(lessonId, {
          sessionId: id,
          status,
          // Omitted, never null. Absent says "not from an assignment"; a null
          // would be us asserting the same thing in a field the backend may
          // read differently.
          ...(assignmentId ? { assignmentId } : {}),
          ...(position.segment !== undefined
            ? { segmentPosition: position.segment }
            : {}),
          ...(position.module !== undefined
            ? { modulePosition: position.module }
            : {}),
          ...(position.check !== undefined
            ? { checkPosition: position.check }
            : {}),
        })
        .then((res) => {
          // A stale response must not overwrite a newer position.
          if (ticket < landed.current) return;
          landed.current = ticket;
          setSaved(res ?? null);
          unsent.current = null;
          // It landed, so nothing is owed for THIS SESSION any more. Only
          // this session's: a completion held from an earlier visit is not
          // made untrue by today's first segment, and wiping it here is how
          // a finished lesson went back to being unfinished.
          clearProgress(lessonId, id);
          setPositionSaved(ticket === seq.current);
          if (completing) {
            setCompletionSaved(true);
            setCompletionFailed(false);
          }
        })
        .catch(() => {
          // A newer position already landed; holding this one would replay
          // the child backwards on the next flush.
          if (ticket < landed.current) return;
          // Hold the newest unsent position for a reconnect. A completion
          // outranks a segment position: it is the write that decides whether
          // the lesson counts.
          if (!unsent.current || completing) {
            unsent.current = { status, ...position };
          }
          /*
           * AND OUTSIDE THIS HOOK. `unsent` is a ref and the `online` listener
           * below lives in the same effect, so both die when the player
           * unmounts - which is precisely what "Leave for now" does, one line
           * after firing a write that is already failing. Held in storage as
           * well, the position survives the exit the dialog promised it would.
           */
          holdProgress(
            lessonId,
            {
              sessionId: id,
              status,
              ...position,
              ...(assignmentId ? { assignmentId } : {}),
            },
            owner,
          );
          // Only completion is worth telling a child about - see the docblock.
          if (completing) setCompletionFailed(true);
        });
    },
    [lessonId, assignmentId],
  );

  useEffect(() => {
    if (!enabled || !getToken()) return;
    let cancelled = false;
    let opening = false;
    const release = claimSlot(lessonId, localId);
    // Taken now for the same reason `write` takes it early - see there.
    const owner = getSession()?.userId ?? null;

    const open = () => {
      if (cancelled || opening || sessionId.current) return;
      opening = true;
      void lessonsApi
        .startSession(lessonId)
        .then((res) => {
          opening = false;
          if (cancelled) return;
          sessionId.current = res.sessionId;
          sessionFailed.current = false;
          setIssued(res.sessionId);
          // What was held without a session is ours to send now, under it.
          clearProgress(lessonId, localId);
          // Anything reported while the session was opening.
          const held = pending.current;
          pending.current = null;
          if (held) write(held.status, held);
        })
        .catch(() => {
          opening = false;
          // No session yet means no progress endpoint to call. The lesson
          // still plays; the position is held - even if the player has
          // already closed - and the completion screen is where a missed
          // save gets said.
          if (!cancelled) {
            sessionFailed.current = true;
            setCompletionFailed(true);
          }
          const held = pending.current;
          if (held) {
            holdProgress(
              lessonId,
              {
                sessionId: null,
                localId,
                ...held,
                ...(assignmentId ? { assignmentId } : {}),
              },
              owner,
            );
          }
        });
    };

    retryOpen.current = open;
    open();
    // The connection came back: try the session again.
    window.addEventListener("online", open);

    return () => {
      cancelled = true;
      retryOpen.current = null;
      window.removeEventListener("online", open);
      // Closed with no session: the flush is welcome to what is held now.
      release();
    };
  }, [lessonId, enabled, write, localId, assignmentId]);

  // Back online: send whatever never landed.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const held = unsent.current;
      if (!held || !sessionId.current) return;
      unsent.current = null;
      write(held.status, held);
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [enabled, write]);

  // Anything held from a previous visit - including one that ended with the
  // player unmounting mid-failure - goes out as soon as a lesson is open again.
  useEffect(() => {
    if (!enabled) return;
    void flushPendingProgress();
  }, [enabled]);

  const report = useCallback<LessonProgressState["report"]>(
    (status, position) => {
      if (!enabled || !getToken()) return;
      setPositionSaved(false);
      if (!sessionId.current) {
        // Hold the latest only - an older position is never worth sending.
        pending.current = { status, ...position };
        if (sessionFailed.current) {
          // Kept past this player, and the session tried again.
          holdProgress(lessonId, {
            sessionId: null,
            localId,
            status,
            ...position,
            ...(assignmentId ? { assignmentId } : {}),
          });
          retryOpen.current?.();
        }
        return;
      }
      write(status, position);
    },
    [enabled, write, lessonId, localId, assignmentId],
  );

  if (!enabled) return IDLE;
  return {
    report,
    completionFailed,
    completionSaved,
    positionSaved,
    sessionId: issued,
    saved,
  };
}
