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
  CalculationVariant as WireCalculationVariant,
  CalculationStep as WireCalculationStep,
} from "@/lib/api/variants";
import {
  CALC_MODALITY,
  MODALITY,
  type CalcModality,
  type Modality,
} from "@/lib/constants";
import type {
  Assessment,
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
 *   - CALCULATION is on where `calculationFor` can build every step, and draws
 *     no scaffold. The wire's `CalculationVariant` carries `answer`, read as
 *     `problem.answer`, and now a `scaffold` of its own too
 *     (`CalculationScaffold`: kind, parts, rows, marks, labels - deployed spec,
 *     checked 1 Oct). That one is not read: the solver is frozen pending its
 *     backend payload (SCRUM-181/177), and the player's `scaffold` is the
 *     authored demo's shape, whose `rows` lists numerators where the wire's is
 *     a single integer.
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
 * this app can honestly mark.
 *
 * NOTHING MAPPED THIS UNTIL NOW. `calculationVariant` has been on the wire and
 * typed in this client for weeks, and no code anywhere read it into a
 * `CalculationSegment` - so `LessonPlayer`'s `segment.calculationVariant &&
 * segment.calculation` was false for every lesson that has ever existed, and
 * the product's most distinctive screen rendered as plain text. The JSS3 maths
 * lesson's two calculation segments are the first content that can reach it.
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
  if (!variant || variant.steps.length === 0) return undefined;

  // Resolved once: every step needs to know whether a drag has anything to be
  // built on, and it is a property of the variant rather than of the step.
  const manipulative = manipulativeFor(variant);

  const steps: CalculationStep[] = [];
  for (const step of variant.steps) {
    const built = calcStepFor(step, manipulative !== undefined);
    if (!built) return undefined;
    steps.push(built);
  }

  /*
   * The equation as it reads at each moment, opening state first.
   *
   * `fullEquation` is where the child starts and each step's `equationState`
   * is where that step leaves it, so the states run one longer than the steps.
   * Dropped entirely if the backend wrote none, because a blank line under the
   * prompt says less than no line at all.
   */
  const states = [variant.fullEquation, ...variant.steps.map((s) => s.equationState)]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  return {
    variant: variant.type?.trim() || "generated",
    problem: {
      expression: variant.fullEquation,
      // The variant's own answer, and ONLY as the whole calculation's answer.
      // It is not a step's answer - for `5x - 4 = 2x + 11` it is "5" while the
      // steps answer "3x - 4", "3x" and 5 - so it never reaches a step here.
      ...(variant.answer != null && String(variant.answer).trim()
        ? { answer: String(variant.answer).trim() }
        : {}),
    },
    // No scaffold yet. The deployed `CalculationVariant` carries one now
    // (`scaffold`, a `CalculationScaffold`), but the solver is frozen pending
    // its backend payload (SCRUM-181/177) and this field is the authored
    // fraction demo's `{parts, rows}`, whose `rows` lists numerators where the
    // wire's is a single integer. The solver draws no bars rather than bars
    // made from numbers that mean something else.
    ...(states.length > 1 ? { equationStates: states } : {}),
    steps,
    completion: variant.completionStatement,
    modalities: calcModalitiesFor(variant),
    ...(manipulative ? { manipulative } : {}),
  };
}

/**
 * One step, or nothing.
 *
 * `answer` is PER STEP and landed 16 Sep. Mapping the variant's answer onto
 * every step renders "5" for all three steps of `5x - 4 = 2x + 11`, where only
 * the last is right - and a number stays a number while a string stays a
 * string, so `3/4` does not stop being a fraction on the way through.
 *
 * `answer`, `options` and `unit` are all OPTIONAL in the deployed schema, and
 * a lesson parsed before the 0057 migration carries none of them. A step with
 * no answer cannot be marked, so it is refused rather than drawn.
 */
function calcStepFor(
  step: WireCalculationStep,
  /** Whether this variant carries a manipulative the player can draw. */
  hasManipulative: boolean,
): CalculationStep | undefined {
  const answer = step.answer;
  const hasAnswer = answer != null && String(answer).trim() !== "";

  if (step.expectedInput === "selection") {
    const options = step.options ?? [];
    // Backend now rejects a selection step with fewer than two options, but
    // older content is already parsed and this app must not draw a prompt with
    // one choice or none.
    if (options.length < 2 || !hasAnswer) return undefined;
    const correct = options.findIndex(
      (o) => String(o.value).trim() === String(answer).trim(),
    );
    // A key matching none of its own options is the same defect `toQuickCheck`
    // refuses on a comprehension checkpoint, for the same reason.
    if (correct < 0) return undefined;
    return {
      prompt: step.prompt,
      choices: options.map((o) => o.label),
      correct,
      hint: step.hint,
      ...(step.confirmationText?.trim()
        ? { onCorrect: { confirm: step.confirmationText.trim() } }
        : {}),
    };
  }

  if (step.expectedInput === "numeric" || step.expectedInput === "text") {
    if (!hasAnswer) return undefined;
    return {
      prompt: step.prompt,
      input: step.expectedInput,
      answer: String(answer).trim(),
      hint: step.hint,
      ...(step.unit?.trim() ? { unit: step.unit.trim() } : {}),
    };
  }

  /*
   * `drag` IS the co-construction, and it now has structure to be built on.
   *
   * The step still renders as a numeric one: the manipulative is a LAYER the
   * child turns on over it, not a replacement for it, which is §4's "the one
   * place modalities layer rather than switch". What the manipulative needs -
   * the parts and the target - comes off the variant, not the step, so it is
   * resolved once in `manipulativeFor` and the step only has to be markable.
   *
   * Refused without an answer, exactly as numeric and text are: a step nobody
   * can be right about is not a step.
   */
  if (step.expectedInput === "drag") {
    /*
     * ONLY WHERE THERE IS SOMETHING TO BUILD.
     *
     * Without a drawable manipulative this stays refused, exactly as it was
     * before the structure existed. A drag step asks the child to construct a
     * quantity; handing them a number pad instead is the same substitution §4
     * forbids for the scaffold image - a different task wearing the right
     * prompt. The old behaviour was correct for content with no structure, and
     * most content still has none.
     */
    if (!hasAnswer || !hasManipulative) return undefined;
    return {
      prompt: step.prompt,
      input: "numeric",
      answer: String(answer).trim(),
      hint: step.hint,
      ...(step.unit?.trim() ? { unit: step.unit.trim() } : {}),
    };
  }

  return undefined;
}

/**
 * The structure behind a `drag` step, when there is one we can actually draw.
 *
 * ONLY `fraction_bar`. The wire names five kinds - `fraction_bar`,
 * `number_line`, `array`, `place_value`, `counters` - and design has drawn
 * exactly one of them: 17b's tap-a-quarter-into-a-four-part-bar. The other
 * four have no frame at all, checked across the student set on 21 Sep.
 *
 * Drawing them anyway would mean inventing four interactions, and §4 is
 * explicit that the interaction IS the mechanism - a wrong one is not a
 * lesser version of the right one, it is a different task. So the rest refuse
 * and the calculation renders without a kinesthetic layer, which is the
 * honest reduced form. Filed for design.
 *
 * `target` comes off the drag step's own answer. The frontend computes no
 * quantity of its own (rule 3): if the answer does not resolve to a whole
 * number of pieces the bar can hold, there is nothing to build and the
 * manipulative is refused rather than clamped.
 */
function manipulativeFor(
  variant: WireCalculationVariant,
): { kind: string; parts: number; target: number } | undefined {
  const m = variant.manipulative;
  if (!m || m.kind !== "fraction_bar") return undefined;

  const parts = Math.trunc(m.parts);
  if (!Number.isFinite(parts) || parts < 1) return undefined;

  const drag = variant.steps.find((st) => st.expectedInput === "drag");
  const raw = drag?.answer;
  if (raw == null) return undefined;

  // "3" and "3/4" both mean three pieces of a four-part bar. Anything else is
  // not a count, and guessing at one would be inventing the child's answer.
  const text = String(raw).trim();
  const numerator = /^(\d+)\s*\/\s*\d+$/.exec(text)?.[1] ?? text;
  if (!/^\d+$/.test(numerator)) return undefined;

  const target = Number(numerator);
  if (target < 1 || target > parts) return undefined;

  return { kind: m.kind, parts, target };
}

/**
 * Which layers this calculation actually has.
 *
 * Interactive always - it IS the co-construction. Audio only where a step
 * carries narration. Kinesthetic where the variant carries a manipulative this
 * player can draw, which since 21 Sep is a real possibility rather than a
 * standing no.
 */
function calcModalitiesFor(variant: WireCalculationVariant): CalcModality[] {
  const modalities: CalcModality[] = [CALC_MODALITY.INTERACTIVE];
  if (variant.steps.some((s) => s.narrationAudio)) {
    modalities.push(CALC_MODALITY.AUDIO);
  }
  // Offered only where there is something to build. Claiming the layer without
  // the structure is what `availableModalities` did for months.
  if (manipulativeFor(variant)) {
    modalities.push(CALC_MODALITY.KINESTHETIC);
  }
  return modalities;
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
 * `masteredConcepts`, `revisitConcepts` and `resultNote` are left unset:
 * backend supplies none of them and none is derivable. Both consuming screens
 * already guard on their absence.
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
