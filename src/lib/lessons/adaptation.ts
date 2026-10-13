import type {
  AdaptResponse,
  AdaptSegment,
  AdaptSegmentType,
} from "@/lib/api/intelligence";
import type { LessonSegment as ContentSegment } from "@/lib/api/lessons";
import { MODALITY, type Modality } from "@/lib/constants";
import {
  ADJUSTMENT_ACTIONS,
  asAdjustmentAction,
} from "@/lib/constants/affect";
import { SCAFFOLD_LEVELS, type ScaffoldLevel } from "@/lib/constants/scaffold";
import type {
  AdaptationPlan,
  DensityLevel,
  GuidedPrompt,
  Lesson,
  SegmentAdaptation,
} from "@/lib/types";

/**
 * Between the adaptation engine and the player.
 *
 * These are two different vocabularies that happen to describe the same
 * lesson, and the previous code cast one to the other
 * (`setPlan(res as AdaptationPlan)`). That could never have worked: the wire
 * is snake_case with `segmentId`, the player is camelCase with `segmentId`,
 * so every per-segment lookup would have missed and every field read
 * undefined. Nothing consumed it, so nothing surfaced it.
 */

/**
 * Lesson `contentType` -> engine `segmentType`.
 *
 * NOT the same enum, and not a near-miss: they share only `worked_example`,
 * `definition` and `summary`. Sending a lesson's own `explanatory_text` gets a
 * 422 - verified against the deployed API, where it is also the type of every
 * segment in the only lesson that currently exists. So a pass-through would
 * fail on 100% of real content.
 *
 * `calculation` used to be the one genuine gap - the engine had no calculation
 * type, so this sent `worked_example` as the nearest honest neighbour and said
 * so. Backend added it natively on 7 Sep, and a calculation segment is now
 * described to the engine as what it is.
 *
 * The other three still have no counterpart and still need translating:
 * `explanatory_text`, `practice_question` and `visual_diagram`. This is not a
 * near-miss between two vocabularies, it is two vocabularies.
 */
const SEGMENT_TYPE: Record<string, AdaptSegmentType> = {
  explanatory_text: "explanation",
  visual_diagram: "diagram",
  worked_example: "worked_example",
  practice_question: "practice",
  definition: "definition",
  summary: "summary",
  calculation: "calculation",
};

/**
 * Engine `ScaffoldingLevel` (4 values) -> the indicator's `ScaffoldLevel`.
 *
 * The indicator draws 4 dots; the engine speaks in four levels, three of them
 * support and `none` (1 Oct) the engine saying it is giving none - drawn as
 * the indicator with no dot filled, which is not the same as no indicator.
 *
 * A value not in this map is NO LEVEL, not `light`. It used to fall back to
 * light - which the player also drew with no plan at all - so a word we did
 * not recognise became two filled circles about a child. Rule 5: the row
 * carries no scaffold and the indicator shows nothing.
 */
const SCAFFOLD: Record<string, ScaffoldLevel> = {
  none: SCAFFOLD_LEVELS.NONE,
  light: SCAFFOLD_LEVELS.LIGHT,
  standard: SCAFFOLD_LEVELS.MODERATE,
  strong: SCAFFOLD_LEVELS.FULL,
};

/**
 * One engine `ScaffoldingLevel` as the indicator draws it, by the same map as
 * a plan row's - or nothing, for a value it does not know.
 */
export function indicatorLevel(
  level: string | null | undefined,
): ScaffoldLevel | undefined {
  return level && Object.hasOwn(SCAFFOLD, level) ? SCAFFOLD[level] : undefined;
}

const MODALITIES: readonly string[] = Object.values(MODALITY);

function asModality(value: string | null | undefined): Modality | null {
  return value && MODALITIES.includes(value) ? (value as Modality) : null;
}

/** `DensityLevel`, exactly. A value we do not know is no instruction. */
const DENSITY_LEVELS: readonly string[] = ["low", "medium", "high"];

function asDensityLevel(value: string | null | undefined): DensityLevel | null {
  return value && DENSITY_LEVELS.includes(value) ? (value as DensityLevel) : null;
}

/**
 * The lesson as the engine needs to see it.
 *
 * `availableModalities` is `minItems: 1` in the contract and a parsed segment
 * can arrive with an empty list, so it falls back to text - which is what
 * `body` is, and is what the player would render anyway.
 */
export function adaptSegmentsFor(segments: ContentSegment[]): AdaptSegment[] {
  return segments.map((s) => ({
    id: s.id,
    segmentType: SEGMENT_TYPE[s.contentType] ?? "explanation",
    availableModalities: s.availableModalities.length
      ? s.availableModalities
      : [MODALITY.TEXT],
    /*
     * WHAT THIS SEGMENT CAN ACTUALLY BE RESHAPED INTO.
     *
     * Sent so the engine never instructs a `simplify` or an `expand` the
     * segment has no text for. We have read the segment, so `[]` is a real
     * answer here rather than a silence - backend: "omitting the field and
     * sending [] are different answers".
     *
     * The same emptiness test as `fromContent`, and for the same reason: a
     * rewrite that is blank, or identical to the source, is a reshape that
     * would re-render the same prose. Claiming it here would have the engine
     * confidently instruct a change a child cannot see.
     */
    availableDepths: depthsOf(s),
    /*
     * How long the segment is meant to take - the lesson's own figure, which
     * was typed here and never sent. Only a positive one: the wire's
     * `estimatedMinutes` defaults to 0 for "no estimate", the request is
     * `exclusiveMinimum: 0`, and a 0 sent through would 422 the whole call.
     */
    ...(typeof s.estimatedMinutes === "number" && s.estimatedMinutes > 0
      ? { estimatedMinutes: s.estimatedMinutes }
      : {}),
  }));
}

/** The depth keys a segment genuinely carries. See `adaptSegmentsFor`. */
function depthsOf(s: ContentSegment): ("simplified" | "expanded")[] {
  const base = s.body.trim();
  const real = (body: string | null | undefined) => {
    const text = body?.trim();
    return Boolean(text) && text !== base;
  };
  const depths: ("simplified" | "expanded")[] = [];
  if (real(s.depthVariants?.simplified?.body)) depths.push("simplified");
  if (real(s.depthVariants?.expanded?.body)) depths.push("expanded");
  return depths;
}

/**
 * The engine's answer, in the player's own terms.
 *
 * `density` IS CARRIED, AS `densityLevel` AND NEVER AS `density`. The
 * engine's `DensityLevel` (low/medium/high) is how dense the segment should
 * sit on screen; the player's `Density` (simplify/expand/slower) is which
 * authored RESHAPE of the text to show. Translating one into the other would
 * ask the player to render a variant that may not exist, and would light the
 * child's own control for something they never asked for. Design's ruling
 * (D25): density renders as spacing and how many elements sit in view at
 * once, never as a label or chip - see `densitySpacing`.
 *
 * WHAT IS DELIBERATELY NOT CARRIED:
 *
 * - `breakAfter`. `breakSuggestion` is one suggestion for the whole lesson,
 *   not per segment, and on `lesson_load` with no runtime signals it is always
 *   `severity: "none"` with a null type. It belongs to the `in_lesson` pass.
 * - the per-segment `adjustment`, `hint` and `socraticPrompts`. The engine's
 *   instruction arrives once for the whole lesson on `proactiveAdjustment`,
 *   which IS carried across (below) with its hint, questions and prompts;
 *   there is no per-segment one to read.
 */
export function toAdaptationPlan(
  res: AdaptResponse,
  lesson: Lesson,
): AdaptationPlan {
  const offered = new Map(lesson.segments.map((s) => [s.id, s.modalities]));
  const suggested = asModality(res.modalitySuggestion?.suggested);
  /*
   * The engine's instruction, carried for the first time.
   *
   * `proactiveAdjustment` has been on this response and typed in this client
   * for weeks with no reader. `reason`, `confidence` and `triggerSignals` ride
   * the same object and are deliberately NOT carried: frame 38 says the
   * learner is never shown the reasoning, and a confidence number is an engine
   * parameter that rule 3 keeps off every screen. Only the instruction crosses.
   */
  const adjustment = asAdjustmentAction(res.proactiveAdjustment?.action);

  /*
   * THE CONTENT IS TIED TO THE INSTRUCTION IT SERVES.
   *
   * `hint` and `guidedQuestions` landed on 21 Sep and answer the two asks that
   * left three of the four affective responses unreachable. They are carried
   * only under the action they belong to: the action is the instruction, and a
   * hint arriving beside `simplify` is not a hint anybody asked to show.
   * Stopping it here beats trusting every future consumer to check.
   *
   * An instruction can still arrive with nothing to render - neither field is
   * required by the schema - and that is rule 5, not a fault.
   */
  const hint =
    adjustment === ADJUSTMENT_ACTIONS.OFFER_HINT
      ? (res.proactiveAdjustment?.hint?.trim() ?? "")
      : "";
  const guidedQuestions =
    adjustment === ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL
      ? (res.proactiveAdjustment?.guidedQuestions ?? []).filter(
          (q) => q.trim() !== "",
        )
      : [];
  /*
   * GUIDED PROMPTS, BESIDE THE QUESTIONS (1 Oct, B19). `guidedQuestions` is a
   * list of strings with no id, so the panel could show one and never send an
   * answer - the dialogue stopped at the first question every time. A prompt
   * has an id, its words and optional options, and is answered at
   * `POST /api/intelligence/guided-questions/answer`. Read the same way and
   * under the same action. A prompt with no id or no words is dropped, and so
   * is an option with no words, because a blank target is not a question.
   */
  const guidedPrompts: GuidedPrompt[] =
    adjustment === ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL
      ? (res.proactiveAdjustment?.guidedPrompts ?? []).flatMap((p) => {
          const prompt = p.prompt?.trim();
          if (!p.id || !prompt) return [];
          const options = (p.options ?? []).filter((o) => o.trim() !== "");
          return [{ id: p.id, prompt, ...(options.length ? { options } : {}) }];
        })
      : [];

  const segments: SegmentAdaptation[] = res.segments.flatMap((row) => {
    const modalities = offered.get(row.segmentId);
    // A plan row for a segment the player does not have is dropped rather than
    // carried: the player looks its plan up by segment id, so an orphan row is
    // dead weight at best.
    if (!modalities) return [];

    // Only ever a modality this segment can actually render. The engine works
    // from `availableModalities`, which a segment can CLAIM without carrying
    // the payload - the live lesson claims `visual` with a null `visualVariant`
    // - so opening a child in the engine's choice unchecked is how you get a
    // blank frame.
    const engineChoice = asModality(row.modality);
    const scaffold = SCAFFOLD[row.scaffolding];
    const densityLevel = asDensityLevel(row.density);
    const startModality =
      engineChoice && modalities.includes(engineChoice)
        ? engineChoice
        : (modalities[0] ?? MODALITY.TEXT);

    return [
      {
        segmentId: row.segmentId,
        startModality,
        ...(scaffold ? { scaffold } : {}),
        ...(densityLevel ? { densityLevel } : {}),
      },
    ];
  });

  // Omitted rather than null when there is no instruction, so a consumer's
  // presence test reads the same as every other optional field on the plan.
  return {
    lessonId: res.lessonId,
    segments,
    /*
     * ONE SUGGESTION, NOT ONE PER SEGMENT. `modalitySuggestion` has no
     * `segmentId`: the engine makes it once, for the lesson as it stands. It
     * was copied onto every row here, and the player - which offers at most
     * one per segment and never two in a row - turned it into an offer on
     * every other segment for the rest of the lesson. The player decides where
     * the one offer can be drawn; see `LessonPlayer`.
     */
    ...(suggested ? { suggestModality: suggested } : {}),
    ...(adjustment ? { adjustment } : {}),
    ...(hint ? { hint } : {}),
    ...(guidedQuestions.length > 0 ? { guidedQuestions } : {}),
    ...(guidedPrompts.length > 0 ? { guidedPrompts } : {}),
  };
}
