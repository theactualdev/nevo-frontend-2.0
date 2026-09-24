import { api } from "./client";
import type { SignalEventType } from "@/lib/constants";

/**
 * Signal batch submission (FE Architecture §3) - wired to the live backend
 * (`POST /api/signals/`, Bearer). Batching/flushing lives in the `useSignals`
 * hook; this module shapes a flushed batch to the ingest contract.
 *
 * The backend validates `eventType` against a closed enum, so a batch may only
 * carry types it knows - one unknown type rejects the whole batch (422).
 * Types outside the enum (session context, system-busy brackets, module
 * boundaries, breaks, baseline profiling) are partitioned out at submit and
 * dropped after a dev-console note.
 * TODO(api): flagged to backend - extend SignalEventType with the Touch Signal
 * Contract + SCRUM-101/104 types so the full stream can land.
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
 */
export type SignalSessionType = "lesson" | "onboarding" | "profiling" | "sso";

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
 * **EVERY ENTRY IS NOW GENUINELY OURS.** `module_boundary_action` sat here as
 * the one real gap - a signal we collected and discarded because the enum had
 * no value for it - and backend added it on 24 Sep. Nothing here is waiting on
 * anybody any more; if that changes, say so on the line.
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
 * nothing outside the 22 names we define can reach this filter at all.
 *
 * Each entry says why it is ours rather than theirs.
 */
const CLIENT_ONLY_EVENT_TYPES = new Set<string>([
  // Client-only instrumentation. These describe the interface's own state
  // rather than anything a child did, and have never been asked for.
  "system_busy",
  "tap_blocked",
  "session_context",

  // The baseline run reports through `POST /api/baseline/submit` as a reduced
  // vector, not through the signal stream. These three mark its phases on
  // device only.
  "baseline_module_start",
  "baseline_module_complete",
  "baseline_submitted",
]);

export const signalsApi = {
  /**
   * Submit a flushed batch. Resolves with the receipt, or `null` when nothing
   * in the batch is backend-known (no request made).
   */
  submitBatch: (
    session: SignalSessionEnvelope,
    events: SignalEvent[],
  ): Promise<SignalBatchReceipt | null> => {
    const known = events.filter((e) => !CLIENT_ONLY_EVENT_TYPES.has(e.type));
    if (process.env.NODE_ENV === "development" && known.length < events.length) {
      const dropped = events
        .filter((e) => CLIENT_ONLY_EVENT_TYPES.has(e.type))
        .map((e) => e.type);
      console.debug("[signals] dropped types outside the ingest enum:", [
        ...new Set(dropped),
      ]);
    }
    if (known.length === 0) return Promise.resolve(null);
    // No trailing slash: Next 308-redirects slashed API routes before the
    // proxy runs; FastAPI's own slash redirect is followed server-side.
    return api.post<SignalBatchReceipt>("/api/signals", {
      session: {
        sessionId: session.sessionId,
        lessonId: session.lessonId,
        sessionType: session.sessionType ?? "lesson",
        startedAt: session.startedAt,
      },
      events: known.map((e) => ({
        sessionId: session.sessionId,
        eventType: e.type,
        timestamp: e.timestamp,
        eventData: e.payload,
      })),
    });
  },
};
