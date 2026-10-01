/**
 * Lesson content + adaptation types (FE Architecture §4; Product Arch §Lesson
 * experience). These replace the `unknown` placeholders in `LessonContext` and
 * `useAdaptation`. Shapes are built to a static mock now; when the backend
 * content/adaptation contract lands, swapping the data source shouldn't touch the
 * player UI. TODO(api): reconcile with the ratified backend schema.
 */
import type {
  AdjustmentAction,
  BreakType,
  CalcModality,
  Density,
  Modality,
  ScaffoldLevel,
} from "@/lib/constants";

// ── Per-modality content ────────────────────────────────────────────────────

/** Text modality — one heading, body variants keyed by density (frame 17). */
export interface TextContent {
  heading: string;
  /**
   * `default` is the base rendering; density keys reshape the same segment.
   * The densities are OPTIONAL: parsed backend content carries one body per
   * segment and no reshapes, so live lessons supply `default` alone. The
   * player offers only the densities a segment actually has - a toggle that
   * re-renders identical prose is a claim the content cannot honour.
   */
  body: { default: string } & Partial<Record<Density, string>>;
  /**
   * Slower breaks the same idea into small numbered step cards (frame 17);
   * the density's `body` string becomes the lead line above them.
   */
  slowerSteps?: string[];
  /** Expand surfaces key terms as violet chips under the fuller prose. */
  keyTerms?: string[];
  /** Per-density callout (e.g. Simplify "IN SHORT", Expand "WORD EQUATION"). */
  callouts?: Partial<
    Record<Density | "default", { label: string; text: string; sub?: string }>
  >;
}

/** Visual modality — an illustration and/or a simple input→output diagram. */
export interface VisualContent {
  heading: string;
  /** One-line orientation under the heading ("Follow the arrows."). */
  intro?: string;
  /**
   * Named inline artwork (finished SVG shipped with the app) — the frame's
   * answer to missing produced assets: real art, never a wireframe box.
   */
  art?: { id: string; alt: string; caption?: string };
  illustration?: {
    src: string;
    alt: string;
    caption?: string;
    /** Identifies the stored object, so an expired `src` can be re-issued. */
    storagePath?: string;
    /** The asset's own pixel size, when the wire carries it. */
    width?: number;
    height?: number;
  };
  /** e.g. Photosynthesis "TAKES IN → GIVES OUT". */
  diagram?: {
    inLabel: string;
    outLabel: string;
    inputs: string[];
    outputs: string[];
  };
}

/** Audio modality — a produced narration asset + transcript for the disclosure. */
export interface AudioContent {
  heading?: string;
  /** One-line orientation under the heading. */
  intro?: string;
  /** Player-card title, e.g. "Narrated: What is photosynthesis?". */
  title?: string;
  /** Backend-produced asset ref; absent in the mock (UI animates a placeholder). */
  src?: string;
  /** Identifies the stored clip, so an expired `src` can be re-issued. */
  storagePath?: string;
  durationSec?: number;
  transcript: string;
}

/** Interactive modality — tickable steps that reveal an outcome once all done. */
export interface InteractiveContent {
  heading: string;
  /** One-line orientation under the heading ("…there's no rush."). */
  intro?: string;
  /** "YOU'LL NEED" items. */
  needs?: string[];
  steps: string[];
  outcome: { pending: string; done: string };
}

// ── Comprehension check (inline Quick Check) ────────────────────────────────

/** One answer a check offers. */
export interface AnswerChoice {
  id: string;
  label: string;
  /**
   * The checkpoint option's own value, which is what `POST /attempts` sends:
   * the server marks it against the key, and `id` is a string of it. Absent on
   * the authored demo checks, which have no checkpoint behind them.
   */
  value?: string | number | boolean;
}

export interface QuickCheck {
  /**
   * The checkpoint it was built from, so an answer can say which one it
   * answered. Absent on the authored demo checks, which have none.
   */
  id?: string;
  question: string;
  options: AnswerChoice[];
  correctId: string;
  /** Navy note on a correct answer. */
  correctNote: string;
  /** Soft-violet (never red) note on a miss — always reassures continuity. */
  recoveryNote: string;
  /**
   * The recording a SPOKEN check plays (B16). Present only when the server
   * set the checkpoint's format to spoken and sent one; the printed question
   * stays on screen either way.
   */
  promptAudio?: string;
  /**
   * The concept the check is about, from its checkpoint. A review session
   * skips the after-lesson questions - its inline checks ARE the recall - so
   * this is the only place a review learns which answers were about the
   * concept it was opened for. Never rendered.
   */
  conceptId?: string;
}

// ── Calculation subsystem (17b §9 — co-construction) ────────────────────────

/** Which calculation the solver co-constructs; non-null triggers the seam (§8). */
export type CalculationVariant = "fraction_add_like" | (string & {});

export interface CalcCardStep {
  prompt: string;
  choices: string[];
  /** Index into `choices`. */
  correct: number;
  hint: string;
  onCorrect?: { highlight?: string; confirm?: string };
}

export interface CalcNumericStep {
  prompt: string;
  input: "numeric";
  answer: string;
  hint: string;
  /** "naira", "years", "%" - shown beside the field where the wire gives one. */
  unit?: string | null;
}

/**
 * A step whose answer is an expression rather than a number.
 *
 * ADDED FOR REAL CONTENT. The player knew two kinds of step, cards and a
 * numeric finish, because the only calculation that existed was
 * `fraction_add_like`. The backend's algebra lesson answers "3x - 4" and "3x"
 * before it answers 5, so two of its three steps had no kind to be - and a
 * mapper that dropped them would have left a child solving the last third of
 * an equation.
 *
 * Separate from `CalcNumericStep` because the keypad differs: an expression
 * needs letters and an operator, a number does not.
 */
export interface CalcTextStep {
  prompt: string;
  input: "text";
  answer: string;
  hint: string;
  unit?: string | null;
}

export type CalculationStep = CalcCardStep | CalcNumericStep | CalcTextStep;

export function isNumericStep(step: CalculationStep): step is CalcNumericStep {
  return "input" in step && step.input === "numeric";
}

export function isTextStep(step: CalculationStep): step is CalcTextStep {
  return "input" in step && step.input === "text";
}

/** Card steps are the ones the student picks from rather than types into. */
export function isCardStep(step: CalculationStep): step is CalcCardStep {
  return !("input" in step);
}

export interface CalculationSegment {
  variant: CalculationVariant;
  /**
   * `answer` is the whole calculation's answer, and it is OPTIONAL because the
   * wire's is. The solver shows it only where it has one; it never derives it
   * from the last step, which is a different claim.
   */
  problem: { expression: string; answer?: string };
  /**
   * The drawn scaffold - fraction bars today.
   *
   * OPTIONAL, and this is the change real content forced. `fraction_add_like`
   * is an authored variant with `{parts, rows}`, and only the authored lessons
   * set this. The deployed contract carries a `scaffold` of its own now
   * (`CalculationScaffold`, checked 1 Oct), but in a different shape - its
   * `rows` is a single integer, this one's lists numerators - and nothing maps
   * it here while the solver is frozen (SCRUM-181/177). A calculation without
   * this field has no bars to draw, and drawing some anyway would be inventing
   * a picture of a child's problem.
   */
  scaffold?: { kind: string; parts: number; rows: number[] };
  /**
   * The generated manipulative a `drag` step is built on (21 Sep).
   *
   * SEPARATE FROM `scaffold` ABOVE, deliberately. That one is the authored
   * demo's, and its `rows` is `number[]` - the numerators of the fractions
   * being added. The wire's `rows` is a count of piece rows. Folding them into
   * one field would draw a bar with as many divisions as there are addends.
   *
   * `target` is how many pieces the child places, resolved from the drag
   * step's own answer rather than computed here - rule 3 keeps the frontend
   * out of deciding what a correct quantity is.
   */
  manipulative?: { kind: string; parts: number; target: number };
  /**
   * How the equation should read as the child works, one entry per step, plus
   * the opening state at index 0 where the backend gives one. Authored
   * fraction content has none and renders its own bars instead.
   */
  equationStates?: string[];
  steps: CalculationStep[];
  completion: string;
  /** Per-step narration asset refs — producer-generated content. */
  narration?: string[];
  /** Available layers (interactive always; audio/kinesthetic optional). */
  modalities: CalcModality[];
}

// ── Segment + lesson ────────────────────────────────────────────────────────

export interface LessonSegment {
  id: string;
  /** Modalities this segment supports (minimum two). */
  modalities: Modality[];
  text?: TextContent;
  visual?: VisualContent;
  audio?: AudioContent;
  interactive?: InteractiveContent;
  /**
   * Non-null routes the Interactive modality to the co-construction solver
   * instead of the standard interactive content (17b §8 — the ONLY place a
   * toggle option renders a different component).
   */
  calculationVariant?: CalculationVariant | null;
  /** Calculation content, present when `calculationVariant` is set. */
  calculation?: CalculationSegment;
  /** Optional inline comprehension check shown after this segment. */
  quickCheck?: QuickCheck;
}

export interface AssessmentQuestion {
  /**
   * The checkpoint this question was built from.
   *
   * **IT WAS ALWAYS THERE AND WE DROPPED IT.** `ComprehensionCheckpoint.id` is
   * required on the wire and has been all along; `assessmentFor` zipped each
   * question with its checkpoint, read the concept off it, and discarded the
   * rest - so from inside this client the question looked like it had no
   * identity, and I asked backend for a `problemId` that already existed.
   * That is the "grep for the capability, not the name we proposed" failure
   * this repo's own inventory warns about.
   *
   * It is what `ScaffoldAttemptRequest.problemId` wants: stable across
   * re-renders and re-opens, unlike a position in an array, and not the answer,
   * unlike `correctId`.
   *
   * Optional because a lesson built by the two authored mocks has no
   * checkpoint behind it. No id means no attempt is posted, which is correct:
   * an invented one would key the engine's per-problem history to a fixture.
   */
  id?: string;
  prompt: string;
  options: AnswerChoice[];
  correctId: string;
  /** Soft-violet recovery note (never a score). */
  recoveryNote?: string;
  /** A spoken question's recording - see `QuickCheck.promptAudio`. */
  promptAudio?: string;
  /**
   * The concept this question is about, straight from the checkpoint.
   *
   * Carried so a REVIEW session can tell the scheduler how recall went for the
   * concept it was opened for, rather than crediting it with an answer about
   * something else. Never rendered as a label on the child's own screen - a
   * concept name beside a right-or-wrong mark is a finding about the child.
   */
  conceptId?: string;
}

/** Low-stakes after-lesson assessment — growth framing, no score. */
export interface Assessment {
  questions: AssessmentQuestion[];
  /** Concepts to surface in the result as "getting the hang of" vs "revisit". */
  masteredConcepts?: string[];
  revisitConcepts?: string[];
  /** Warm result paragraph under "You're getting the hang of this". */
  resultNote?: string;
}

/**
 * Post-lesson recap (frame 18 · Lesson Summary). A warm narrative of what the
 * student did, plus a compact "what you covered" line. Named distinctly from the
 * catalogue's `LessonSummary` (the browse-list card), which is a different shape.
 */
export interface CompletionSummary {
  /** Warm recap paragraph — what they worked through, in plain language. */
  recap: string;
  /**
   * "What you covered" — a middot-joined list of the concepts touched.
   *
   * OPTIONAL, because the backend supplies no such field. It is derived from
   * the `conceptName`s the lesson's checkpoints actually carry, and a lesson
   * that names none has no honest line to print - so the summary screen drops
   * the card rather than drawing one with an empty body.
   */
  covered?: string;
}

// ── Module structure (SCRUM-101) ────────────────────────────────────────────

/**
 * An intermediate level between lesson and segment. Lessons of 6+ segments get
 * modules by default (teacher can override in either direction at upload);
 * short lessons stay segment-only. Students never see the distinction named -
 * they see a well-structured lesson.
 */
export interface LessonModule {
  id: string;
  /** Teacher-named ("Introduction", "Practice"); position label when absent. */
  title?: string;
  /** The lesson's segment ids belonging to this module, in lesson order. */
  segmentIds: string[];
  /**
   * Gemini-generated at upload, teacher-edited. Shown on the boundary screen
   * ("What you just did" / "What's coming next") only under the attention
   * accommodation; absent text renders no block.
   */
  recap?: string;
  preview?: string;
}

export interface Lesson {
  id: string;
  title: string;
  subject?: string;
  segments: LessonSegment[];
  /**
   * Module structure (SCRUM-101). Absent/empty means segment-only - nothing in
   * the player assumes modules exist.
   */
  modules?: LessonModule[];
  assessment?: Assessment;
  /** Recap shown on the post-lesson summary screen (frame 18). */
  summary?: CompletionSummary;
}

// ── Adaptation plan (personalization overlay — §4) ──────────────────────────

/** The engine's `DensityLevel`, exactly. */
export type DensityLevel = "low" | "medium" | "high";

/**
 * One guided prompt the socratic panel shows (`GuidedPrompt`, 1 Oct). Unlike
 * a guided question it has an id, so the child's reply can be sent - the
 * option they picked, or how much they wrote, never the words.
 */
export interface GuidedPrompt {
  id: string;
  prompt: string;
  /** Absent when the prompt is answered in the child's own words. */
  options?: string[];
}

export interface SegmentAdaptation {
  segmentId: string;
  /** Modality the player opens this segment in. */
  startModality: Modality;
  /** Active reading density, if any. */
  density?: Density | null;
  /** One system-suggested modality to surface via the calm pill (never chained). */
  suggestModality?: Modality | null;
  /**
   * Break module (frame 18) inserted after the student leaves this segment
   * forward. Break decisions are confirmed server-side (FE Architecture §5);
   * the plan is the delivery seam the mock exercises today.
   */
  breakAfter?: BreakType | null;
  /**
   * Scaffold indicator level for this segment (37a) - the support the system
   * is quietly giving, generated from behaviour server-side. Absent means the
   * engine said nothing, and the indicator shows nothing (rule 5) - it no
   * longer defaults to "light".
   */
  scaffold?: ScaffoldLevel;
  /**
   * The engine's `DensityLevel` for this segment. NOT `density` above, which
   * is which authored reshape of the text the child reads. Rendered only as
   * spacing - how many elements sit in view at once - and never as a label or
   * a chip (design, D25). Absent renders the segment as it always has.
   */
  densityLevel?: DensityLevel;
  /**
   * The engine's instruction for this segment, in §4's own vocabulary.
   *
   * THIS USED TO BE A STATE (`affect: anxiety | boredom | frustration |
   * confusion`), which is the one thing §4 says the frontend never knows. The
   * authored demo was the only thing that ever set it, so nothing was wrong on
   * screen - but a demo speaking a vocabulary the product does not is how that
   * vocabulary survives a rename, so it speaks instructions now too.
   *
   * The engine's own instruction is LESSON-level (`AdaptationPlan.adjustment`,
   * from `proactiveAdjustment.action`) and wins over this. Nothing on the live
   * adapt route fills a per-segment one; this is the authored seam.
   */
  adjustment?: AdjustmentAction | null;
  /** `offer_hint`: the unrequested, content-specific hint. */
  hint?: string;
  /** `show_socratic_panel`: its 2-3 guided questions. */
  socraticPrompts?: string[];
  /**
   * Frustration persisting past two adaptations: the system OFFERS this break
   * type (accept/decline) rather than delivering one - distinct from
   * `breakAfter`, which inserts a break on the way out of the segment.
   */
  offerBreak?: BreakType | null;
}

/** The adapted lesson structure returned per student (§4). */
export interface AdaptationPlan {
  lessonId: string;
  segments: SegmentAdaptation[];
  /**
   * The engine's proactive instruction for this lesson, or null.
   *
   * LESSON-LEVEL AND AN ACTION, which is what the wire and §4 both say.
   * `SegmentAdaptation.affect` below is a per-segment STATE, and §4 is explicit
   * that the frontend never knows the state - only the instruction. The state
   * field predates that and still drives the authored demo; this is the seam a
   * signed-in child's interface actually moves on, because it is the one the
   * engine fills.
   */
  adjustment?: AdjustmentAction | null;
  /**
   * The engine's one modality suggestion for this answer, lesson-level like
   * the wire's `modalitySuggestion`. The per-segment `suggestModality` is the
   * authored seam; this is offered once, where it can render.
   */
  suggestModality?: Modality | null;
  /**
   * The hint `offer_hint` shows, when the engine sent one.
   *
   * Carried ONLY when the action is `offer_hint` - see `toAdaptationPlan`. The
   * action is the instruction and the text serves it; a hint arriving under a
   * different instruction is not a hint anybody asked to show.
   */
  hint?: string | null;
  /** Likewise, the questions `show_socratic_panel` opens. */
  guidedQuestions?: string[];
  /**
   * The same panel's answerable prompts, beside `guidedQuestions` on the wire.
   * Where both arrive the prompts are shown, because only they can be replied
   * to - see `SocraticPanel`.
   */
  guidedPrompts?: GuidedPrompt[];
  /**
   * Active UDL accommodations (37c / SCRUM-71, backend-owned). Cross-session
   * delivery themes, never a label.
   *
   * Sourced for a signed-in child by `useAccommodations` from
   * `GET /api/intelligence/accommodations/{student_id}` - the same route the
   * teacher's own screen reads - and merged onto the live plan in
   * `useStudentLesson`. The adapt route carries no accommodation field.
   *
   * WHAT EACH ONE ACTUALLY DOES TODAY, which is not what this said before:
   * - `reading` renders the body larger, airier and on a softer card. It
   *   reaches the TEXT modality only; a segment opened on visual, audio,
   *   calculation or interactive is untouched by it.
   * - `attention` chunks a multi-sentence body into tap-to-continue parts with
   *   a calm pause between, dims secondary chrome to 30%, and enriches the
   *   module boundary with recap/preview blocks.
   * - `numerical` CHANGES NOTHING. This previously claimed it "is carried by
   *   the calc solver's picture-first rendering"; `CalculationSolver` takes no
   *   such prop and renders identically either way. It is read by nothing in
   *   the student app, while the teacher's screen lists it as active support.
   *   Raised with design - either it gates something or it should stop being
   *   presented to staff as a provision.
   */
  accommodations?: {
    attention?: boolean;
    reading?: boolean;
    numerical?: boolean;
  };
}
