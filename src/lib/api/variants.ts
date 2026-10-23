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
 * `interactiveVariant` comes in TWO FORMS (Teslim, 14 Oct): the activity
 * SCRUM-134 introduced (a title, what is needed, ordered steps, the outcome)
 * and the question every earlier lesson carries (`answerKey` with the SAME
 * nullable union as a comprehension checkpoint - null means unmarkable, never
 * wrong). `type` tells them apart. `markInteractive` below routes the
 * question form through the checkpoint marker so there is one implementation
 * of that judgement, not two that can drift.
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
 * `rows` is how many rows of pieces to lay out (1-20, default 1) - the
 * rendered row count, as on `CalculationScaffold` (B100). `fromContent`
 * builds every kind: `fraction_bar` (17b, one row), `array` (D149, `rows`
 * rows of `parts` columns), `counters` (D149's dots, laid out as the array
 * is), `number_line` (D149's hops) and `place_value` (D149, its piece
 * counts per column read from the place-value scaffold).
 *
 * B112, 13 Oct: "bar and dots are accepted and normalised" - the scaffold's
 * names for a bar and for counters. The server normalises them on input; if
 * one still arrives here it is read as the build it names.
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
  /** "Stable ids for the draggable pieces, in renderer order" (B109). */
  pieceIds?: string[];
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

/** One step of an activity, in order. */
export interface InteractiveActivityStep {
  id: string;
  instruction: string;
}

/**
 * AN ACTIVITY (SCRUM-134; backend bb59b37, 13 Oct, written by the parser since
 * 0064010, 14 Oct). Something to DO, with the outcome a child should see at
 * the end. Nothing here is marked right or wrong.
 */
export interface InteractiveActivityVariant {
  type: "activity";
  title: string;
  /**
   * "Source context shown before the actionable steps, not a task" (spec, 21
   * Oct). Optional and nullable: an activity stored before it has none.
   * Typed, and not drawn: frame d6b9fbc removed the intro paragraph.
   */
  introduction?: string | null;
  /** What is needed. Often empty. */
  materials: string[];
  steps: InteractiveActivityStep[];
  /**
   * THE TWO "WHAT YOU SHOULD SEE" LINES (SCRUM-273, backend acc5b27; spec 22
   * Oct): what to watch for while the child works, and what should be seen
   * once the steps are done. Each is copied from the uploaded source and
   * each is optional - an absent line is OMITTED, never null, "" or a generic
   * sentence, though the spec still types both as nullable. The server's old
   * default, "You have completed the activity.", is suppressed on reads and
   * removed from stored activities, and nothing here stands in for it. See
   * `InteractiveContent.outcome`.
   */
  inProgress?: string | null;
  outcome?: string | null;
  /**
   * THE SOURCE'S SAFETY SENTENCE (backend 92af149; spec 23 Oct: "Authored
   * safety instructions; show before activity steps"). Nullable. While the
   * player has no designed way to draw it, an activity carrying one is not
   * offered at all - SCRUM-280's hard rule; see `interactiveFor`.
   */
  safety?: string | null;
}

/**
 * A QUESTION - the form every lesson parsed before 13 Oct carries, kept by
 * backend alongside the activity ("Please retain the existing question
 * renderer", Teslim 14 Oct). The contract calls it
 * `LegacyInteractiveQuestionVariant`; its `type` defaults to
 * `practice_problem`.
 */
export interface InteractiveQuestionVariant {
  type: string;
  prompt: string;
  expectedInteraction: string;
  options: CheckpointOption[];
  /** NULL MEANS UNMARKABLE - see `markInteractive`. */
  answerKey: CheckpointScalar | CheckpointScalar[] | null;
  instructions: string | null;
}

export type InteractiveVariant = InteractiveActivityVariant | InteractiveQuestionVariant;

/** Which form this is. `type` is the contract's own discriminator. */
export function isActivity(v: InteractiveVariant): v is InteractiveActivityVariant {
  return v.type === "activity";
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
 * the spec's own description. Backend defined the rest (B100, 8 and 9 Oct):
 * `rows` is the rendered row count, and `marks` are "overlays/values and do
 * not create rows", so a bar may carry more marks than rows; `parts` is the
 * cells in one row, an array's columns; `labels[i]` belongs to `marks[i]`,
 * or to part i where there are no marks; and place value's marks are "the
 * piece counts for the columns named by labels". `fromContent` reads them by
 * that, and draws only what a frame draws.
 *
 * ABSENT IS AN INSTRUCTION: no `kind`, no drawing, and the front end infers
 * none.
 */
export interface CalculationScaffold {
  kind: CalculationScaffoldKind;
  /** 1-100. */
  parts: number;
  /** The physical row count. 1-20, default 1. */
  rows?: number;
  /**
   * "First value on a number line. Null for other scaffold kinds. Older
   * number-line lessons default to zero" (B111). Where a number-line build
   * starts - see `manipulativeFor`.
   */
  start?: CheckpointScalar | null;
  marks?: CheckpointScalar[];
  labels?: string[];
  /** `marks[i]`'s id, for a highlight to name it by (B109). */
  markIds?: string[];
  /** `labels[i]`'s id (B109). */
  labelIds?: string[];
  /** Undescribed in the spec, and read by nothing here (asked). */
  pieceIds?: string[];
}

/**
 * One thing a step's choreography names (B107): 17b's denominators ringed,
 * numerators to navy, and the result, as data. `target` is "an opaque
 * renderer target ... such as an equation token, scaffold mark or
 * manipulative piece id. Match it only to an id carried by the same
 * calculation; an unknown target is ignored rather than guessed." `role`
 * defaults to `active`. A step's highlights apply while it is asked.
 */
export interface CalculationHighlight {
  target: string;
  role?: "active" | "source" | "result";
}

/**
 * "One addressable part of the equation line" (B109): what a highlight's
 * `target` names on the equation. `hiddenUntilAccepted` is set on the token
 * holding the step's answer - "result tokens ... remain hidden until the step
 * is accepted" (B127).
 */
export interface CalculationEquationToken {
  id: string;
  text: string;
  hiddenUntilAccepted?: boolean;
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
   * EVERY OTHER FORM THE PIPELINE STORED AS RIGHT (SCRUM-185, in the
   * response since 18 Oct; at most 30). Lydia on SCRUM-177: one half, 0.5 and
   * 50% are all written down at upload, and the child's entry is matched
   * against the list - nothing is worked out at runtime. Lydia, 17 Oct: "0.5"
   * for "1/2" marked wrong is demo-fatal.
   *
   * Read for a NUMBER step only. A choice is answered by tapping an option, so
   * a form that is not an option cannot be given, and one that is an option
   * makes a second option right - the `targets` defect. Nothing upstream keeps
   * a choice step's list off its other options, so it is not read there.
   * Absent on content stored before it.
   */
  acceptedAnswers?: CheckpointScalar[];
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
  /**
   * "Compatibility snapshot of the equation after this step is accepted"
   * (B110): read only where an older lesson has no `assembles`.
   */
  equationState: string;
  /**
   * SCRUM-177's three, REQUIRED in the spec and optional here only so that
   * content stored before them reads as what it is: a step that names no
   * input cannot be drawn, and `fromContent` refuses it rather than guessing.
   *
   * `targets` name what a step points at, NOT further right answers: backend
   * fills a step with none with every one of its options. Read for nothing
   * here. Every acceptable form of a step (Lydia on SCRUM-177) arrives as
   * `acceptedAnswers` (SCRUM-185), above.
   * `assembles` is the equation once this step is accepted (B110).
   */
  input?: CalculationStepEntry;
  targets?: CheckpointScalar[];
  assembles?: string;
  /**
   * How many pieces a `tap` step builds: a positive whole number (B102).
   * Null on the other two inputs, and on content stored before it.
   */
  tapCount?: number | null;
  /** What this step's scaffold choreography names (B107). */
  highlights?: CalculationHighlight[];
  /**
   * "The exact non-digit keys the Nevo pad must add for this step, for
   * example x, plus or minus. Empty means the standard numeric pad is
   * sufficient" (B108). Absent on a lesson stored before it.
   */
  requiredCharacters?: string[];
  /** The equation line as addressable tokens (B109). Absent on older lessons. */
  equationTokens?: CalculationEquationToken[];
  /**
   * "The equation token that holds this step's answer. It is always marked
   * hiddenUntilAccepted and has a result highlight" (B127). Required in the
   * spec; optional here for content stored before it.
   */
  resultTargetId?: string;
}

export interface CalculationVariant {
  type: string;
  /** The concept this calculation teaches, when the pipeline named one. */
  conceptId?: string | null;
  /**
   * "The complete solved equation revealed when all co-construction steps
   * finish" (spec; B101). The answer, so it is never the problem's stand-in.
   */
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
  // The question form only: an activity carries no answer key.
  variant: Pick<InteractiveQuestionVariant, "answerKey">,
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
