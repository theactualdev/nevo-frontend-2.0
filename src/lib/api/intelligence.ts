import { api } from "./client";

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
  /** Typed, deliberately unsent - see `useRuntimeAdaptation`. */
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
  } | null;
  modalitySuggestion: ModalitySuggestionResponse | null;
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
   */
  getAdaptation: (
    lessonId: string,
    segments: AdaptSegment[],
    options: {
      studentId?: string | null;
      mode?: AdaptationMode;
      /** Omitted on `lesson_load`; the engine's neutral defaults apply. */
      signals?: RuntimeSignals;
    } = {},
  ) =>
    api.post<AdaptResponse>("/api/intelligence/adapt", {
      lessonId,
      segments,
      studentId: options.studentId ?? null,
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
};
