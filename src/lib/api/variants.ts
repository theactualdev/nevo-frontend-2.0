import {
  markCheckpoint,
  type CheckpointOption,
  type CheckpointScalar,
  type MarkResult,
} from "./checkpoints";

/**
 * The five typed modality payloads a lesson segment can carry.
 *
 * These were `Record<string, unknown>` because the spec described them as
 * arbitrary dictionaries. They are typed as of 3 Sep, so a renderer can reach
 * for a field instead of guessing at one.
 *
 * Two things here are load-bearing and easy to miss:
 *
 * `interactiveVariant.answerKey` carries the SAME nullable union as a
 * comprehension checkpoint, and the same rule applies - null means unmarkable,
 * never wrong. `markInteractive` below routes through the checkpoint marker so
 * there is one implementation of that judgement, not two that can drift.
 *
 * Audio and visual URLs can EXPIRE. Both carry `urlExpiresInSeconds`, and
 * audio adds `requiresAuthentication`; a private Supabase URL that has aged
 * out needs refreshing through `POST /api/content/media/url` rather than being
 * rendered as a broken player or a missing image.
 */

/**
 * What a learner drags, when a calculation step asks them to. Landed 21 Sep.
 *
 * This is the `kind, parts, rows` §4 has always described and the wire never
 * had: *"Backend supplies structure: kind, parts, rows. You render the
 * manipulative. Do not substitute a static scaffold image, because the
 * interaction is the mechanism."* Without it, `drag` steps were refused on
 * generated content, so §4's *"the one place modalities layer rather than
 * switch"* could not happen outside the authored demo.
 *
 * `rows` IS NOT THE PLAYER'S `rows`, and the collision is worth naming: here it
 * is how many rows of pieces to lay out (1-20, default 1); on the player's
 * authored `CalculationSegment.scaffold` it is `number[]`, the numerators of
 * the fractions being added. Mapping one onto the other would draw a bar with
 * as many divisions as there are addends.
 */
export type ManipulativeKind =
  | "fraction_bar"
  | "number_line"
  | "array"
  | "place_value"
  | "counters";

export interface Manipulative {
  kind: ManipulativeKind;
  /** Divisions in the whole. Required; 1-100. */
  parts: number;
  /** Rows of pieces to lay out. 1-20, default 1. */
  rows?: number;
  labels?: string[];
}

export interface TextVariant {
  body: string;
  keyPoints: string[];
}

export interface VisualVariant {
  type: string;
  imageUrl: string;
  storagePath: string;
  prompt: string;
  provider: string;
  /** Who signed the image off, when anyone did. */
  reviewedBy: string | null;
  reviewAttempts: number;
  generatedAt: string;
  caption: string;
  qualityValidated: boolean;
  /** Null means it does not expire. See `mediaUrlExpired`. */
  urlExpiresInSeconds: number | null;
}

export interface AudioVariant {
  script: string;
  audioUrl: string;
  storagePath: string | null;
  /**
   * NULLABLE since 14 Sep. Null means nothing measured the file - there is no
   * audio library behind the generator and backend would not estimate a length
   * from bitrate, since it is a number a child's progress might touch. So null
   * and 0 mean the same thing here: un-computed metadata, never a clip of no
   * length. Only the audio element knows the truth, and it is asked.
   */
  durationMs: number | null;
  provider: string;
  voice: string | null;
  format: string;
  requiresAuthentication: boolean;
  urlExpiresInSeconds: number | null;
  /** Ties narration to one calculation step, when it belongs to one. */
  stepId: string | null;
}

export interface InteractiveVariant {
  type: string;
  prompt: string;
  expectedInteraction: string;
  options: CheckpointOption[];
  /** NULL MEANS UNMARKABLE - see `markInteractive`. */
  answerKey: CheckpointScalar | CheckpointScalar[] | null;
  instructions: string | null;
}

export interface ScaffoldImage {
  imageUrl: string | null;
  storagePath: string | null;
  prompt: string | null;
  caption: string | null;
}

export type CalculationStepInput = "selection" | "numeric" | "text" | "drag";

export interface CalculationStep {
  stepId: string;
  stepNumber: number;
  prompt: string;
  expectedInput: CalculationStepInput;
  hint: string;
  confirmationText: string;
  /**
   * WHAT THIS STEP'S ANSWER IS - landed 16 Sep, and it is per STEP.
   *
   * The variant carries an answer too, and mapping that one onto every step is
   * provably wrong: for `5x - 4 = 2x + 11` the variant answers "5" while the
   * steps answer "3x - 4", "3x" and 5. Only the last happens to match.
   *
   * A NUMBER STAYS A NUMBER and a string stays a string, which is the reason
   * for the union rather than `string`. Coercing would either have a caller
   * parse `5` back out of `"5"`, or turn `"3/4"` into something that is no
   * longer a fraction.
   *
   * Optional in the deployed schema, so a step can arrive with no answer -
   * lessons parsed before the 0057 migration carry none. A step nobody can
   * mark is not a step, and `fromContent` refuses the whole variant rather
   * than drawing a locked door.
   */
  answer?: string | number | boolean | null;
  /**
   * The choices for a `selection` or `drag` step, empty for the other two.
   *
   * Same `{value,label}` type the comprehension checkpoints use, so
   * `toQuickCheck`'s handling is the precedent. Backend now rejects a
   * selection or drag step carrying fewer than two, rather than shipping an
   * unanswerable prompt.
   */
  options?: CheckpointOption[];
  /** "naira", "years", "%" - present where it makes the step answerable. */
  unit?: string | null;
  /** Per-step narration. The asset side of this does not exist yet. */
  narrationAudio?: AudioVariant | null;
  /** How the equation should read once this step is done. */
  visualUpdate: string;
  equationState: string;
}

export interface CalculationVariant {
  type: string;
  fullEquation: string;
  /**
   * The WHOLE calculation's answer, not any step's.
   *
   * Undeclared here until 16 Sep, so it was erased before a caller could read
   * it. Worth naming precisely because the obvious use is the wrong one: for
   * `5x - 4 = 2x + 11` this is "5" while the steps answer "3x - 4", "3x" and
   * 5, so spreading it across the steps is right once and wrong twice.
   */
  answer?: string | number | boolean | null;
  steps: CalculationStep[];
  scaffoldImage: ScaffoldImage | null;
  /** The structure a `drag` step is built on. Null on older content. */
  manipulative?: Manipulative | null;
  completionStatement: string;
}

/** Every variant a segment may carry. All independently nullable. */
export interface SegmentVariants {
  textVariant: TextVariant | null;
  visualVariant: VisualVariant | null;
  audioVariant: AudioVariant | null;
  interactiveVariant: InteractiveVariant | null;
  calculationVariant: CalculationVariant | null;
}

/**
 * Mark a response to an interactive segment.
 *
 * Delegates to the checkpoint marker deliberately: an interactive answer key
 * has the same shape and the same legacy-null problem, and two copies of
 * "is this right?" would eventually disagree. Returns `"unmarkable"` rather
 * than `"incorrect"` when there is no key.
 *
 * `expectedInteraction` describes the GESTURE, not the answer's arity, so the
 * key's own shape decides how it is compared - an array key is a set match
 * whatever the interaction was called.
 */
export function markInteractive(
  variant: Pick<InteractiveVariant, "answerKey">,
  response: CheckpointScalar | CheckpointScalar[] | null | undefined,
): MarkResult {
  return markCheckpoint(
    {
      answerKey: variant.answerKey,
      answerType: Array.isArray(variant.answerKey)
        ? "multiple_choice"
        : "single_choice",
    },
    response,
  );
}

/**
 * Has a generated media URL aged out?
 *
 * `urlExpiresInSeconds` is a LIFETIME, not a deadline - it says how long the
 * URL was minted to last, so it has to be measured from when the payload was
 * fetched. Pass that moment; the caller owns it because only the caller knows
 * when the lesson was loaded.
 *
 * Null lifetime means it does not expire. A margin is applied so a URL that is
 * about to die is refreshed before a child taps play rather than after.
 */
export function mediaUrlExpired(
  urlExpiresInSeconds: number | null,
  fetchedAtMs: number,
  nowMs: number = Date.now(),
  marginSeconds = 30,
): boolean {
  if (urlExpiresInSeconds === null) return false;
  const ageSeconds = (nowMs - fetchedAtMs) / 1000;
  return ageSeconds >= urlExpiresInSeconds - marginSeconds;
}
