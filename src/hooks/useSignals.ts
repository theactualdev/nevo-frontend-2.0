"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ApiError,
  signalsApi,
  type SignalEvent,
  type SignalSessionEnvelope,
  type SignalSessionType,
} from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import {
  SIGNAL_BATCH,
  SIGNAL_EVENT_TYPES,
  type SignalEventType,
} from "@/lib/constants";
import {
  deliverHeldSignals,
  holdSignals,
  installSignalDelivery,
} from "@/lib/signals/outbox";

/**
 * Form-factor tag for session context (Touch Signal Contract G6).
 *
 * WHAT G6 SEPARATES IS TOUCH FROM KEYS, not small from large: an on-screen
 * keyboard and a hardware one time differently on the same screen. Width
 * alone tagged a 1024px iPad "desktop", into the very distribution G6 says
 * tablets must stay out of. The primary pointer says what the device is.
 */
function formFactor(): "mobile" | "tablet" | "desktop" {
  if (!window.matchMedia("(pointer: coarse)").matches) return "desktop";
  return window.innerWidth < 640 ? "mobile" : "tablet";
}

/**
 * Whether motion was reduced for this session: the OS setting, or the
 * child's own switch on Profile, which the app honours just the same. Reading
 * only the media query missed every child who used the switch.
 */
function motionReduced(): boolean {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.reducedMotion === "true"
  );
}

/**
 * How a session ended, for the envelope. Null while it is still going - the
 * contract's own default, `in_progress`, is then the truth.
 */
export interface SessionOutcome {
  completionStatus: "completed" | "exited";
  /** The segment id the child left from. */
  exitPosition?: string;
}

/** Signature of `trackEvent` — pass down to child components that emit signals. */
export type TrackEvent = (
  type: SignalEventType,
  payload?: Record<string, unknown>,
) => void;

/**
 * Signal collection (FE Architecture §3) — central to the Intelligence Framework.
 *
 * Captures interaction events and batches them: flushes every 5s, immediately at
 * 20 events, and on unmount (lesson exit/completion). On network failure the
 * batch is re-queued rather than lost (offline resilience).
 *
 *   const { trackEvent } = useSignals(sessionId, lessonId);
 *   trackEvent("time_on_segment", { segmentId, duration });
 *
 * THE SESSION ID MUST BE THE BACKEND'S. Both `session.sessionId` and every
 * `events[].sessionId` are declared `format: uuid`, and the player used to
 * pass a string it built itself - `lesson-<id>-<random>`. It is not a UUID, so
 * EVERY batch this app ever sent was rejected 422 before a single field was
 * read: time on segment, scroll depth, replays, modality switches,
 * comprehension responses, breaks. The whole evidence stream the Intelligence
 * Framework runs on, silently refused at the door.
 *
 * Silently, because a 4xx is deliberately not re-queued (it would fail
 * identically every five seconds forever) and the failure has no user-facing
 * effect. Nothing surfaced it until the network tab was read against a real
 * signed-in account.
 *
 * So `sessionId` is now the id `POST /api/v1/lessons/{id}/session` issues -
 * the same one `PUT /progress` requires, which is the backend telling us these
 * are one session, not two. It arrives asynchronously, so events captured
 * before it lands are HELD (capped, newest kept) and go out with the first
 * batch that can be addressed, rather than being thrown at a validator that
 * will refuse them.
 *
 * `lessonId` is NULLABLE as of 3 Sep, and `sessionType` says what a stream is -
 * lesson, onboarding, profiling, sso or (1 Oct) ask_nevo. A non-lesson stream
 * can finally be addressed, so the note that used to sit here (holding
 * forever, not this hook's to fix) is resolved.
 *
 * TWO WAYS A BATCH CAN BE LOST, and both are guarded:
 *
 * Ingest is Bearer-only, and a 4xx batch is DROPPED rather than retried -
 * correctly, since a contract rejection would fail identically every five
 * seconds forever. But onboarding happens BEFORE a session exists, so every
 * pre-auth batch would 401 and be dropped: a child's whole profiling stream,
 * gone, with nothing to show it. So an unauthenticated flush now HOLDS
 * instead of sending, and the events go out on the first flush after
 * `POST /auth/pin` returns a session.
 *
 * Holding is capped and keeps the NEWEST events, so a stream that never gets
 * a session costs a bounded amount of memory rather than growing for the life
 * of the screen. That is a real loss, and the honest one: the alternative is
 * pretending a 401 was a delivery.
 */
/** The ingest contract declares both ids `format: uuid`; anything else is a 422. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useSignals(
  sessionId: string | null,
  lessonId?: string,
  sessionType: SignalSessionType = "lesson",
  /** How the session ended, once it has - see `SessionOutcome`. */
  outcome: SessionOutcome | null = null,
) {
  const queue = useRef<SignalEvent[]>([]);
  const sessionRef = useRef(sessionId);
  const lessonRef = useRef(lessonId);
  const typeRef = useRef(sessionType);
  const outcomeRef = useRef<(SessionOutcome & { endedAt: string }) | null>(
    null,
  );
  /** Breaks started this session - a count of `break_start`, nothing more. */
  const breaks = useRef(0);
  /** Whether this session's `session_context` is in the stream yet. */
  const contextQueued = useRef(false);
  /**
   * The child these events belong to, as last seen with a live token. A 401
   * clears the session before the page unloads, so by then this is the only
   * place left that knows whose they were.
   */
  const owner = useRef<string | null>(null);
  /** False once unmounted: a re-queue after that lands in a dead ref. */
  const alive = useRef(true);
  /*
   * THE SESSION'S CLOCK ANCHOR: one wall-clock reading and one monotonic
   * reading, taken at the same instant and reset together per session id.
   *
   * Rule 4 wants `performance.now()` for anything timed and sent to the engine,
   * and `SignalEventRequest.timestamp` is `format: date-time`, so the raw float
   * has nowhere to go. That looks like a deadlock and is not one: what the
   * contract cannot take is the raw monotonic value, not a timestamp DERIVED
   * from one.
   *
   * So every event is stamped `wall + (performance.now() - perf)`. The wire is
   * unchanged, and every within-session delta becomes the difference of two
   * `performance.now()` readings - which is what the engine actually measures.
   *
   * WHAT IT FIXES, concretely. `new Date()` per event means a device clock
   * correction landing mid-lesson shifts every subsequent timestamp, corrupting
   * every latency that spans it and potentially REORDERING a child's events.
   * Unsynced Android devices make that ordinary rather than hypothetical, and
   * frontend §2 is blunt about the cost: latency is the primary signal for
   * three of the four affective states, and precision the client did not send
   * cannot be recovered. This is the one class of bug that corrupts data at the
   * source rather than showing something wrong on a screen.
   *
   * KNOWN LIMIT, and it is the one open question. ISO 8601 bottoms out at
   * millisecond resolution while `performance.now()` offers finer. Every signal
   * the engine infers from - tap dwell, response latency, idle - lives at 100ms
   * and up, so 1ms is ample; if affective inference ever needs sub-millisecond,
   * that IS a contract ask for a numeric monotonic field, and this becomes its
   * anchor rather than its replacement.
   */
  const anchorRef = useRef<{ wall: number; perf: number } | null>(null);
  /**
   * The anchor, taken on first use rather than during render.
   *
   * Both readings are impure, so React's purity rule forbids taking them in a
   * `useRef` initialiser - and it is right to: a re-render would re-run them
   * and silently move the origin every event after it is dated from. Every
   * caller below is an event handler or a flush, so first use is never render.
   */
  const anchor = useCallback(() => {
    anchorRef.current ??= { wall: Date.now(), perf: performance.now() };
    return anchorRef.current;
  }, []);
  /** An event's time: monotonic in substance, ISO on the wire. */
  const stamp = useCallback(() => {
    const { wall, perf } = anchor();
    return new Date(wall + (performance.now() - perf)).toISOString();
  }, [anchor]);

  // Keep the latest ids in refs without mutating them during render.
  useEffect(() => {
    // Only a genuinely NEW session restarts the capture window. Going from
    // "not issued yet" to the issued id is this session resolving, not a
    // second one - resetting there would stamp the envelope later than the
    // events it carries.
    if (sessionRef.current && sessionRef.current !== sessionId) {
      // Re-anchor BOTH clocks together. A new session restarts the monotonic
      // window; keeping the old anchor would date its first events from the
      // previous session's origin.
      // Dropped, not replaced: the next event re-anchors. Taking the reading
      // here would date the new session from this effect rather than from its
      // first event, and the two are not the same moment.
      anchorRef.current = null;
      // A new session's envelope has its own breaks and its own ending.
      breaks.current = 0;
      outcomeRef.current = null;
      // ...and its own context, first in its stream.
      contextQueued.current = false;
    }
    sessionRef.current = sessionId;
    lessonRef.current = lessonId;
    typeRef.current = sessionType;
  }, [sessionId, lessonId, sessionType]);

  // The ending, dated once and on the same clock as the events it closes.
  useEffect(() => {
    if (!outcome) return;
    if (outcomeRef.current?.completionStatus === outcome.completionStatus)
      return;
    outcomeRef.current = { ...outcome, endedAt: stamp() };
  }, [outcome, stamp]);

  /** Where this stream can be addressed, or null while it cannot be yet. */
  const envelope = useCallback((): SignalSessionEnvelope | null => {
    const session = sessionRef.current;
    const lesson = lessonRef.current;
    const type = typeRef.current;
    // The session id is always required and always a UUID. The lesson id is
    // required only for a LESSON stream; onboarding, profiling and sso send
    // null and say so through `sessionType`.
    if (!session || !UUID.test(session)) return null;
    if (type === "lesson" && !(lesson && UUID.test(lesson))) return null;
    const ended = outcomeRef.current;
    return {
      sessionId: session,
      lessonId: type === "lesson" ? (lesson ?? null) : null,
      sessionType: type,
      // The same anchor the events are dated from, so the envelope and its
      // contents cannot disagree about when this session began.
      startedAt: new Date(anchor().wall).toISOString(),
      ...(ended
        ? {
            completionStatus: ended.completionStatus,
            endedAt: ended.endedAt,
            ...(ended.exitPosition ? { exitPosition: ended.exitPosition } : {}),
          }
        : {}),
      ...(breaks.current > 0 ? { breakCount: breaks.current } : {}),
    };
  }, [anchor]);

  /**
   * Hand what cannot be sent now to the outbox, so it outlives this screen.
   * Only an addressable stream with a known owner: anything else could never
   * reach the right record, and holding it would only be holding it.
   */
  const persist = useCallback(() => {
    if (queue.current.length === 0) return;
    const env = envelope();
    const who = owner.current ?? getSession()?.userId ?? null;
    if (!env || !who) return;
    holdSignals(who, env, queue.current);
    queue.current = [];
  }, [envelope]);

  const send = useCallback(
    (keepalive: boolean) => {
      if (queue.current.length === 0) return;

      // Ingest is Bearer-only. Without a token this would 401, and a 4xx batch
      // is dropped - so onboarding's whole stream would vanish. Hold it for the
      // session that PIN completion is about to create.
      const signedIn = getSession();
      if (!signedIn?.token) {
        capHeld(queue);
        return;
      }
      owner.current = signedIn.userId;

      const env = envelope();
      if (!env) {
        capHeld(queue);
        return;
      }

      const batch = queue.current;
      queue.current = [];
      /*
       * NEVER MORE THAN THE CONTRACT TAKES IN ONE REQUEST. A held or
       * re-queued backlog passes 100, and sent whole it was refused 422 -
       * which drops a batch - so the bigger the backlog, the more certainly
       * all of it was thrown away.
       */
      const per = SIGNAL_BATCH.MAX_EVENTS_PER_REQUEST;
      for (let i = 0; i < batch.length; i += per) {
        const chunk = batch.slice(i, i + per);
        signalsApi.submitBatch(env, chunk, { keepalive }).catch((cause) => {
          // Re-queue only what can heal: network failures and server errors.
          // A contract rejection would fail identically every 5s forever -
          // drop those batches instead of hammering.
          const status = cause instanceof ApiError ? cause.status : 0;
          if (status >= 400 && status < 500 && status !== 401) return;
          if (alive.current && status !== 401) {
            queue.current = [...chunk, ...queue.current];
            capHeld(queue);
            return;
          }
          // Gone, or the session died under it (a 401 clears the token and
          // leaves the page): only the outbox outlives either.
          if (owner.current) holdSignals(owner.current, env, chunk);
        });
      }
    },
    [envelope],
  );

  const flush = useCallback(() => send(false), [send]);

  /*
   * Every session opens with its interpretation context (G6): the form factor
   * and reduced-motion mode the signals were produced under. Seeded lazily on
   * the first trackEvent so it is FIRST in the stream regardless of effect
   * ordering, and once per session.
   *
   * ONCE PER SESSION, NOT PER SESSION ID SEEN. It was keyed on the id, so a
   * lesson - whose id lands after its first events - matched "no id" against
   * "no id" and queued nothing, then queued the context on the first event
   * after the id arrived: behind the events it describes. The id resolving is
   * this session, not a second one; only a genuinely new id re-seeds it.
   */
  const trackEvent = useCallback(
    (type: SignalEventType, payload?: Record<string, unknown>) => {
      if (!contextQueued.current) {
        contextQueued.current = true;
        queue.current.push({
          type: SIGNAL_EVENT_TYPES.SESSION_CONTEXT,
          timestamp: stamp(),
          payload: {
            formFactor: formFactor(),
            reducedMotion: motionReduced(),
          },
        });
      }
      if (type === SIGNAL_EVENT_TYPES.BREAK_START) breaks.current += 1;
      queue.current.push({
        type,
        timestamp: stamp(),
        payload,
      });
      if (queue.current.length >= SIGNAL_BATCH.MAX_BATCH_SIZE) flush();
    },
    [flush, stamp],
  );

  useEffect(() => {
    alive.current = true;
    // Anything an earlier screen could not send, now that one is open.
    installSignalDelivery();
    void deliverHeldSignals();

    const id = setInterval(flush, SIGNAL_BATCH.FLUSH_INTERVAL_MS);
    /*
     * HIDDEN IS THE LAST MOMENT A PAGE CAN COUNT ON. A phone backgrounding the
     * tab, a child switching apps, the lid closing: none of them unmounts
     * anything, so nothing flushed, and a tab discarded in the background never
     * runs another line. `keepalive` lets the request finish after the page.
     */
    const onHidden = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    // And on the way out, what cannot go now - no network, or no token because
    // a 401 elsewhere has just cleared it - goes to the outbox instead.
    const onPageHide = () => {
      if (navigator.onLine) send(true);
      persist();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      alive.current = false;
      /*
       * A MICROTASK LATER, NOT NOW. On unmount React runs this hook's cleanup
       * before the cleanups of effects its caller declared after it - and the
       * player's time-on-segment event is exactly such a cleanup. Flushing
       * synchronously sent the queue and THEN the last segment's timing was
       * pushed into a queue nothing would ever flush again: lost on every
       * exit and every completion. `flush` reads only refs, so running it a
       * tick after the component has gone is safe.
       *
       * What it could not send - offline, or no token - would die with this
       * ref, so it goes to the outbox. Not if the hook came straight back
       * (StrictMode remounts): then the queue is still alive and still its own.
       */
      queueMicrotask(() => {
        flush();
        if (!alive.current) persist();
      });
    };
  }, [flush, send, persist]);

  return { trackEvent, flush };
}

/** Cap a held queue, keeping the newest events. */
function capHeld(queue: { current: SignalEvent[] }) {
  if (queue.current.length > SIGNAL_BATCH.MAX_HELD_EVENTS) {
    queue.current = queue.current.slice(-SIGNAL_BATCH.MAX_HELD_EVENTS);
  }
}
