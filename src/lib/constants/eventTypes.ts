/**
 * Signal event type enums (Frontend Architecture Section 3).
 *
 * Every interaction in the Intelligence Framework's signal layer is captured as
 * a structured event and batched by the `useSignals` hook before being flushed
 * to the backend (`/api/signals/`).
 *
 * TODO(intelligence): reconcile the full event catalogue with the backend
 * Intelligence Framework spec — the events below are those named in Section 3.
 */
export const SIGNAL_EVENT_TYPES = {
  TIME_ON_SEGMENT: "time_on_segment",
  /**
   * A finished narration clip restarted. NOT `narration_replayed`, although
   * that is in the ingest enum too: the deployed enum carries no description
   * saying how the two differ, and sending both for one restart would count it
   * twice. `replay` is what this client has always sent; asked, 1 Oct.
   */
  REPLAY: "replay",
  SCROLL: "scroll",
  SIMPLIFY_TRIGGER: "simplify_trigger",
  /** Density triggers are distinct event types in the backend contract. */
  EXPAND_TRIGGER: "expand_trigger",
  SLOWER_TRIGGER: "slower_trigger",
  COMPREHENSION_RESPONSE: "comprehension_response",
  EXIT_ATTEMPT: "exit_attempt",
  /**
   * The calculation solver (17b). All three are in the backend's own ingest
   * enum and none of them existed here, so the solver - the accessibility
   * centrepiece, and the one component that teaches across every modality -
   * produced no evidence of its own. Steps rode `comprehension_response`
   * under a `kind` of our invention; solving emitted nothing at all; and a
   * child placing tiles on the kinesthetic layer, where the placement is
   * their working, emitted nothing either.
   */
  CALCULATION_STEP_RESPONSE: "calculation_step_response",
  CALCULATION_COMPLETE: "calculation_complete",
  MANIPULATIVE_PIECE_PLACED: "manipulative_piece_placed",
  /** Module boundary screen shown (SCRUM-101) — payload { moduleId }. */
  MODULE_BOUNDARY_REACHED: "module_boundary_reached",
  /** The student's boundary choice — payload { moduleId, action: continue|break }. */
  MODULE_BOUNDARY_ACTION: "module_boundary_action",
  /**
   * Touch Signal Contract (SCRUM-94.8): every window in which the system, not
   * the student, owns the wait — so idle time inside it is never misread as
   * hesitation. ONE event per window, sent as it closes: payload
   * { reason, durationMs }, the catalogue's two keys. The contract's own
   * start/end `phase` pair is not on the wire - see `openBusyWindow`.
   */
  SYSTEM_BUSY: "system_busy",
  /**
   * A tap on an inert scrim (SCRUM-94.8 G1). Diagnostic only — recorded as
   * blocked, never written to latency or aborted-gesture channels. It tells us
   * the scrim still read as tappable: a design signal, not a student one.
   * Payload { target, reason }; the reason is the busy window it fell in.
   */
  TAP_BLOCKED: "tap_blocked",
  /**
   * One per session, at start (G6): the form factor and reduced-motion mode the
   * whole session's signals should be interpreted under. Payload
   * { formFactor, reducedMotion } - backend's two keys, 1 Oct.
   */
  SESSION_CONTEXT: "session_context",
  /**
   * Break module (frame 18) — brackets the student's pause so time inside it is
   * break time, not hesitation. Payload { trigger } / { trigger, durationMs }.
   */
  BREAK_START: "break_start",
  BREAK_END: "break_end",
  /**
   * The consolidation break's feeling check-in — payload { response: string[] },
   * the catalogue's key for what the child picked. Qualitative, multi-select,
   * never scored; skipping is a legitimate answer.
   */
  FEELING_CHECKIN: "feeling_checkin",
  /**
   * What happened to an offer the engine made. Each is in the ingest enum,
   * and at first none was sent, so a "Not now" left no trace and the engine
   * could not tell an offer a child turned down from one it never saw.
   * Payload { segmentId, suggested } / { trigger } for the three break ones.
   *
   * `ignored` is the pill still on screen when the child left the segment -
   * neither taken nor turned down. A break offer left on screen has no type:
   * it stays no answer, which is what `break_declined` exists to tell apart.
   */
  MODALITY_SUGGESTION_SHOWN: "modality_suggestion_shown",
  MODALITY_SUGGESTION_ACCEPTED: "modality_suggestion_accepted",
  MODALITY_SUGGESTION_DECLINED: "modality_suggestion_declined",
  MODALITY_SUGGESTION_IGNORED: "modality_suggestion_ignored",
  BREAK_SUGGESTED: "break_suggested",
  BREAK_TAKEN: "break_taken",
  BREAK_DECLINED: "break_declined",
  /** A real narration clip started for the first time on this visit. */
  NARRATION_PLAYED: "narration_played",
  /**
   * A lesson picture or recording that would not load, after its one fresh
   * link (B12) - payload { segmentId, channel: "image" | "audio", reason }.
   * The rest of the segment stays usable; this is so the engine does not read
   * a child who never saw the picture as one who looked at it.
   */
  MEDIA_LOAD_FAILED: "media_load_failed",
  /**
   * The engine's unrequested hint (`offer_hint`) went on screen (B20) -
   * payload { segmentId }. Once per hint per segment.
   */
  HINT_OFFERED: "hint_offered",
  /**
   * The child acted on a hint (B41): opened one they had to open, or moved on
   * after one shown in full - payload { segmentId }. A hint shown and closed
   * or left is `hint_offered` alone.
   */
  HINT_USED: "hint_used",
  /**
   * A guided prompt was on screen in the opened socratic panel (B20) -
   * payload { segmentId, promptId }. The reply is not a client event: the
   * answer route puts `guided_question_answered` on the stream itself.
   */
  GUIDED_QUESTION_SHOWN: "guided_question_shown",
  /**
   * Ask Nevo, on its own `ask_nevo` session (design D29: a child's use of Ask
   * Nevo is signal in its own right). A question asked, an answer that could
   * not help, and the hand-over to the teacher taken. The payload is the
   * server's own `interactionId` where there is one and nothing else - never
   * the child's words.
   */
  ASK_NEVO_QUESTION_STUDENT: "ask_nevo_question_student",
  ASK_NEVO_CANNOT_HELP: "ask_nevo_cannot_help",
  ASK_NEVO_REDIRECT_USED: "ask_nevo_redirect_used",
} as const;

/**
 * TYPES THE SERVER WRITES ITSELF, which the client must never send (backend,
 * 5 Oct, B37; `serverWritten: true` in `GET /api/signals/catalogue`).
 *
 * `adaptation_suppressed` is recorded by the server when it holds an
 * adaptation back, and `guided_question_answered` by the guided-question
 * answer route. A client that sends either doubles that count - and from
 * #623 until 6 Oct this one did send `adaptation_suppressed`, whenever the
 * player's own rules kept an engine suggestion off screen. Not in
 * `SIGNAL_EVENT_TYPES`, so nothing here can emit them, and refused again at
 * the door in `signalsApi.submitBatch`.
 */
export const SERVER_WRITTEN_EVENT_TYPES: ReadonlySet<string> = new Set([
  "adaptation_suppressed",
  "guided_question_answered",
]);

/** `system_busy` reasons — the closed set from the Touch Signal Contract. */
export const BUSY_REASON = {
  AUTH_PENDING: "auth_pending",
  CONTENT_LOADING: "content_loading",
  TRANSITION_SCREEN: "transition_screen",
  CONFIRMATION_HOLD: "confirmation_hold",
  MODALITY_SWITCH: "modality_switch",
  VIEW_TRANSITION: "view_transition",
  MEDIA_PLAYING: "media_playing",
  BLOCKED_BY_MODAL: "blocked_by_modal",
} as const;

export type BusyReason = (typeof BUSY_REASON)[keyof typeof BUSY_REASON];

/**
 * Where a busy window is, for code that opens and closes one from two places
 * (the player's audio and its modality switch). Never sent: the window goes
 * up as one `system_busy` with its length - see `openBusyWindow`.
 */
export const BUSY_PHASE = {
  START: "start",
  END: "end",
} as const;

export type BusyPhase = (typeof BUSY_PHASE)[keyof typeof BUSY_PHASE];

/**
 * The baseline run's own markers, tracked by `ProfilingFlow` on a `profiling`
 * stream of their own (B43, 5 Oct), not the onboarding sequence's. In the
 * ingest enum as of 1 Oct, so they are sent now; until then `signalsApi`
 * dropped all three. The measurement itself goes up as raw trials through
 * `POST /api/baseline/trials` (B9) - these mark its phases.
 */
export const ONBOARDING_SIGNAL_TYPES = {
  // The OIS activity events (sort_placement, audio_response, pattern_tap,
  // memory_flip) retired with the sequence itself — baseline profiling
  // (SCRUM-104) replaced it as onboarding Phase C.
  /** Baseline profiling (SCRUM-104) — module lifecycle in the session stream. */
  BASELINE_MODULE_START: "baseline_module_start",
  BASELINE_MODULE_COMPLETE: "baseline_module_complete",
  /** The run's trials reached the server (raw stream purged). */
  BASELINE_SUBMITTED: "baseline_submitted",
} as const;

export type SignalEventType =
  | (typeof SIGNAL_EVENT_TYPES)[keyof typeof SIGNAL_EVENT_TYPES]
  | (typeof ONBOARDING_SIGNAL_TYPES)[keyof typeof ONBOARDING_SIGNAL_TYPES];

/** Signal batching thresholds (Section 3). */
export const SIGNAL_BATCH = {
  /** Flush at least this often. */
  FLUSH_INTERVAL_MS: 5_000,
  /** Flush immediately once a batch reaches this many events. */
  MAX_BATCH_SIZE: 20,
  /**
   * The most one request may carry: `SignalBatchRequest.events` is
   * `maxItems: 100`. A held or re-queued backlog is larger than that, and sent
   * whole it was refused 422 and dropped, every event in it.
   */
  MAX_EVENTS_PER_REQUEST: 100,
  /**
   * Most events a HELD queue keeps while it waits for the session id the
   * ingest contract requires. A stream that can never send - a mock lesson,
   * or an onboarding flow with no lesson session - would otherwise grow for
   * as long as the screen is open. The newest are kept.
   */
  MAX_HELD_EVENTS: 200,
} as const;
