import { api } from "./client";
import { SERVER_WRITTEN_EVENT_TYPES, type SignalEventType } from "@/lib/constants";

/**
 * Signal batch submission (FE Architecture §3) - wired to the live backend
 * (`POST /api/signals/`, Bearer). Batching/flushing lives in the `useSignals`
 * hook, and in `lib/signals/outbox` for a batch the lesson could not send;
 * this module shapes a flushed batch to the ingest contract.
 *
 * The backend validates `eventType` against a closed enum, so a batch may only
 * carry types it knows - one unknown type rejects the whole batch (422). As of
 * 1 Oct every type we emit is in that enum, so nothing is partitioned out; a
 * type that is ours alone would go in `CLIENT_ONLY_EVENT_TYPES`.
 */
export interface SignalEvent {
  type: SignalEventType;
  timestamp: string;
  payload?: Record<string, unknown>;
}

/**
 * What a stream of signals belongs to.
 *
 * Onboarding and profiling are not lessons, and used to be sent with a made-up
 * lesson tag in `lessonId` because the field was required. `lessonId` is now
 * nullable and this says what the stream actually is (backend, 3 Sep).
 * `ask_nevo` joined on 1 Oct: Ask Nevo's events are not a lesson's.
 */
export type SignalSessionType =
  | "lesson"
  | "onboarding"
  | "profiling"
  | "sso"
  | "ask_nevo";

/** The session envelope the ingest endpoint requires with every batch. */
export interface SignalSessionEnvelope {
  sessionId: string;
  /**
   * The lesson this stream belongs to. NULL for a stream that is not a lesson
   * - see `sessionType`, which is how the backend tells them apart now.
   */
  lessonId: string | null;
  /** Defaults to "lesson" server-side, so non-lesson streams must say so. */
  sessionType?: SignalSessionType;
  /** ISO timestamp of the session's first event capture. */
  startedAt: string;
  /**
   * How the session ended, once it has. All four default server-side
   * (`in_progress`, no end, no position, 0 breaks), so a stream that never
   * said otherwise told the engine every lesson was abandoned mid-way with no
   * break taken. Omitted, not nulled, until there is something true to say.
   */
  endedAt?: string;
  completionStatus?: "completed" | "exited";
  /** `maxLength: 120`. The segment id the child left from. */
  exitPosition?: string;
  breakCount?: number;
  /**
   * Adaptations the child actually saw applied (B42) - not offers, not
   * decisions held back. Omitted while none has been, like `breakCount`.
   */
  proactiveAdjustmentsCount?: number;
}

/** 202 receipt. */
export interface SignalBatchReceipt {
  sessionId: string;
  acceptedEvents: number;
}

/**
 * The types we emit that the ingest enum does NOT accept, so they are dropped
 * before a batch is posted.
 *
 * **EMPTY AS OF 1 OCT, AND THAT IS THE GOAL.** The six that sat here last -
 * `system_busy`, `tap_blocked`, `session_context` and the baseline run's three
 * markers - are all in the deployed `SignalEventType` now (backend's B13), so
 * they travel. The busy brackets and blocked taps are how the engine tells a
 * wait the system owned from a child hesitating, and the context says which
 * form factor and motion mode a session's timings came from; holding them back
 * left the engine to read every one of those as the child.
 *
 * `module_boundary_action` was the gap before them, added on 24 Sep.
 *
 * Kept as a place rather than deleted: a type we invent goes here, says on its
 * line why it is ours, and is dropped rather than 422ing the batch around it.
 *
 * **THIS USED TO BE THE OTHER WAY ROUND, AND IT COST US NINE SIGNAL TYPES.**
 * It was an allow-list naming every value the backend accepted - a second copy
 * of `SignalEventType` maintained by hand - and the enum grew from 22 to 31
 * without it. So `break_start`, `break_end`, `feeling_checkin` and
 * `module_boundary_reached` were delivered by backend on request, emitted by
 * this client, and then thrown away at our own door. Four of them were things
 * we had ASKED for.
 *
 * Inverting it inverts the maintenance burden. A value backend adds now flows
 * without a client change; only a type WE invent needs an entry here, and we
 * know when we do that because we are the ones writing it.
 *
 * Safe because `SignalEvent.type` is `SignalEventType`, our own union - so
 * nothing outside the names `SIGNAL_EVENT_TYPES` and `ONBOARDING_SIGNAL_TYPES`
 * define can reach this filter at all. With nothing filtered, one of those
 * names the enum lacks would 422 the whole batch around it, so
 * `signals.test.ts` pins every one against the enum as deployed.
 *
 * Each entry says why it is ours rather than theirs.
 */
const CLIENT_ONLY_EVENT_TYPES = new Set<string>([]);

export const signalsApi = {
  /**
   * Submit a flushed batch. Resolves with the receipt, or `null` when nothing
   * in the batch is backend-known (no request made).
   */
  submitBatch: (
    session: SignalSessionEnvelope,
    events: SignalEvent[],
    /**
     * `keepalive` lets the request outlive the page - the flush a tab makes
     * as it is hidden or closed. Bearer rules out `sendBeacon`.
     */
    options: { keepalive?: boolean } = {},
  ): Promise<SignalBatchReceipt | null> => {
    // Ours alone, or the server's own to write (B37) - neither travels.
    const known = events.filter(
      (e) =>
        !CLIENT_ONLY_EVENT_TYPES.has(e.type) &&
        !SERVER_WRITTEN_EVENT_TYPES.has(e.type),
    );
    if (process.env.NODE_ENV === "development" && known.length < events.length) {
      const dropped = events
        .filter(
          (e) =>
            CLIENT_ONLY_EVENT_TYPES.has(e.type) ||
            SERVER_WRITTEN_EVENT_TYPES.has(e.type),
        )
        .map((e) => e.type);
      console.debug("[signals] dropped types outside the ingest enum:", [
        ...new Set(dropped),
      ]);
    }
    if (known.length === 0) return Promise.resolve(null);
    // No trailing slash: Next 308-redirects slashed API routes before the
    // proxy runs; FastAPI's own slash redirect is followed server-side.
    return api.post<SignalBatchReceipt>(
      "/api/signals",
      {
        session: {
          sessionId: session.sessionId,
          lessonId: session.lessonId,
          sessionType: session.sessionType ?? "lesson",
          startedAt: session.startedAt,
          ...(session.endedAt ? { endedAt: session.endedAt } : {}),
          ...(session.completionStatus
            ? { completionStatus: session.completionStatus }
            : {}),
          ...(session.exitPosition
            ? { exitPosition: session.exitPosition.slice(0, 120) }
            : {}),
          ...(session.breakCount ? { breakCount: session.breakCount } : {}),
          ...(session.proactiveAdjustmentsCount
            ? { proactiveAdjustmentsCount: session.proactiveAdjustmentsCount }
            : {}),
        },
        events: known.map((e) => ({
          sessionId: session.sessionId,
          eventType: e.type,
          timestamp: e.timestamp,
          eventData: e.payload,
        })),
      },
      options.keepalive ? { keepalive: true } : undefined,
    );
  },
};
