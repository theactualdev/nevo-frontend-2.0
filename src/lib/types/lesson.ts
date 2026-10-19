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
  /**
   * Key terms, as violet chips beside the text under every view - Simplify,
   * Slower and a lower-depth session's simpler text too, since a rewrite
   * loses no content (Lydia, 17 Oct).
   * A term with a `definition` opens it in place when tapped (design, 9 Oct);
   * the authored demo's terms carry none and stay plain chips.
   */
  keyTerms?: { term: string; definition?: string }[];
  /**
   * Per-density callout (e.g. Simplify "IN SHORT", Expand "WORD EQUATION").
   * `default` is the standard view's and stays under every view; a density's
   * own is drawn after it, never in its place.
   */
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
   * frame's "WORD EQUATION" box, one per equation, under every view: "A
   * rewrite must not be able to lose an equation" (Lydia, 17 Oct).
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
  /** The mark's id (`markIds[i]`, B109), for a highlight to name it by. */
  id?: string;
  /** Its label's id (`labelIds[i]`): naming the label names the mark. */
  labelId?: string;
}

/**
 * The drawing beside the notation, as the payload describes it (SCRUM-177,
 * read by backend's 9 Oct definitions - see `scaffoldFor`).
 *
 * Only the kinds a frame draws are here, each named as the wire names it:
 *  - `bar` is 17b's fraction bars (D149's "fraction_bars"): `rows` bars of
 *    `parts` cells. Its quantities are one to a bar where there are as many
 *    as bars, and otherwise all on its one bar, end to end;
 *  - `array` is D149's `rows` rows of `parts` square places, its
 *    quantities filling them end to end in reading order;
 *  - `dots` is D149's `rows` rows of `parts` round places, its quantities
 *    filling them end to end in reading order, as the array does;
 *  - `place_value` is D149's three columns of flats, rods and units, a
 *    quantity to each, largest first;
 *  - `number_line` is D149's line of `parts` positions ("cells or
 *    positions in one row"), a marker at each quantity's position.
 *
 * `partLabels` name the parts of a scaffold with no marks: "label[i] belongs
 * to mark[i] when marks are present, otherwise to scaffold part i".
 * `partLabelIds[i]` is that label's id (B109), where the payload gives ids.
 */
export type CalcScaffold =
  | {
      kind: "bar";
      parts: number;
      rows: number;
      quantities: ScaffoldQuantity[];
      partLabels: string[];
      partLabelIds?: string[];
    }
  | {
      kind: "array";
      parts: number;
      rows: number;
      quantities: ScaffoldQuantity[];
      partLabels: string[];
      partLabelIds?: string[];
    }
  | {
      kind: "dots";
      parts: number;
      rows: number;
      quantities: ScaffoldQuantity[];
      partLabels: string[];
      partLabelIds?: string[];
    }
  | { kind: "place_value"; places: ScaffoldQuantity[] }
  | {
      kind: "number_line";
      parts: number;
      points: ScaffoldQuantity[];
      partLabels: string[];
      partLabelIds?: string[];
    };

/** Narration for one step: the clip, and how to re-issue its link. */
export interface CalcNarration {
  src: string;
  storagePath?: string;
}

/**
 * One thing a step does to the screen while it is asked (B107), as the wire
 * names it: `active` is 17b's violet ring, `source` its navy, `result` the
 * result. `target` is "an opaque renderer target", matched only to an
 * element the same calculation carries - see `emphasisAt`.
 */
export interface CalcHighlight {
  target: string;
  role: "active" | "source" | "result";
}

/**
 * One token of a step's equation line (B109): its id, for a highlight to
 * name, and its text. `hidden` is a token kept back until the step is
 * accepted - flagged `hiddenUntilAccepted`, or the step's `resultTargetId`
 * (B127).
 */
export interface CalcToken {
  id: string;
  text: string;
  hidden: boolean;
}

interface CalcStepBase {
  /** The wire's `stepId` - what `calculation_step_response` names. */
  stepId: string;
  prompt: string;
  /** Empty where the step has none, and then no hint is offered. */
  hint: string;
  /** The equation once this step is accepted (B110). May be empty. */
  assembles: string;
  /** Read only where `assembles` is empty (older lessons). May be empty. */
  equationState: string;
  /**
   * The step's equation line as tokens (B109): drawn while the step is
   * asked, its hidden tokens kept back, and whole once it is accepted.
   * Absent on older lessons, which draw the flat string.
   */
  tokens?: CalcToken[];
  /** What this step's answer does to the drawing. Empty means nothing. */
  highlights: CalcHighlight[];
  narration?: CalcNarration;
}

/**
 * A step the child answers by picking.
 *
 * `accepted` is the option value the pipeline stored as right - the step's
 * `answer`, never its `targets` or its `acceptedAnswers`, either of which can
 * name another option - so a pick is matched against it, never reasoned
 * about.
 */
export interface CalcChoiceStep extends CalcStepBase {
  input: "choice";
  options: { value: string; label: string }[];
  accepted: string[];
  /** Shown with the confirmed pick, where the step carries one. */
  confirm?: string;
}

/**
 * A step the child types into. `entry` is the wire's `expectedInput`: a
 * number or an expression ("3x - 4"). `keys` is the step's
 * `requiredCharacters` (B108), the keys the Nevo pad adds to its digits,
 * minus sign and point - empty for the standard pad. Absent on a lesson
 * stored before the field, where an expression has nothing saying what it
 * needs (see `NumberEntry`).
 */
export interface CalcNumberStep extends CalcStepBase {
  input: "number";
  entry: "numeric" | "text";
  keys?: string[];
  /** The step's `answer`, then every other form in its `acceptedAnswers`. */
  accepted: string[];
  /** "naira", "years", "%" - shown beside the field where the wire gives one. */
  unit?: string;
}

/**
 * A step the child builds by tapping pieces into the manipulative (17b §6).
 * `target` is the wire's `tapCount` (B102), a whole number of pieces the bar
 * or the array holds - never read out of an answer. A place-value build is
 * done when each column holds its own count instead, and nothing sums them.
 */
export interface CalcTapStep extends CalcStepBase {
  input: "tap";
  target: number;
  /**
   * What a finished build is written to the server as, where the server can
   * mark a build at all: the step's stored `answer`, in its own type, when
   * that answer IS the count built (`tapCount`). The server marks against the
   * answer, so a build of three quarters stored as "3/4" is not a count it
   * can match. Absent there, and the build is written as nothing.
   */
  counted?: string | number;
}

export type CalculationStep = CalcChoiceStep | CalcNumberStep | CalcTapStep;

export interface CalculationSegment {
  variant: CalculationVariant;
  /** The concept taught, for the hint events. Omitted when the wire has none. */
  conceptId?: string;
  /**
   * The whole calculation's answer, as the wire gives it - the solution the
   * steps assemble. Never shown and never spread across the steps: it is what
   * the solved calculation is written to the server as, against the problem
   * the server keys on the segment itself. Absent when the wire has none.
   */
  answer?: string | number | boolean;
  /** The problem's notation, shown before any step has assembled anything. */
  expression: string;
  /**
   * The complete solved equation (B101), shown once every step is done and
   * never before. Empty means the last step's `equationState` stands.
   */
  fullEquation: string;
  /** The drawing. Absent means the payload carries none this app can draw. */
  scaffold?: CalcScaffold;
  /**
   * What a `tap` step builds on: 17b's fraction bar, one row of `parts`;
   * D149's array, `rows` rows of `parts` square places; D149's counters,
   * the same rows of round places; D149's number line, `parts` positions
   * to hop along from `start`; or D149's place value, its columns and their
   * piece counts taken from the scaffold.
   * `pieceLabels[i]` names piece i, for a highlight to find; none is drawn.
   * `pieceIds[i]` is its id (B109), where the payload gives ids.
   */
  manipulative?:
    | {
        kind: "fraction_bar";
        parts: number;
        pieceLabels: string[];
        pieceIds?: string[];
      }
    | {
        kind: "array" | "counters";
        parts: number;
        rows: number;
        pieceLabels: string[];
        pieceIds?: string[];
      }
    | {
        kind: "number_line";
        parts: number;
        /** The position the marker starts on (B111). */
        start: number;
        pieceLabels: string[];
        pieceIds?: string[];
      }
    | { kind: "place_value"; columns: ScaffoldQuantity[] };
  /**
   * HIGHLIGHTS NAME IDS (B109). Set where the calculation carries any - its
   * equation tokens, its marks', labels' or pieces' ids - and then a target
   * is matched to an id and nothing else. Absent on a lesson stored before
   * the ids, whose targets are matched to the words on screen instead.
   */
  byId?: true;
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
  /**
   * Where calculation support starts for this child, as the indicator draws
   * it: `engineConfig.support.initialScaffoldLevel` from the session-start
   * read, "Client-applied starting level for calculation scaffolds" (B103,
   * 9 Oct). Shown only while the solver is on screen and nothing more
   * specific has been said for the segment. Absent is no level.
   */
  initialScaffold?: ScaffoldLevel;
}
