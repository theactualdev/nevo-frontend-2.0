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
  /** SCRUM-224, 8 Oct. Up to 12. */
  keyTerms?: KeyTerm[];
  /** SCRUM-224, 8 Oct. Up to 8. */
  equationCallouts?: EquationCallout[];
}

/** "A term the child can inspect without leaving the segment." */
export interface KeyTerm {
  term: string;
  definition: string;
}

/** "An equation kept separate from prose so it can be rendered accessibly." */
export interface EquationCallout {
  equation: string;
  label?: string | null;
}

export interface VisualVariant {
  type: string;
  imageUrl: string;
  /** A much smaller copy of `imageUrl` (B47). Null on older pictures. */
  previewUrl?: string | null;
  /** The image's own size, in pixels - its aspect ratio, for the frame. */
  width?: number;
  height?: number;
  byteSize?: number;
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

/**
 * What the child does at a step (SCRUM-177): tap, pick a choice, or enter a
 * number. Beside `expectedInput`, which predates it and still says whether a
 * typed answer is a number or an expression.
 */
export type CalculationStepEntry = "tap" | "choice" | "number";

/** The drawings a scaffold can name (SCRUM-177). */
export type CalculationScaffoldKind =
  | "bar"
  | "number_line"
  | "dots"
  | "array"
  | "place_value";

/**
 * "A calculation drawing described as data, never as a generated image" -
 * the spec's own description, and the whole of it. `rows`, `marks` and
 * `labels` carry no description on the wire; SCRUM-177's worked example is
 * `3/5 + 1/5` as `{kind: "bar", parts: 5, rows: 1, marks: [3, 1], labels:
 * ["3/5", "1/5"]}`, which is what `fromContent` reads them by.
 *
 * ABSENT IS AN INSTRUCTION: no `kind`, no drawing, and the front end infers
 * none.
 */
export interface CalculationScaffold {
  kind: CalculationScaffoldKind;
  /** 1-100. */
  parts: number;
  /** 1-20, default 1. */
  rows?: number;
  marks?: CheckpointScalar[];
  labels?: string[];
}

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
  /**
   * SCRUM-177's three, REQUIRED in the spec and optional here only so that
   * content stored before them reads as what it is: a step that names no
   * input cannot be drawn, and `fromContent` refuses it rather than guessing.
   *
   * `targets` are further acceptable answers the pipeline wrote down (Lydia
   * on SCRUM-177: every acceptable form of a step is stored, and the child's
   * entry is matched against that list - nothing is judged at runtime).
   * `assembles` is the solution as it stands while this step is asked.
   */
  input?: CalculationStepEntry;
  targets?: CheckpointScalar[];
  assembles?: string;
}

export interface CalculationVariant {
  type: string;
  /** The concept this calculation teaches, when the pipeline named one. */
  conceptId?: string | null;
  fullEquation: string;
  /** The problem's notation, "3/5 + 1/5". Required in the spec (SCRUM-177). */
  expression?: string;
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
  /**
   * Gone from the spec with SCRUM-177, which stopped generating an image for
   * a calculation so a picture can never disagree with the drawn scaffold.
   * Optional so content stored before it still types.
   */
  scaffoldImage?: ScaffoldImage | null;
  /** The drawing, as data. Null or absent means there is none. */
  scaffold?: CalculationScaffold | null;
  /** The structure a `drag` step is built on. Null on older content. */
  manipulative?: Manipulative | null;
  completionStatement: string;
}

/** Every variant a segment may carry. All independently nullable. */
/** One rewrite of a segment. `body` defaults to `""` on the wire. */
export interface DepthVariantBody {
  body: string;
}

/**
 * The simpler and the longer version of a segment, written at parse time.
 *
 * **KEYED BY THE ENGINE'S OWN ACTION NAMES, and deliberately so.** Backend's
 * schema description says it outright: *"a client that has a plan saying
 * `action: "simplify"` reads `depthVariants.simplified` without a lookup
 * table."* So `simplify` on `ProactiveAction` and `simplified` here are two
 * halves of one instruction, and the player's `Density` is where they meet.
 *
 * **EITHER MAY BE ABSENT** - the segment was too short to be worth rewriting,
 * or the rewrite failed a check against the source. Absent means fall back to
 * the segment's own body, which is what the player already does for a density
 * it cannot deliver.
 *
 * NOT `textVariant`. That is a different field, still unanswered: what
 * `textVariant.body` is relative to `segment.body`, and whether a teacher
 * approves text no child reads. This one is unambiguous and has backend's
 * description behind it.
 */
export interface DepthVariants {
  simplified: DepthVariantBody | null;
  expanded: DepthVariantBody | null;
  /** Which model wrote them. Never rendered; a child is not told this. */
  model: string | null;
}

export interface SegmentVariants {
  textVariant: TextVariant | null;
  visualVariant: VisualVariant | null;
  audioVariant: AudioVariant | null;
  interactiveVariant: InteractiveVariant | null;
  calculationVariant: CalculationVariant | null;
  /** Landed 22 Sep and read by nothing until 23 Sep. See `DepthVariants`. */
  depthVariants: DepthVariants | null;
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
