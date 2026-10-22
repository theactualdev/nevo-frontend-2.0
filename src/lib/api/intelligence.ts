import { api } from "./client";
import type { LessonChoice, SegmentFormatChoice } from "./lessons";
import type { AccommodationType } from "./students";

/**
 * Intelligence Framework endpoints (FE Architecture §1 & §4): learner profile,
 * lesson adaptation, attention flags, and recommendations.
 *
 * A flag names a student by id and describes what Nevo noticed, in the same
 * plain register the console writes in.
 *
 * This file used to say a flag carried no evidence series and no action
 * target, and that the C03 card's sparkline and its two links therefore had no
 * source. Backend has since added `evidenceSeries` and `actionTargets`, so
 * both are typed below and both are optional - an older row may still arrive
 * without them. The correction is left visible rather than quietly swapped in.
 *
 * `flagType` DOES have an enum now - `AttentionFlagType`, two values:
 * `engagement_decline` and `sudden_change`, read off the deployed spec on
 * 17 Sep. This file said it had none. It stays typed as a string all the same:
 * backend adds enum values ahead of us by design, and an unrecognised one
 * must still render rather than crash a teacher's screen.
 *
 * Zero-Tag holds here: `description` is about behaviour in the moment, never a
 * diagnosis. Nothing on this route may be rendered as a label about a child.
 *
 * TODO: type `getProfile`, `getAdaptation` and `getRecommendations` too.
 */

export interface AttentionFlag {
  id: string;
  studentId: string;
  /**
   * `AttentionFlagType`, deliberately widened to a string - see above. Never
   * rendered as a label about a child: `description` is the substance.
   */
  flagType: string;
  description: string;
  generatedAt: string;
  acknowledged: boolean;
  /** Present on newer rows only - a small series behind the description. */
  evidenceSeries?: number[];
  /** Where an admin can act. Absent means the flag is informational. */
  actionTargets?: string[];
}
/**
 * One segment as the adaptation engine needs to see it (`ContentSegmentRequest`).
 * Deliberately the engine's shape, not the player's - a lesson segment carries
 * far more, and none of the rest is read here.
 */
export interface AdaptSegment {
  id: string;
  segmentType: AdaptSegmentType;
  /** At least one - the contract sets minItems: 1. */
  availableModalities: string[];
  conceptId?: string | null;
  /** `exclusiveMinimum: 0` - a 0 is a 422, so "no estimate" is omitted. */
  estimatedMinutes?: number | null;
  /**
   * Which rewrites this segment actually has, so the engine does not instruct
   * one it has not got.
   *
   * **OMITTED AND EMPTY ARE DIFFERENT ANSWERS, and that is backend's own
   * distinction:** *"omitting the field and sending [] are different answers -
   * omitted means 'I didn't say' and you get today's behaviour exactly."* So
   * `[]` is a positive claim that a segment has neither rewrite, and it is
   * only ever sent when we have actually looked.
   *
   * This moves a check the player already makes to the side that can act on
   * it. The player still refuses a density it cannot deliver - that guard is
   * not removed, because an instruction can still arrive from a plan built
   * before this field, and rule 5 does not stop applying because an upstream
   * got better.
   */
  availableDepths?: ("simplified" | "expanded")[] | null;
}

/**
 * `ContentSegmentType` - the engine's own vocabulary, and NOT the same enum as
 * a lesson's `contentType` (`LessonContentType`). `calculation` joined it on
 * 7 Sep, so the two now share four values - but `explanatory_text`,
 * `practice_question` and `visual_diagram` still have no counterpart, and
 * sending one is a 422, verified against the deployed API. The translation
 * lives with the lesson adapter, in `lib/lessons/adaptation.ts`.
 */
export type AdaptSegmentType =
  | "diagram"
  | "worked_example"
  | "explanation"
  | "definition"
  | "summary"
  | "practice"
  | "interaction"
  | "checkpoint"
  | "calculation";

/** `lesson_load` on open; `in_lesson` while the child is working. */
export type AdaptationMode = "lesson_load" | "in_lesson";

/**
 * `RuntimeSignalsRequest` - what the player can tell the engine mid-lesson.
 *
 * ONLY OBSERVED FACTS ARE TYPED HERE. The contract also accepts
 * `engagementScore`, `engagementBaseline`, `comprehensionScore`,
 * `sessionAverageComprehension`, `accuracyBelowBaseline` and
 * `responseTimeBelowBaseline`. Every one of those is a MEASUREMENT of a child
 * that this app cannot make: nothing defines engagement client-side, there is
 * no baseline to compare against, and a comprehension score is a score - the
 * checks are marked, but turning marks into a number is the engine's job.
 * Sending a number we invented would be worse than sending nothing - the
 * engine would act on it, and a child would be adapted against a figure we
 * made up.
 *
 * `consecutiveErrors` used to be listed with them and is not one: it is a
 * count of wrong answers in a row, as observed as a replay count.
 *
 * What is here is time, position and what the child actually did. Checked
 * against the deployed engine: those alone earn a real break -
 * `continuousMinutes: 25` returns `severity: "mild"`, `breakType: "movement"`,
 * `triggeredThresholds: ["time_threshold"]`.
 */
export interface RuntimeSignals {
  currentSegmentId?: string | null;
  /** `ContentModality`. */
  currentModality?: string | null;
  availableModalities?: string[];
  /** Minutes of unbroken work this session. Drives `time_threshold`. */
  continuousMinutes?: number;
  currentSegmentElapsedSeconds?: number | null;
  midpointReached?: boolean;
  replayCountOnSegment?: number;
  consecutiveErrors?: number;
  sessionModalityShiftCount?: number | null;
  /**
   * Since an adaptation was last APPLIED ON SCREEN (B42) - not decided, not
   * asked for. Null when none has been this session. See
   * `useRuntimeAdaptation`.
   */
  secondsSinceLastAdaptation?: number | null;
  /** Modalities the child was offered and turned down. */
  declinedModalities?: string[];
  sessionDeclineCount?: number;
  sameSegmentSuggestionShown?: boolean;
  segmentsSinceLastSuggestion?: number | null;
}

/**
 * `AdaptResponse`, snake_case - one of the few routes that is. Every field
 * below is REQUIRED by the contract except the two nullable suggestions.
 *
 * `confidence`, `adaptationConfidence` and every score behind them are engine
 * parameters: they may decide what the interface does and must never be
 * rendered to a child (Zero-Tag).
 */
export interface SegmentAdaptationResponse {
  segmentId: string;
  /** `ContentModality` - visual | audio | text | interactive. */
  modality: string;
  /** `DensityLevel` - low | medium | high. NOT the player's Density. */
  density: string;
  /** `ScaffoldingLevel` - none | light | standard | strong. */
  scaffolding: string;
  priority: number;
  /**
   * SCRUM-272, 21 Oct: the same availability and recommendation as the
   * lesson read's section (`LessonSegment.availableFormats`), as of this
   * answer - so the fresher of the two is read. Optional: an answer from
   * before them carries neither.
   */
  availableFormats?: string[];
  recommendedFormat?: string | null;
  /**
   * The child's own choice for this section echoed back (K4): the engine
   * "respects the explicit format, returns chosenDepth/slower". TYPED, NOT
   * READ - the choice is read from the lesson and the sitting, and an echo
   * of it is not a second source.
   */
  chosenDepth?: "original" | "simplified" | "expanded" | null;
  slower?: boolean | null;
}

export interface BreakSuggestionResponse {
  triggeredThresholds: string[];
  severity: string;
  /** `BreakType`, null when nothing is suggested. */
  breakType: string | null;
  reason: string | null;
}

export interface ModalitySuggestionResponse {
  /** `ContentModality`. */
  suggested: string;
  triggerReason: string;
  confidence: string;
  adaptationConfidence: number;
}

export interface AdaptResponse {
  lessonId: string;
  /** e.g. `rule_based` - which engine answered. */
  source: string;
  segments: SegmentAdaptationResponse[];
  breakSuggestion: BreakSuggestionResponse;
  /**
   * The engine's instruction, and - since 21 Sep - the content two of its six
   * actions need to mean anything.
   *
   * `hint` and `guidedQuestions` were the two asks filed on 17 Sep: `offer_hint`
   * had no hint to show and `show_socratic_panel` had no questions, so both
   * rendered the nothing-state on every real lesson. Three of the four
   * affective responses were unreachable for a signed-in child.
   *
   * NEITHER IS IN THE SCHEMA'S `required` LIST, checked against the deployed
   * spec, so absent stays a genuine case rather than a defensive one - an
   * instruction can still arrive with nothing to render, and rule 5 says the
   * nothing-state is the answer.
   *
   * `reason` and `confidence` ride the same object and remain off-limits:
   * these two are child-facing by design, that pair is the reasoning frame 38
   * forbids showing.
   */
  proactiveAdjustment: {
    action: string;
    reason: string;
    hint?: string | null;
    guidedQuestions?: string[];
    /** `GuidedPrompt[]` (1 Oct): the same questions, answerable. */
    guidedPrompts?: { id: string; prompt: string; options?: string[] }[];
    /**
     * The segment this instruction is for (B46): always the one the request
     * named, and where the engine ever means another it says so here.
     */
    segmentId?: string | null;
  } | null;
  /**
   * DEPRECATED AND ALWAYS NULL since 21 Oct: "Retired separate pill. Use each
   * segment's recommendedFormat in its format control" (spec). Read by
   * nothing - the pill it fed is gone (SCRUM-271/272).
   */
  modalitySuggestion: ModalitySuggestionResponse | null;
  /**
   * The decision the instruction was recorded under. Help still active is
   * RESENT WITH ITS EXISTING ID (Teslim, 22 Oct, answer 3), so a resend is
   * the same help, not a new offer. TYPED, NOT READ: a resend carries the
   * same instruction and the same words, and the player's once-only rules -
   * `hint_offered` once per hint per section, the reshape and the panel
   * counted once as applied, a closed hint staying closed - are already
   * keyed on those, so a second key would decide nothing differently.
   */
  decisionId?: string | null;
  /**
   * WHAT BECOMES OF THE HELP ON SCREEN (backend 864dff0, Teslim's answer 3):
   * `apply` shows the new instruction; `retain` keeps what is on screen, even
   * when `proactiveAdjustment` is null - "null alone no longer means
   * dismiss"; `clear` removes it. The contract's default is `clear`, so an
   * answer without it reads as before. See `useRuntimeAdaptation`.
   */
  adjustmentDisposition?: "apply" | "retain" | "clear";
  /**
   * When the engine's adaptation cooldown ends. INFORMATION ONLY - TYPED, NOT
   * READ: Teslim asked for no re-read at it, and a cooldown is not a
   * dismissal (`retain` says so).
   */
  cooldownUntil?: string | null;
  /**
   * When the question's grace window ends (backend 7d97248) - the same
   * moment as the attempt's `handoffAvailableAt` for the question in front
   * of the child: both are `guidance_deadline` over the same run of misses.
   * TYPED, NOT READ: the player already reads the attempts once at that
   * moment, which hands the panel off (`rereadAt` in the player); a second
   * ask, of the engine, could only offer its own panel for the same question
   * - which the player does not draw while the hand-off's is open - or say
   * `retain`, which nothing on screen needs at that point.
   */
  supportGraceUntil?: string | null;
}

/**
 * `GuidedAnswerRequest` - a child's reply to one guided prompt.
 *
 * THEIR WORDS ARE NOT IN IT, by the contract's design: "the panel sends the
 * option they picked, or how much they wrote, and the words stay where they
 * were typed." So `responseLength` is a count and there is no text field to
 * fill, even by mistake.
 */
export interface GuidedAnswerRequest {
  studentId: string;
  sessionId?: string | null;
  promptId: string;
  conceptId?: string | null;
  /** The option picked, for a prompt that offers options. */
  option?: string | null;
  /** How much the child wrote, for a prompt that has none. 0 to 10000. */
  responseLength?: number | null;
  /** The contract's default is `moved_on`; sent explicitly all the same. */
  outcome: "moved_on" | "asked_again" | "abandoned";
}

/**
 * `EngineConfig` - the engine's settings for one child, typed since B24.
 *
 * TWO HALVES, as backend split them on 9 Oct (B103). `reading` and `pacing`
 * are the server's own inference parameters, "returned for transparency
 * rather than direct UI control": a reading speed, a word target, how long a
 * pause is. The client reports timing and applies none of them, and a number
 * about a child's reading or attention is never rendered (Zero-Tag).
 *
 * `support` is the client's to apply, and each field is acted on only as far
 * as the spec says what it does:
 * - `initialScaffoldLevel`, "Client-applied starting level for calculation
 *   scaffolds": the scaffold indicator's level while the solver is on screen,
 *   until something more specific is said (`AdaptationPlan.initialScaffold`).
 * - `comprehensionCheckInterval`, "Maximum desired gap between authored
 *   checks. The client never invents a question; it presents the next
 *   checkpoint carried by the lesson" (B115, 13 Oct): NOT ACTED ON, because
 *   there is nothing to act on. The player already offers every check a
 *   lesson carries and holds none back, and a gap the content leaves is for
 *   parsing and teacher review to fill.
 * - `numberProblemsStepByStep`: NOT ACTED ON. The spec now says "When true,
 *   force authored calculation steps to be shown one at a time", and the
 *   solver already gives one step at a time whatever the flag says (17b).
 * - `shorterTextBlocks` (B114, 13 Oct): "use the readingChunks supplied by
 *   the server. The client must not split prose itself." Nothing reads the
 *   flag, because nothing needs to: every passage that came with chunks is
 *   already drawn in them (17c, SCRUM-237), for every child, and no view
 *   splits a body that came without. What `false` should take away, and
 *   whether `true` should do more, is asked.
 */
export interface EngineConfig {
  version?: number;
  reading?: {
    targetWordsPerMinute?: number;
    segmentWordTarget?: number;
    /*
     * Set by a session's delivery snapshot for a reading accommodation
     * (`session_delivery.py`, 18 Oct). Typed, NOT APPLIED: the spec files
     * `reading` as "returned for transparency rather than direct UI
     * control", and whether these should drive the reading style instead of
     * `accommodations: ["reading"]` is asked (20 Oct contract check).
     */
    fontScale?: number;
    lineSpacing?: number;
    contrast?: "standard" | "soft";
  };
  pacing?: { responseTimeTargetMs?: number; attentionWindowMinutes?: number };
  support?: {
    /** `ScaffoldingLevel`. */
    initialScaffoldLevel?: "none" | "light" | "standard" | "strong";
    comprehensionCheckInterval?: number;
    numberProblemsStepByStep?: boolean;
    shorterTextBlocks?: boolean;
    /*
     * Both default false and the spec gives them no description: typed, NOT
     * ACTED ON, and what each should do on the device is asked (20 Oct
     * contract check).
     */
    pauseBetweenSegments?: boolean;
    numericalVisuals?: boolean;
  };
  generatedFromBaselineAt?: string | null;
}

/**
 * `SessionDeliveryResponse` - one lesson session's delivery, frozen by the
 * server when the session opens (18 Oct): the engine config with the active
 * accommodations applied, and when it was taken. On `POST
 * /api/v1/lessons/{id}/session` and on a `nothing_landed` reroute. All three
 * are required. Typed, not read - see `LessonSessionResponse.deliveryState`.
 */
export interface SessionDelivery {
  engineConfig: EngineConfig;
  accommodations: AccommodationType[];
  capturedAt: string;
  /**
   * The format the child chose for each section of this sitting (K4, 21 Oct),
   * keyed by the segment's own id - the format ONLY since 741685e: depth and
   * Slower are the sitting's, in `lessonPreferences`. Absent on a sitting
   * from before it.
   */
  segmentChoices?: Record<string, SegmentFormatChoice>;
  /**
   * The sitting's depth and Slower (741685e, 22 Oct): one value for every
   * section, however many it was picked on. Absent on a server from before
   * it; empty for a new sitting, which inherits nothing.
   */
  lessonPreferences?: LessonChoice;
  /**
   * The engine's standing recommendation per section, keyed the same way.
   * TYPED, NOT READ: each section's own `recommendedFormat` already says it,
   * on the lesson read and on every engine answer.
   */
  recommendations?: Record<string, string>;
}

/**
 * `SessionStateResponse` - everything a lesson needs at the moment it starts
 * (B24): the engine's configuration, the accommodations and the consent
 * state, from one read at one moment so they cannot disagree.
 *
 * A child with no baseline yet is `configured: false` with the engine's
 * defaults, never nulls. `accommodations` and `consentState` are outside
 * the schema's `required` list, so either may be absent.
 */
export interface SessionState {
  studentId: string;
  configured: boolean;
  engineConfig: EngineConfig;
  baselineVersion: number | null;
  accommodations?: AccommodationType[];
  consentState?: "given" | "pending" | "withdrawn";
}

export const intelligenceApi = {
  getProfile: (studentId: string) =>
    api.get(`/api/intelligence/profile/${studentId}`),
  /**
   * Fetch the adapted lesson structure for a student (§4).
   *
   * `segments` is REQUIRED by `AdaptRequest` and was not being sent, so every
   * call would have 422'd - found by `scripts/contract-check.mjs` rather than
   * by anyone running it, because the only caller is currently unused. The
   * engine adapts a lesson it is shown, so the segments are the lesson: at
   * least one, each with an id, a type and the modalities it can be rendered
   * in.
   *
   * A STUDENT MAY CALL THIS FOR THEMSELVES. The route is Bearer with no role
   * restriction, and a student's own token returns 200 - checked against the
   * deployed API, not inferred from the spec. `useStudentLesson` said the
   * adaptation plan had no student-facing endpoint; that was wrong.
   *
   * `studentId` is nullable in the contract: the backend can take the student
   * from the token, so it is optional here rather than invented by the caller.
   *
   * `sessionId` IS THE LESSON SESSION THE CHILD IS SITTING, the id `POST
   * /api/v1/lessons/{id}/session` issued. An `in_lesson` read is refused 409
   * `lesson_session_required` unless that sitting is open
   * (`prepare_adaptation`), and naming it scopes the read, and the decisions
   * the engine records, to it. Sent only when given: `lesson_load` has no
   * sitting to name, and a null would be a claim that there is none.
   */
  getAdaptation: (
    lessonId: string,
    segments: AdaptSegment[],
    options: {
      studentId?: string | null;
      mode?: AdaptationMode;
      /** Omitted on `lesson_load`; the engine's neutral defaults apply. */
      signals?: RuntimeSignals;
      /** The backend's lesson session id - see above. */
      sessionId?: string | null;
    } = {},
  ) =>
    api.post<AdaptResponse>("/api/intelligence/adapt", {
      lessonId,
      segments,
      studentId: options.studentId ?? null,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      mode: options.mode ?? "lesson_load",
      ...(options.signals ? { signals: options.signals } : {}),
    }),
  getFlags: (params?: {
    classId?: string;
    studentId?: string;
    limit?: number;
    offset?: number;
  }) => api.get<AttentionFlag[]>("/api/intelligence/flags", { params }),

  /**
   * Every flag, for a count that has to be a TOTAL rather than a page.
   *
   * `GET /api/intelligence/flags` returns a BARE ARRAY capped at `limit`
   * (default 50, maximum 200). The unpaged total is reported in the
   * `X-Total-Count` header, which this client cannot reach - and it would not
   * help anyway: it counts FLAGS, and the only thing worth reporting to a
   * school is how many CHILDREN are involved. Deduplicating by `studentId`
   * needs the rows themselves.
   *
   * TERMINATION IS ON A SHORT PAGE, not on a total. `events.length < limit` is
   * the only exhaustion signal the contract actually supports; nothing
   * documents what a total would be scoped to.
   *
   * `complete: false` means the caller must not report a number. A count built
   * from the pages we managed to read is a FLOOR, and a floor rendered as a
   * total is the quiet under-report this console has shipped before.
   */
  allFlags: async (
    maxPages = 10,
  ): Promise<{ flags: AttentionFlag[]; complete: boolean }> => {
    const PAGE = 200;
    const flags: AttentionFlag[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const batch = await api.get<AttentionFlag[]>("/api/intelligence/flags", {
        params: { limit: PAGE, offset: page * PAGE },
      });
      if (!Array.isArray(batch)) return { flags, complete: false };
      flags.push(...batch);
      if (batch.length < PAGE) return { flags, complete: true };
    }
    // Ran out of pages with a full page still coming back: there is more we
    // have not seen, so say so rather than returning what we happen to hold.
    return { flags, complete: false };
  },

  /**
   * Acknowledge a flag: the SENCo has seen it and it stops asking.
   *
   * Not a dismissal and not a resolution - the flag stays on the record with
   * `acknowledged: true`, because what Nevo noticed remains true whether or
   * not somebody has read it.
   */
  acknowledgeFlag: (flagId: string) =>
    api.post<AttentionFlag>(`/api/intelligence/flags/${flagId}/acknowledge`),
  getRecommendations: (studentId: string) =>
    api.get(`/api/intelligence/recommendations/${studentId}`),

  /**
   * Send a child's reply to a guided prompt (B19).
   *
   * The server carries it onto the signal stream as
   * `guided_question_answered` - the route's own description says so - which
   * is why the player does not also emit that type: the engine would read
   * one reply as two.
   */
  answerGuidedQuestion: (body: GuidedAnswerRequest) =>
    api.post<{ recorded: boolean; promptId: string }>(
      "/api/intelligence/guided-questions/answer",
      body,
    ),

  /**
   * The session-start read. GET /api/session/state/{student_id} (B24)
   *
   * Frontend §1 and §4: read when a lesson opens, and the accommodations it
   * carries are applied before the first screen (rule 6). See
   * `useAccommodationsState`, its caller.
   */
  sessionState: (studentId: string) =>
    api.get<SessionState>(`/api/session/state/${studentId}`),
};
