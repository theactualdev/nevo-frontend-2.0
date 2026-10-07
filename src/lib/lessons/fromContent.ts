import type {
  LessonDetailResponse,
  LessonModule as ContentModule,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";
import { toQuickCheck } from "@/lib/api/checkpoints";
/*
 * ALIASED ON IMPORT, and this is not tidiness.
 *
 * `CalculationVariant` and `CalculationStep` exist in BOTH `api/variants.ts`
 * and `types/lesson.ts` with different meanings. On the wire a variant is the
 * whole payload object; in the player it is a string naming which calculation
 * this is. Importing both unaliased compiles, and then every property access
 * is checked against the wrong one - which is how `variant.answer` came back
 * as "does not exist" on a type that plainly has it.
 */
import type {
  CalculationScaffold as WireCalculationScaffold,
  CalculationVariant as WireCalculationVariant,
  CalculationStep as WireCalculationStep,
  Manipulative,
} from "@/lib/api/variants";
import type { CheckpointScalar } from "@/lib/api/checkpoints";
import { isStoredAnswer } from "./storedAnswer";
import { MODALITY, type Modality } from "@/lib/constants";
import type {
  Assessment,
  CalcNarration,
  CalcScaffold,
  CalculationSegment,
  CalculationStep,
  CompletionSummary,
  Lesson,
  LessonModule,
  LessonSegment,
  AudioContent,
  QuickCheck,
  TextContent,
  VisualContent,
} from "@/lib/types";

/**
 * Parsed backend content -> the shape the Lesson Player renders.
 *
 * THE FIVE VARIANTS ARE TYPED NOW (3 Sep), and both detail routes return them.
 * They were typed only on the PARSE response, though, whose sole consumer is
 * the teacher's upload wizard - so `LessonSegment` on the player's own read
 * declared none of them and the bytes were erased before this adapter ran.
 * That seam is closed; what each channel does with them is opened one at a
 * time, because the rule below has not changed:
 *
 *   A modality offered and then found blank is worse than one never offered.
 *
 * ON: text, and the inline comprehension check. `comprehensionCheckpoints` was
 * being dropped here, which is why `toQuickCheck` - written for exactly this,
 * and careful enough to refuse a checkpoint it cannot mark - had no caller and
 * the player's `QuickCheckSheet` never drew for a live lesson.
 *
 * ON as of 10 Sep: VISUAL. The backend's 4,096-token output ceiling meant every
 * lesson in the library was deterministic fallback text with no variants at
 * all, so there was nothing for this to carry. Raised to 16,384, a regenerated
 * lesson comes back with real ones - measured on `Fractions Lesson 3`: four
 * segments, two checkpoints, `fallbackSegmentCount: 0`, and an image of
 * 1,409,572 bytes that fetches 200 `image/png`.
 *
 * ON as of 10 Sep: AUDIO, once `AudioSegment` was made to actually play the
 * clip. It had simulated playback on a timer against a hardcoded 40 seconds,
 * so switching this on any earlier would have handed a child a play button that
 * ran a fake progress line over silence. The asset is real - 80,893 bytes of
 * `audio/mpeg`, fetched 200 - and every segment of a regenerated lesson has
 * one, which for a child who finds reading effortful is the channel that
 * matters most.
 *
 * STILL OFF, OR ONLY PART-WAY ON, and why:
 *   - INTERACTIVE does not map at all. The wire's `InteractiveVariant` is a
 *     QUESTION (`prompt`, `options`, `answerKey`); the player's
 *     `InteractiveContent` is tickable STEPS with an outcome. Two different
 *     things sharing a name - a design question, not a wiring one.
 *   - CALCULATION is on where `calculationFor` can build every step from the
 *     payload SCRUM-177 delivered: each step's `input`, its stored answers,
 *     `assembles` and `equationState`, and the `scaffold` drawing where a
 *     frame draws its kind. See `calculationFromVariant`.
 *
 * ON EXPIRING URLS, which used to be the stated reason visual was off: the
 * variants carry `urlExpiresInSeconds`, and `contentApi.mediaUrl` mints a fresh
 * URL from `storagePath`. On real generated content that field is NULL - which
 * `mediaUrlExpired` reads as "does not expire" - so there is nothing to mint
 * today, and a signature already in the URL is what makes it fetchable without
 * a bearer. If the backend ever starts issuing expiring URLs, `visualFor` must
 * gain that minting before it can keep this promise; the check belongs in the
 * component, which is the only place that knows how long a lesson has been open.
 */

/** The channels this adapter can actually populate from parsed content. */
const RENDERABLE: readonly Modality[] = [
  MODALITY.TEXT,
  MODALITY.VISUAL,
  MODALITY.AUDIO,
];

/**
 * What the player will be offered for a segment: the backend's own list,
 * narrowed to what we can draw. Never empty - a segment with no recognised
 * modality still reads as text, which is what `body` is.
 */
function modalitiesFor(
  segment: ContentSegment,
  calculation: CalculationSegment | undefined,
): Modality[] {
  /*
   * A CALCULATION IS AN INTERACTIVE CHANNEL, and offering it is what makes the
   * solver reachable at all. The player routes the Interactive modality to the
   * solver when the segment carries a calculation, so a segment that never
   * offers Interactive can never open one however good its payload is.
   *
   * Gated on the BUILT calculation rather than on `availableModalities`,
   * because the same rule applies here as to visual and audio: a segment can
   * claim a modality it has no payload for, and claiming is not having. If
   * `calculationFor` refused the variant, there is nothing to open and the
   * channel is not offered.
   */
  if (calculation) {
    return [MODALITY.TEXT, MODALITY.INTERACTIVE];
  }
  const offered = segment.availableModalities.filter(
    (m): m is Modality =>
      (RENDERABLE as readonly string[]).includes(m) &&
      // A segment can CLAIM a modality it has no payload for - the library did
      // exactly that for months, listing `visual` with a null `visualVariant`.
      // Claiming is not having.
      (m !== MODALITY.VISUAL || visualFor(segment, "") !== undefined) &&
      (m !== MODALITY.AUDIO || audioFor(segment, "") !== undefined),
  );
  return offered.length > 0 ? offered : [MODALITY.TEXT];
}

/**
 * One segment's text. `heading` falls back to the lesson title because the
 * parser leaves `title` null on continuation segments, and the player's text
 * frame always draws a heading.
 */
function textFor(segment: ContentSegment, lessonTitle: string): TextContent {
  const base = segment.body;
  /*
   * THE DENSITY RESHAPES EXIST NOW, and this said for months that they did not.
   *
   * `depthVariants` landed on 22 Sep carrying `simplified` and `expanded`,
   * written at parse time and keyed by the engine's own action names - so
   * `action: "simplify"` and `body.simplify` are two halves of one instruction
   * and this is where they meet. Until this line, the engine could ask for a
   * reshape the player had no text for, and the player correctly did nothing.
   *
   * Simplify was blocked on `textVariant` for a week. It was never
   * `textVariant`; it was this field, which did not exist yet.
   */
  return {
    heading: segment.title ?? lessonTitle,
    body: {
      default: base,
      ...reshape("simplify", segment.depthVariants?.simplified?.body, base),
      ...reshape("expand", segment.depthVariants?.expanded?.body, base),
    },
  };
}

/**
 * One depth key, or nothing at all.
 *
 * **TWO WAYS A REWRITE IS NOT A REWRITE**, and both end the same way. `body`
 * defaults to `""` on the wire, so an empty one is a field that exists and
 * says nothing. And a rewrite identical to the source is a toggle that
 * re-renders the same prose - which this player already refuses to offer,
 * because it is the screen telling a child it adapted when it did not.
 *
 * Omitting the key rather than carrying an empty string matters: the player
 * offers only the densities a segment actually HAS, and it tests for the key's
 * presence.
 */
function reshape(
  key: "simplify" | "expand",
  body: string | null | undefined,
  base: string,
): Partial<Record<"simplify" | "expand", string>> {
  const text = body?.trim();
  if (!text || text === base.trim()) return {};
  return { [key]: text };
}

/**
 * The segment's picture, when there is one a child should actually be shown.
 *
 * TWO GATES, and both matter.
 *
 * `imageUrl` must exist - `availableModalities` listing `visual` is a claim,
 * not a payload, and the whole library claimed it with a null variant for
 * months.
 *
 * `qualityValidated` must be true. These are generated images with a review
 * pass behind them (`reviewedBy` on the one measured was `claude-opus-4-8`, so
 * a model rather than a person), and an image that failed its own review is one
 * we have been told not to trust. Showing a child a wrong or confusing picture
 * of a concept they are trying to learn is a worse failure than showing them
 * none - more so here, where a picture may be the channel they rely on.
 *
 * `caption` carries the alt text as well as the visible caption: it is the only
 * human-readable description on the variant. `prompt` is NOT used - it is the
 * instruction we gave a generator, not a description of what was drawn, and it
 * has no business reaching a child or a screen reader.
 */
function visualFor(
  segment: ContentSegment,
  lessonTitle: string,
): VisualContent | undefined {
  const variant = segment.visualVariant;
  if (!variant?.imageUrl || !variant.qualityValidated) return undefined;
  const caption = variant.caption?.trim();
  return {
    heading: segment.title ?? lessonTitle,
    illustration: {
      src: variant.imageUrl,
      // Without a caption there is no honest description, and an empty alt is
      // the correct way to say "this adds nothing a screen reader needs" -
      // better than narrating a generator's prompt at a child.
      alt: caption ?? "",
      ...(caption ? { caption } : {}),
      // Kept so a link that has aged out can be re-issued rather than shown
      // broken - `imageUrl` is signed and expires, `storagePath` does not.
      ...(variant.storagePath ? { storagePath: variant.storagePath } : {}),
      // The small copy, to paint first (B47). Null on pictures stored before
      // it existed, which is "use imageUrl", not a fault.
      ...(variant.previewUrl ? { previewSrc: variant.previewUrl } : {}),
      // The picture's own shape, when measured. Absent falls back to the
      // frame's 4:3, which is what every picture was squeezed into before.
      ...(isPositive(variant.width) && isPositive(variant.height)
        ? { width: variant.width, height: variant.height }
        : {}),
    },
  };
}

const isPositive = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * The segment's narration, when there is a clip AND words to fall back on.
 *
 * `transcript` is required by `AudioContent` and is not decoration: it is what
 * a child reads when the audio will not play, what a deaf child uses instead,
 * and the only part of this that survives a dead URL. A clip with no script is
 * therefore not offered at all - narration nobody can fall back from is exactly
 * the blank frame the rule at the top forbids.
 *
 * ONLY A POSITIVE MEASURED `durationMs` IS MAPPED. It was 0 on real narration -
 * verified against an 80,893-byte mp3 that plays - and since 14 Sep the field is
 * `integer | null` and backend sends null when nothing measured the file. Both
 * mean the same thing: un-computed metadata, not a clip of no length. Passing
 * either through would have the card claim a length nobody measured; omitting it
 * lets the audio element report the truth once it has the file.
 *
 * The guard must stay a POSITIVE-NUMBER test. `!== 0` lets null through and
 * `Math.round(null / 1000)` is 0, which fabricates the very claim this avoids;
 * `!= null` lets a measured 0 through and does the same.
 */
function audioFor(
  segment: ContentSegment,
  lessonTitle: string,
): AudioContent | undefined {
  const variant = segment.audioVariant;
  const transcript = variant?.script?.trim();
  if (!variant?.audioUrl || !transcript) return undefined;
  const heading = segment.title ?? lessonTitle;
  return {
    heading,
    title: `Narrated: ${heading}`,
    src: variant.audioUrl,
    ...(variant.storagePath ? { storagePath: variant.storagePath } : {}),
    transcript,
    ...(typeof variant.durationMs === "number" && variant.durationMs > 0
      ? { durationSec: Math.round(variant.durationMs / 1000) }
      : {}),
  };
}

/**
 * The segment's inline check, if it has one this app can honestly mark.
 *
 * `toQuickCheck` returns null for a checkpoint with no answer key, a
 * multiple-answer one, or one whose key matches none of its options - all of
 * which exist in content parsed before the checkpoint contract did. The FIRST
 * markable checkpoint wins: the player draws one sheet per segment, and
 * showing a child the second question of two is worse than showing the first.
 */
function quickCheckFor(segment: ContentSegment): QuickCheck | undefined {
  for (const checkpoint of segment.comprehensionCheckpoints) {
    const check = toQuickCheck(checkpoint);
    // The concept rides along for a review's scheduler write - see
    // `QuickCheck.conceptId`. Omitted rather than null, like the assessment.
    if (check) {
      return checkpoint.conceptId
        ? { ...check, conceptId: checkpoint.conceptId }
        : check;
    }
  }
  return undefined;
}

/**
 * The co-construction solver's content, when the segment carries a calculation
 * this app can draw and mark from the payload alone (SCRUM-181, on SCRUM-177's
 * payload).
 *
 * THE FRONT END COMPUTES NOTHING HERE. Every step's right answer is one the
 * pipeline wrote down - `answer`, `targets`, or the options they name - and
 * the child's entry is matched against that list (`isStoredAnswer`). The
 * drawing is the payload's `scaffold` read as given, and the equation is the
 * payload's own `assembles` and `equationState` strings. Nothing is parsed out
 * of notation and nothing is worked out from it, which is why this no longer
 * reads a fraction's numerator to find how many pieces a child builds.
 *
 * REFUSES WHOLE, NEVER IN PART. If any one step cannot be built, the whole
 * variant is dropped and the segment stays text. Half a solve is worse than
 * none: a child who works two steps and meets a dead third has been walked
 * into a locked door, and the text they would otherwise have read is still
 * the whole lesson.
 */
function calculationFor(
  segment: ContentSegment,
): CalculationSegment | undefined {
  const variant = segment.calculationVariant;
  return variant ? calculationFromVariant(variant) : undefined;
}

/**
 * One wire `CalculationVariant` as the solver draws it, or nothing.
 *
 * Exported because the signed-out walkthrough's calculation is written in the
 * wire's own shape and run through this same adapter, so the demo a visitor
 * plays is the payload path and cannot drift from it.
 */
export function calculationFromVariant(
  variant: WireCalculationVariant,
): CalculationSegment | undefined {
  if (variant.steps.length === 0) return undefined;

  // Resolved once: a tap step needs something to build on, and that is a
  // property of the variant rather than of the step.
  const manipulative = manipulativeFor(variant.manipulative);

  const steps: CalculationStep[] = [];
  for (const step of variant.steps) {
    const built = calcStepFor(step, manipulative);
    if (!built) return undefined;
    steps.push(built);
  }

  const scaffold = scaffoldFor(variant.scaffold);
  const conceptId = variant.conceptId?.trim();
  return {
    variant: variant.type?.trim() || "co_construction",
    ...(conceptId ? { conceptId } : {}),
    /*
     * `expression` is the problem as notation, required since SCRUM-177.
     * Content stored before it has only `fullEquation`, which on that content
     * IS the problem ("5x - 4 = 2x + 11"), so it stands in there and nowhere
     * else - on new content `fullEquation` may be the worked result, and the
     * full worked example is never rendered.
     */
    expression: (typeof variant.expression === "string"
      ? variant.expression
      : variant.fullEquation
    ).trim(),
    ...(scaffold ? { scaffold } : {}),
    ...(manipulative ? { manipulative } : {}),
    steps,
    completion: variant.completionStatement.trim(),
  };
}

/** A step's stored answers - its `answer`, then its `targets` - as written. */
function storedAnswers(step: WireCalculationStep): string[] {
  return [step.answer, ...(step.targets ?? [])]
    .filter((a): a is string | number | boolean => a != null)
    .map((a) => String(a).trim())
    .filter((a) => a !== "");
}

/**
 * One step, or nothing.
 *
 * `input` - SCRUM-177's tap, choice or number - is what the child does, and it
 * alone decides how the step is drawn. A step that names none is content
 * stored before it, and is refused rather than given an input inferred from
 * `expectedInput`, which says what kind of answer it is, not what the child
 * does to give it.
 *
 * Every kind refuses a step nobody can be right about: no stored answer at
 * all, or a choice whose stored answers name none of its own options.
 */
function calcStepFor(
  step: WireCalculationStep,
  manipulative: CalculationSegment["manipulative"],
): CalculationStep | undefined {
  const accepted = storedAnswers(step);
  const narration = narrationFor(step);
  const base = {
    stepId: step.stepId,
    prompt: step.prompt,
    hint: step.hint?.trim() ?? "",
    assembles: step.assembles?.trim() ?? "",
    equationState: step.equationState?.trim() ?? "",
    ...(narration ? { narration } : {}),
  };

  if (step.input === "choice") {
    const options = (step.options ?? []).map((o) => ({
      value: String(o.value).trim(),
      label: o.label,
    }));
    // Backend rejects a choice with fewer than two options now, but older
    // content is already parsed and a prompt with one choice is not a choice.
    if (options.length < 2) return undefined;
    // The same defect `toQuickCheck` refuses on a checkpoint: a key that names
    // none of its own options is a question with no right answer.
    if (!options.some((o) => isStoredAnswer(o.value, accepted))) {
      return undefined;
    }
    const confirm = step.confirmationText?.trim();
    return {
      ...base,
      input: "choice",
      options,
      accepted,
      ...(confirm ? { confirm } : {}),
    };
  }

  if (step.input === "number") {
    if (accepted.length === 0) return undefined;
    const unit = step.unit?.trim();
    return {
      ...base,
      input: "number",
      entry: step.expectedInput === "text" ? "text" : "numeric",
      accepted,
      ...(unit ? { unit } : {}),
    };
  }

  if (step.input === "tap") {
    /*
     * ONLY WHERE THERE IS SOMETHING TO BUILD. A tap step asks the child to
     * construct a quantity; handing them a number field instead is the same
     * substitution §4 forbids for the scaffold image - a different task
     * wearing the right prompt.
     */
    if (!manipulative) return undefined;
    const target = pieceCount(accepted, manipulative.parts);
    if (target === undefined) return undefined;
    return { ...base, input: "tap", target };
  }

  return undefined;
}

/**
 * How many pieces a tap step builds: the first stored answer written as a
 * whole number the bar can hold. "3" is three pieces. "3/4" is a fraction,
 * and reading three out of it would be this app doing the pipeline's
 * arithmetic, so it is not read; a step stored only that way has nothing to
 * build and is refused.
 */
function pieceCount(accepted: string[], parts: number): number | undefined {
  for (const answer of accepted) {
    if (!/^\d+$/.test(answer)) continue;
    const count = Number(answer);
    if (count >= 1 && count <= parts) return count;
  }
  return undefined;
}

/**
 * What a tap step builds on, where a frame draws it.
 *
 * ONLY `fraction_bar`. The wire names five kinds and design has drawn one,
 * 17b's tap-a-piece-into-the-bar. Design ruled on 23 Sep that the other four
 * are drawn "once as a shared set", and that set has not arrived - so they
 * refuse rather than approximate. §4: the interaction IS the mechanism, and a
 * wrong one is a different task rather than a lesser version of the right one.
 */
function manipulativeFor(
  m: Manipulative | null | undefined,
): CalculationSegment["manipulative"] {
  if (!m || m.kind !== "fraction_bar") return undefined;
  if (!Number.isInteger(m.parts) || m.parts < 1) return undefined;
  return { kind: "fraction_bar", parts: m.parts };
}

/** A mark as a count: a whole number, or a whole number written as text. */
function countOf(mark: CheckpointScalar): number | undefined {
  if (typeof mark === "number") {
    return Number.isInteger(mark) && mark >= 0 ? mark : undefined;
  }
  return typeof mark === "string" && /^\d+$/.test(mark.trim())
    ? Number(mark.trim())
    : undefined;
}

/**
 * The drawing beside the notation, read as the payload gives it.
 *
 * `marks[i]` is a quantity and `labels[i]` names it. That is SCRUM-177's own
 * worked example - `3/5 + 1/5` as `parts: 5, marks: [3, 1], labels: ["3/5",
 * "1/5"]` - and 17b's bars draw exactly it, one row per quantity. It is the
 * only reading made. Anything that does not fit is not drawn rather than drawn
 * some other way:
 *  - a mark that is not a whole number, or more than a bar or a line of
 *    `parts` can hold: drawing 2.5 cells, or clamping 7 down to 5, would be
 *    this app deciding what the picture means;
 *  - labels that do not pair one-to-one with the marks: they could be a
 *    line's tick labels, and nothing says which tick each one belongs to;
 *  - `array` and `place_value`, which no frame draws yet.
 *
 * `rows` is not read. The example sets it to 1 beside two marks, so it is not
 * the number of bars 17b draws, and the spec does not say what else it is.
 */
function scaffoldFor(
  scaffold: WireCalculationScaffold | null | undefined,
): CalcScaffold | undefined {
  if (!scaffold) return undefined;
  const marks = scaffold.marks ?? [];
  const labels = (scaffold.labels ?? []).map((l) => l.trim());
  if (marks.length === 0) return undefined;
  if (labels.length > 0 && labels.length !== marks.length) return undefined;

  const counts: number[] = [];
  for (const mark of marks) {
    const count = countOf(mark);
    if (count === undefined) return undefined;
    counts.push(count);
  }
  const quantities = counts.map((count, i) => ({
    count,
    ...(labels[i] ? { label: labels[i] } : {}),
  }));

  const { kind, parts } = scaffold;
  if (kind === "dots") return { kind, quantities };
  if (kind !== "bar" && kind !== "number_line") return undefined;
  if (!Number.isInteger(parts) || parts < 1) return undefined;
  if (counts.some((count) => count > parts)) return undefined;
  return kind === "bar"
    ? { kind, parts, quantities }
    : { kind, parts, points: quantities };
}

/**
 * A step's narration (17b §5), where it has a clip. No transcript is needed
 * the way segment audio needs one: the step's prompt and the equation stay on
 * screen the whole time, which is the rule for this layer.
 */
function narrationFor(step: WireCalculationStep): CalcNarration | undefined {
  const clip = step.narrationAudio;
  if (!clip?.audioUrl) return undefined;
  return {
    src: clip.audioUrl,
    ...(clip.storagePath ? { storagePath: clip.storagePath } : {}),
  };
}

function segmentFor(
  segment: ContentSegment,
  lessonTitle: string,
): LessonSegment {
  const quickCheck = quickCheckFor(segment);
  const visual = visualFor(segment, lessonTitle);
  const audio = audioFor(segment, lessonTitle);
  const calculation = calculationFor(segment);
  return {
    id: segment.id,
    modalities: modalitiesFor(segment, calculation),
    text: textFor(segment, lessonTitle),
    // Omitted rather than null: the player's `hasContent` tests presence.
    ...(visual ? { visual } : {}),
    ...(audio ? { audio } : {}),
    // Omitted rather than set undefined: the player tests `segment.quickCheck`
    // for presence, and an absent check must not gate progress.
    ...(quickCheck ? { quickCheck } : {}),
    // Both, because the player gates the solver on BOTH: the tag says a
    // calculation is here, the payload is what it draws.
    ...(calculation
      ? { calculationVariant: calculation.variant, calculation }
      : {}),
  };
}

/**
 * Modules are optional and come from a different endpoint (`/api/v1/lessons/{id}`),
 * so they are passed in rather than fetched here. A module whose segments did
 * not survive the mapping is dropped: the player indexes segments by id and a
 * module pointing at nothing would draw an empty boundary screen.
 */
function modulesFor(
  modules: ContentModule[],
  segments: LessonSegment[],
): LessonModule[] | undefined {
  if (modules.length === 0) return undefined;
  const known = new Set(segments.map((s) => s.id));
  const mapped = modules
    .slice()
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    .map((m) => ({
      id: m.id,
      title: m.title,
      segmentIds: m.segmentIds.filter((id) => known.has(id)),
      ...(m.preview ? { preview: m.preview } : {}),
      ...(m.recap ? { recap: m.recap } : {}),
    }))
    .filter((m) => m.segmentIds.length > 0);
  return mapped.length > 0 ? mapped : undefined;
}

/**
 * Build a playable lesson from the content endpoint's response.
 *
 * Returns null when the lesson has no segments at all - a lesson still being
 * parsed, or one whose parse failed. The player has nothing to show for that
 * and the caller should say so rather than open an empty spine.
 */
export function lessonFromContent(
  res: LessonDetailResponse,
  modules: ContentModule[] = [],
): Lesson | null {
  const ordered = res.segments
    .slice()
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  if (ordered.length === 0) return null;

  const segments = ordered.map((s) => segmentFor(s, res.title));

  const assessment = assessmentFor(res);
  const summary = summaryFor(res, ordered);

  return {
    id: res.id,
    title: res.title,
    segments,
    modules: modulesFor(modules, segments),
    // Omitted rather than set undefined, the same way the segment channels
    // are: the player tests `lesson.assessment` and `lesson.summary` for
    // PRESENCE, and an empty object would light a button that opens nothing.
    ...(assessment ? { assessment } : {}),
    ...(summary ? { summary } : {}),
  };
}

/**
 * The after-lesson assessment, if there is one this app can honestly mark.
 *
 * Backend sends `ComprehensionCheckpoint[]` - the same type as a segment's
 * inline check - so `toQuickCheck` is the adapter, not a second marker written
 * for this surface. It already refuses everything `AfterLessonAssessment`
 * cannot draw: no answer key (a question with no right answer, which would be
 * a locked door), `multiple_choice` (the sheet takes one tap), an array key,
 * fewer than two options, or a key matching none of them.
 *
 * RETURNS UNDEFINED RATHER THAN AN EMPTY ASSESSMENT. `assessment: []` is what
 * the contract's default delivers, and it passes a truthiness gate: the player
 * would enter the assessment phase and render a question list with no questions
 * in it. An assessment nobody can answer is not an assessment.
 *
 * `recoveryNote` is deliberately dropped. `toQuickCheck` synthesises the quick
 * check's own wording, and `AfterLessonAssessment` already owns the copy for
 * this surface - letting the component's default win keeps one string in one
 * place rather than two that can drift.
 *
 * `masteredConcepts`, `revisitConcepts` and `resultNote` are left unset: they
 * are not on the lesson. The server sends them on the completion write's
 * answer (B26), and the player hands them to both screens - see
 * `lib/lessons/checkOutcome`. None is derivable here.
 */
function assessmentFor(res: LessonDetailResponse): Assessment | undefined {
  const questions = (res.assessment ?? [])
    /*
     * Zipped with the checkpoint it came from, because `toQuickCheck` returns
     * the markable shape and keeps none of the checkpoint's identity - so both
     * the concept AND THE ID have to be read from the source rather than
     * recovered.
     *
     * This comment used to say the identity was dropped deliberately, and that
     * reading cost a day: it made the id look like a decision rather than an
     * omission, so a scaffold attempt looked unpostable and the missing
     * `problemId` was raised with backend as a gap. It was never a gap.
     * `ComprehensionCheckpoint.id` is required on the wire and always was.
     */
    .map((checkpoint) => ({ checkpoint, quick: toQuickCheck(checkpoint) }))
    .filter(
      (
        pair,
      ): pair is { checkpoint: (typeof pair)["checkpoint"]; quick: NonNullable<(typeof pair)["quick"]> } =>
        pair.quick !== null,
    )
    .map(({ checkpoint, quick }) => ({
      // The checkpoint's own id, kept rather than discarded - it is the stable
      // identifier a scaffold attempt is keyed on. See `AssessmentQuestion.id`.
      id: checkpoint.id,
      prompt: quick.question,
      options: quick.options,
      correctId: quick.correctId,
      // Omitted rather than null: every consumer tests for presence, and a
      // question with no concept simply cannot inform a review.
      ...(checkpoint.conceptId ? { conceptId: checkpoint.conceptId } : {}),
      // A spoken question (B16), only where the server made it one.
      ...(quick.promptAudio ? { promptAudio: quick.promptAudio } : {}),
    }));

  return questions.length > 0 ? { questions } : undefined;
}

/**
 * The post-lesson recap, if the backend wrote one.
 *
 * `recap` is written for the child. `confirmationSummary` is NOT a substitute
 * and never was - it is the parser telling a teacher how confident it is about
 * its own output.
 *
 * `covered` HAS NO BACKEND FIELD. The summary screen renders it under "what you
 * covered", so it is derived from the concepts the lesson actually checked -
 * every `conceptName` across the assessment and the segments' own checkpoints,
 * de-duplicated, in the order they appear. A lesson that names no concepts has
 * no honest line to print, so the key is omitted and the screen drops the card
 * rather than drawing an empty one.
 *
 * Segment TITLES are deliberately not a fallback: `textFor` already defaults a
 * missing title to the lesson title, so a lesson of untitled segments would
 * print its own name once per segment.
 */
function summaryFor(
  res: LessonDetailResponse,
  segments: ContentSegment[],
): CompletionSummary | undefined {
  const recap = res.recap?.trim();
  if (!recap) return undefined;

  const seen = new Set<string>();
  for (const checkpoint of [
    ...(res.assessment ?? []),
    ...segments.flatMap((s) => s.comprehensionCheckpoints ?? []),
  ]) {
    const name = checkpoint.conceptName?.trim();
    if (name) seen.add(name);
  }

  const covered = [...seen].join(" · ");
  return covered ? { recap, covered } : { recap };
}
