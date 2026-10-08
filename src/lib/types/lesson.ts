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
  /**
   * The payload's key points (`TextVariant.keyPoints`, SCRUM-224): the frame's
   * "IN SHORT" box. Design, D24: "The boxes stay. They are key points."
   */
  keyPoints?: string[];
  /**
   * The payload's equation callouts (`TextVariant.equationCallouts`): the
   * frame's "WORD EQUATION" box, one per equation, under Expand.
   */
  equations?: { equation: string; label?: string }[];
  /**
   * Where the server breaks `body.default` for reading (SCRUM-234), in order.
   * Absent is one body. They describe the default body only, so a reshape
   * never reads through them.
   */
  readingChunks?: { id: string; text: string }[];
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
    /**
     * A much smaller copy of the same picture (B47), painted while `src`
     * arrives on a slow connection. Absent means there is none.
     */
    previewSrc?: string;
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

// ── Calculation subsystem (17b co-construction, SCRUM-181 on SCRUM-177) ─────

/**
 * The wire's `CalculationVariant.type`, which is `co_construction` - the tag
 * that routes the Interactive modality to the solver (17b §8).
 */
export type CalculationVariant = "co_construction" | (string & {});

/**
 * One quantity a scaffold draws: the wire's `marks[i]`, named by its
 * `labels[i]` where there is one. A count, as the pipeline wrote it - never
 * one this app worked out.
 */
export interface ScaffoldQuantity {
  count: number;
  label?: string;
}

/**
 * The drawing beside the notation, as the payload describes it (SCRUM-177).
 *
 * Only the kinds a frame draws are here: `bar` is 17b's fraction bars, `dots`
 * and `number_line` are 37c's grouped dots and number line. `array` and
 * `place_value` have no frame yet, so a calculation carrying one draws
 * nothing beside its notation rather than an invented picture.
 */
export type CalcScaffold =
  | { kind: "bar"; parts: number; quantities: ScaffoldQuantity[] }
  | { kind: "dots"; quantities: ScaffoldQuantity[] }
  | { kind: "number_line"; parts: number; points: ScaffoldQuantity[] };

/** Narration for one step: the clip, and how to re-issue its link. */
export interface CalcNarration {
  src: string;
  storagePath?: string;
}

interface CalcStepBase {
  /** The wire's `stepId` - what `calculation_step_response` names. */
  stepId: string;
  prompt: string;
  /** Empty where the step has none, and then no hint is offered. */
  hint: string;
  /** The solution as it stands while this step is asked. May be empty. */
  assembles: string;
  /** How the equation reads once this step is done. May be empty. */
  equationState: string;
  narration?: CalcNarration;
}

/**
 * A step the child answers by picking.
 *
 * `accepted` is every option value the pipeline stored as right - the step's
 * `answer` and its `targets` - so a pick is matched against that list, never
 * reasoned about.
 */
export interface CalcChoiceStep extends CalcStepBase {
  input: "choice";
  options: { value: string; label: string }[];
  accepted: string[];
  /** Shown with the confirmed pick, where the step carries one. */
  confirm?: string;
}

/**
 * A step the child types into. `entry` is the wire's `expectedInput` read for
 * the keyboard it needs: an expression ("3x - 4") takes letters and an
 * operator; a number takes digits, a minus sign and a decimal point.
 */
export interface CalcNumberStep extends CalcStepBase {
  input: "number";
  entry: "numeric" | "text";
  accepted: string[];
  /** "naira", "years", "%" - shown beside the field where the wire gives one. */
  unit?: string;
}

/**
 * A step the child builds by tapping pieces into the manipulative (17b §6).
 * `target` is the stored answer as written - a whole number of pieces the bar
 * holds - never derived from a fraction.
 */
export interface CalcTapStep extends CalcStepBase {
  input: "tap";
  target: number;
}

export type CalculationStep = CalcChoiceStep | CalcNumberStep | CalcTapStep;

export interface CalculationSegment {
  variant: CalculationVariant;
  /** The concept taught, for the hint events. Omitted when the wire has none. */
  conceptId?: string;
  /** The problem's notation, shown before any step has assembled anything. */
  expression: string;
  /** The drawing. Absent means the payload carries none this app can draw. */
  scaffold?: CalcScaffold;
  /** What a `tap` step builds on. Only the fraction bar has a frame (17b). */
  manipulative?: { kind: "fraction_bar"; parts: number };
  steps: CalculationStep[];
  /** Shown once the solution has assembled. Empty means nothing is said. */
  completion: string;
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
