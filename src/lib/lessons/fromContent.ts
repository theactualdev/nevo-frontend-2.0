import type {
  LessonDetailResponse,
  LessonModule as ContentModule,
  LessonSegment as ContentSegment,
  ReadingChunk,
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
import {
  isActivity,
  type CalculationScaffold as WireCalculationScaffold,
  type CalculationVariant as WireCalculationVariant,
  type CalculationStep as WireCalculationStep,
  type EquationCallout,
  type KeyTerm,
  type Manipulative,
} from "@/lib/api/variants";
import type { CheckpointScalar } from "@/lib/api/checkpoints";
import { isStoredAnswer } from "./storedAnswer";
import { chunksForBody } from "./chunk";
import { chosenFrom } from "./segmentChoice";
import { MODALITY, type Modality } from "@/lib/constants";
import type {
  Assessment,
  CalcHighlight,
  CalcNarration,
  CalcScaffold,
  CalcToken,
  CalculationSegment,
  CalculationStep,
  CompletionSummary,
  Lesson,
  LessonModule,
  LessonSegment,
  AudioContent,
  InteractiveContent,
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
 * ON as of 21 Oct: THE ACTIVITY (SCRUM-268). The wire's `interactiveVariant`
 * comes in two forms (Teslim, 14 Oct), and the ACTIVITY - a title, what is
 * needed, ordered steps and its two lines - is the player's tickable steps, so
 * it maps; see `interactiveFor`. Until this it never reached a child: no
 * `segment.interactive` was built, so Osmosis's section 4 activity arrived
 * and was dropped on the device. The QUESTION form still does not map - a
 * prompt and an answer key are not steps - and the server does not offer it
 * as a format either.
 *
 * AN ACTIVITY IS OFFERED, NEVER OPENED ON ITS OWN. It is one of the
 * section's `formats` - the group offers it, and a section the child picked
 * it on opens in it - but it is not in `modalities`, which is what a section
 * opens in when nothing was picked: the plan's format is held to that list,
 * and its first entry is the fallback. Adding the activity there would have
 * let a section open in it with no pick, and the opening format is Lydia's
 * to decide (21 Oct, twice: "Do not change format selection logic yet";
 * "with no stored pick, a section opens exactly as on main today").
 *
 * ONLY PART-WAY ON, and why:
 *   - CALCULATION is on where `calculationFor` can build every step from the
 *     payload SCRUM-177 delivered: each step's `input`, its stored answers,
 *     `assembles` and `equationState`, and the `scaffold` drawing where a
 *     frame draws its kind. See `calculationFromVariant`. It is then the
 *     segment's ONLY channel, and where it cannot be built the segment is its
 *     source text - see `modalitiesFor`.
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

/**
 * The channels a section can open in with nothing picked. The activity is
 * drawn too, and offered beside them - see the top.
 */
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
   * A CALCULATION IS THE INTERACTIVE CHANNEL AND NOTHING ELSE. The player
   * routes Interactive to the solver when the segment carries a calculation,
   * and a calculation is never opened, offered or suggested as plain text or
   * as a picture: Lydia, 17 Oct (#5), "Calculations stop opening as plain
   * text ... Agree it is interactive and visual only, and match", and Teslim,
   * 19 Oct, "A valid one advertises interactive only, with the scaffold
   * inside the player." The scaffold is drawn by the solver; "calculations do
   * not generate pictures".
   *
   * This offered Text beside it, and the player opens a segment in its first
   * offered channel when the engine names none - so a calculation with no
   * plan row opened as its text, and could be switched to it besides.
   *
   * Gated on the BUILT calculation rather than on `availableModalities`,
   * because the same rule applies here as to visual and audio: a segment can
   * claim a modality it has no payload for, and claiming is not having. One
   * the server offered that `calculationFor` refused is `asSourceText`.
   */
  if (calculation) return [MODALITY.INTERACTIVE];
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
 * A calculation this app cannot draw, as its source text - and its narration
 * where it has a clip to play - never a blank section and never a picture.
 *
 * Teslim, 19 Oct: "Invalid/missing calculation data falls back to source text
 * and available audio ... If frontend validation rejects it, render the
 * returned source body rather than a blank section", and "A renderer failure
 * on the device should use the source body and report the failure." Both
 * come here: `calculationFor` refusing what the server offered as
 * interactive, and the solver failing on the device (`LessonPlayer`).
 *
 * The picture goes with the calculation: calculations do not generate
 * pictures, and a diagram of a sum with no words is the failure the backend
 * itself fixed ("a picture of a sum is not a lesson on its own").
 *
 * `reason` is why, for the crash report the player sends - never rendered.
 */
export function asSourceText(
  segment: LessonSegment,
  reason: string,
): LessonSegment {
  const fallback: LessonSegment = {
    ...segment,
    modalities: segment.audio
      ? [MODALITY.TEXT, MODALITY.AUDIO]
      : [MODALITY.TEXT],
    calculationRefused: reason,
  };
  delete fallback.calculation;
  delete fallback.calculationVariant;
  delete fallback.visual;
  // The server listed the calculation's own formats - interactive, which this
  // segment no longer has - so the group offers the fallback's instead.
  delete fallback.formats;
  delete fallback.recommendedFormat;
  return fallback;
}

/**
 * The format group's pills and its marker, as the server sent them
 * (SCRUM-272): `availableFormats` in its own order - "authored opening order
 * is preserved among available formats" - narrowed to what this app can
 * draw (`drawable`), so a picture that failed its own review stays out
 * whatever the list says. `recommendedFormat` only where it names one of
 * them; nothing here works one out.
 *
 * NOTHING AT ALL for a payload with no `availableFormats`: the player then
 * offers `modalities`, as it did before the field, and marks nothing.
 */
function formatsFor(
  segment: ContentSegment,
  drawable: readonly Modality[],
): Pick<LessonSegment, "formats" | "recommendedFormat"> {
  if (!Array.isArray(segment.availableFormats)) return {};
  const formats = [
    ...new Set(
      segment.availableFormats.filter((f): f is Modality =>
        (drawable as readonly string[]).includes(f),
      ),
    ),
  ];
  const recommended = segment.recommendedFormat;
  return {
    formats,
    recommendedFormat: formats.find((f) => f === recommended) ?? null,
  };
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
  const variant = segment.textVariant;
  const keyPoints = textsOf(variant?.keyPoints);
  const keyTerms = keyTermsOf(variant?.keyTerms);
  const equations = equationsOf(variant?.equationCallouts);
  const readingChunks = chunksOf(segment.readingChunks, base);
  return {
    heading: segment.title ?? lessonTitle,
    body: {
      default: base,
      ...reshape("simplify", segment.depthVariants?.simplified?.body, base),
      ...reshape("expand", segment.depthVariants?.expanded?.body, base),
    },
    /*
     * SCRUM-224. `keyPoints` were never removed from the wire - this dropped
     * them - and `keyTerms` and `equationCallouts` are typed as of 8 Oct.
     * Omitted rather than empty: the segment draws a box only for what came.
     *
     * A KEY TERM'S `definition` comes with it: design, 9 Oct, "A definition
     * appears in place when the child taps the term."
     */
    ...(keyPoints ? { keyPoints } : {}),
    ...(keyTerms ? { keyTerms } : {}),
    ...(equations ? { equations } : {}),
    ...(readingChunks ? { readingChunks } : {}),
  };
}

/** The non-blank strings of a list, trimmed, or nothing when none are left. */
function textsOf(
  list: readonly unknown[] | null | undefined,
): string[] | undefined {
  const out = (list ?? [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length > 0 ? out : undefined;
}

/**
 * Each term with words in it, and its definition only where it has one.
 * Exported for the teacher's variant review, so a teacher reviews exactly the
 * terms a child will see.
 */
export function keyTermsOf(
  terms: readonly KeyTerm[] | null | undefined,
): TextContent["keyTerms"] {
  const out = (terms ?? []).flatMap((t) => {
    const term = typeof t?.term === "string" ? t.term.trim() : "";
    if (!term) return [];
    const definition =
      typeof t.definition === "string" ? t.definition.trim() : "";
    return [definition ? { term, definition } : { term }];
  });
  return out.length > 0 ? out : undefined;
}

/** Each equation with words in it, and its label only where it has one. */
export function equationsOf(
  callouts: readonly EquationCallout[] | null | undefined,
): TextContent["equations"] {
  const out = (callouts ?? []).flatMap((c) => {
    const equation = typeof c?.equation === "string" ? c.equation.trim() : "";
    if (!equation) return [];
    const label = typeof c.label === "string" ? c.label.trim() : "";
    return [label ? { equation, label } : { equation }];
  });
  return out.length > 0 ? out : undefined;
}

/**
 * The server's reading chunks for this body, in order - or nothing, and the
 * body reads as one.
 *
 * REFUSED WHOLE WHEN THEY ARE NOT THIS BODY'S WORDS. They are drawn in place
 * of `body`, so a set that drops, adds or changes a word would put text on
 * screen that is not the approved lesson. A set that does not carry exactly
 * the body's words, or a chunk with no id or no text, falls back to the body
 * itself: nothing is lost, the passage is simply one block. The segment asks
 * the same question again of the text it actually shows - `chunksForBody`.
 */
function chunksOf(
  chunks: readonly ReadingChunk[] | null | undefined,
  body: string,
): TextContent["readingChunks"] {
  if (!Array.isArray(chunks) || chunks.length === 0) return undefined;
  const ordered = chunks
    .slice()
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    .map((c) => ({
      id: typeof c?.id === "string" ? c.id : "",
      text: typeof c?.text === "string" ? c.text.trim() : "",
    }));
  if (ordered.some((c) => !c.id || !c.text)) return undefined;
  return chunksForBody(body, ordered) ? ordered : undefined;
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
 * The segment's activity, as the player's tickable steps - or nothing.
 *
 * SCRUM-268, 21 Oct: the activity card was not reaching the child, and it
 * was ours - it arrived on the wire and this adapter dropped it. Read field
 * for field, nothing added: `title` is the heading, `introduction` the line
 * under it (kept, though frame d6b9fbc no longer draws it), `materials` what
 * is needed, and each step's `instruction` a step.
 *
 * ONLY THE ACTIVITY FORM. The question form (`isActivity` false) is a prompt
 * with an answer key, not steps, and is left unmapped as it always was.
 *
 * NO STEP, NO ACTIVITY. A step with no words is not drawn - a card to tick
 * with nothing on it - and an activity with none left is not offered at all,
 * by the rule at the top: a channel offered and found blank is worse than one
 * never offered. The server offers `interactive` only where there are steps.
 *
 * THE TWO LINES, EACH ONLY WHEN SENT (SCRUM-273): `inProgress` is the line
 * while the steps are under way, `outcome` the line once they are done - see
 * `InteractiveContent.outcome`. Either may be absent, and one with no words
 * is no line. Nothing is written for a line the server did not send: no
 * guide line, no generic "you have completed" - the server dropped its own
 * default (acc5b27), and this adapter never had one.
 */
function interactiveFor(
  segment: ContentSegment,
  lessonTitle: string,
): InteractiveContent | undefined {
  const variant = segment.interactiveVariant;
  if (!variant || !isActivity(variant)) return undefined;
  /*
   * AN ACTIVITY WITH A SAFETY SENTENCE IS NOT OFFERED UNTIL ITS LINE CAN BE
   * DRAWN (SCRUM-280, a blocker, Lydia 23 Oct): "an activity whose source has
   * a safety sentence MUST NOT RENDER AT ALL if the card can't display it".
   * The server sends `safety` since 92af149 and this card has no designed
   * place for it yet - above the steps, distinct from a step, never collapsed
   * or dismissible - so production showed Osmosis section 4's activity with
   * its "let an adult do the cutting" line missing. Not built here means not
   * in the format group, so no pick, stored choice or engine plan can open
   * it; the section keeps its other formats. Lifted when the drawn line ships.
   */
  if (lineOf(variant.safety)) return undefined;
  const steps = textsOf(
    Array.isArray(variant.steps) ? variant.steps.map((s) => s?.instruction) : [],
  );
  if (!steps) return undefined;
  const title = typeof variant.title === "string" ? variant.title.trim() : "";
  const intro =
    typeof variant.introduction === "string"
      ? variant.introduction.trim()
      : "";
  const needs = textsOf(variant.materials);
  const pending = lineOf(variant.inProgress);
  const done = lineOf(variant.outcome);
  return {
    heading: title || (segment.title ?? lessonTitle),
    ...(intro ? { intro } : {}),
    ...(needs ? { needs } : {}),
    steps,
    ...(pending || done
      ? {
          outcome: {
            ...(pending ? { pending } : {}),
            ...(done ? { done } : {}),
          },
        }
      : {}),
  };
}

/** A line with words in it, or nothing. */
function lineOf(value: unknown): string | undefined {
  const line = typeof value === "string" ? value.trim() : "";
  return line || undefined;
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
 * THE FRONT END COMPUTES NOTHING HERE. Every step's right answer is the one
 * the pipeline wrote down - `answer`, or the option it names, and for a typed
 * step every other form it stored in `acceptedAnswers` - and the child's
 * entry is matched against that list (`isStoredAnswer`). The
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
 *
 * A REFUSAL SAYS WHY, for the crash report the player sends when the server
 * offered this segment as interactive (Teslim, 19 Oct) - so a calculation
 * the server checked and this app did not is found and fixed, not silently
 * read as text forever. `undefined` is a segment that is no calculation.
 */
function calculationFor(
  segment: ContentSegment,
): CalculationVerdict | undefined {
  const variant = segment.calculationVariant;
  if (!variant) {
    return segment.contentType === "calculation" && offersInteractive(segment)
      ? { refused: "no calculation payload" }
      : undefined;
  }
  /*
   * A PAYLOAD THIS CANNOT EVEN READ IS A REFUSAL, NOT A CRASH. This runs for
   * every segment as the lesson opens, so one malformed calculation thrown
   * from here took the whole lesson down to its error screen. Only the
   * error's kind goes in the reason: its message can quote what it read.
   */
  try {
    return calculationVerdict(variant);
  } catch (cause) {
    const kind = cause instanceof Error ? cause.name : typeof cause;
    return { refused: `the payload could not be read (${kind})` };
  }
}

/** Whether the server offered this segment as interactive. */
const offersInteractive = (segment: ContentSegment) =>
  (segment.availableModalities as readonly string[]).includes(
    MODALITY.INTERACTIVE,
  );

/** A calculation built, or why it was not - about our checks, never the lesson's words. */
type CalculationVerdict =
  | { calculation: CalculationSegment; refused?: undefined }
  | { calculation?: undefined; refused: string };

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
  return calculationVerdict(variant).calculation;
}

function calculationVerdict(
  variant: WireCalculationVariant,
): CalculationVerdict {
  if (!Array.isArray(variant.steps) || variant.steps.length === 0) {
    return { refused: "no steps" };
  }

  // Resolved once: a tap step needs something to build on, and that is a
  // property of the variant rather than of the step. A place-value build
  // takes its columns from the scaffold, and a number-line build its start,
  // so the scaffold is read first.
  const scaffold = scaffoldFor(variant.scaffold);
  const manipulative = manipulativeFor(
    variant.manipulative,
    scaffold,
    variant.scaffold,
  );

  const steps: CalculationStep[] = [];
  for (const [i, step] of variant.steps.entries()) {
    const built = calcStepFor(step, manipulative);
    // By position, never by its words or its authored id.
    if (typeof built === "string") {
      return {
        refused: `step ${i + 1} of ${variant.steps.length}: ${built}`,
      };
    }
    steps.push(built);
  }

  const conceptId = variant.conceptId?.trim();
  const answer =
    typeof variant.answer === "string" ? variant.answer.trim() : variant.answer;
  const calculation: CalculationSegment = {
    variant: variant.type?.trim() || "co_construction",
    ...(conceptId ? { conceptId } : {}),
    // The solved calculation's answer, for the server alone (see the type).
    ...(answer === undefined || answer === null || answer === ""
      ? {}
      : { answer }),
    ...(carriesIds(variant, steps, scaffold, manipulative)
      ? { byId: true as const }
      : {}),
    /*
     * `expression` is the problem as notation, required since SCRUM-177.
     * `fullEquation` used to stand in for it on content stored before, when
     * nobody had said what it was. Backend has now (B101): it is the solved
     * equation, so standing it in would show the answer before the first
     * step. A problem with no notation shows none until a step assembles one.
     *
     * AND NOR DOES ONE THAT IS ONLY THE SOLVED EQUATION. Backend still stands
     * it in on the server (`expression or fullEquation`), so a lesson stored
     * without notation arrives with the two the same, and the answer would
     * show while step 1 is asked. Nothing here can tell that from a lesson
     * whose two happen to match, so neither shows a line before a step
     * assembles one: the answer is never shown early (B127).
     */
    expression: expressionOf(variant),
    fullEquation: variant.fullEquation?.trim() ?? "",
    ...(scaffold ? { scaffold } : {}),
    ...(manipulative ? { manipulative } : {}),
    steps,
    completion: variant.completionStatement.trim(),
  };
  return { calculation };
}

/**
 * Does this calculation name its parts by id (B109)? Any id anywhere - a
 * step's equation tokens or `resultTargetId`, a mark's, a label's or a
 * piece's - makes it a lesson written with them, and then its highlights are
 * matched to ids only. A lesson stored before them carries none, and is the
 * only kind whose targets are matched to words.
 */
function carriesIds(
  variant: WireCalculationVariant,
  steps: CalculationStep[],
  scaffold: CalcScaffold | undefined,
  manipulative: CalculationSegment["manipulative"],
): boolean {
  if (variant.steps.some((s) => s.resultTargetId?.trim())) return true;
  if (steps.some((s) => s.tokens)) return true;
  if (manipulative && "pieceIds" in manipulative) return true;
  if (!scaffold) return false;
  const quantities =
    scaffold.kind === "place_value"
      ? scaffold.places
      : scaffold.kind === "number_line"
        ? scaffold.points
        : scaffold.quantities;
  return (
    quantities.some((q) => q.id || q.labelId) ||
    ("partLabelIds" in scaffold && scaffold.partLabelIds !== undefined)
  );
}

/**
 * Ids paired with what they name, one to one in renderer order - or none,
 * where they do not pair. A list longer or shorter than what it names would
 * put every id after the gap on the wrong thing, so it is not read at all.
 */
function idsFor(
  ids: readonly string[] | undefined,
  count: number,
): string[] | undefined {
  if (!Array.isArray(ids) || ids.length !== count || count === 0) {
    return undefined;
  }
  return ids.map((id) => (typeof id === "string" ? id.trim() : ""));
}

/**
 * A step's equation line as tokens (B109), or none. A token with no id
 * could not be named, and one with no text could not be drawn, so a list
 * holding either is not read and the step draws its flat string.
 *
 * KEPT BACK, NEVER GUESSED (B127): a token is hidden until the step is
 * accepted where the payload says so - `hiddenUntilAccepted`, or its being
 * the step's `resultTargetId`.
 */
function tokensFor(step: WireCalculationStep): CalcToken[] | undefined {
  const wire = step.equationTokens;
  if (!Array.isArray(wire) || wire.length === 0) return undefined;
  const result = step.resultTargetId?.trim();
  const tokens: CalcToken[] = [];
  for (const t of wire) {
    const id = typeof t?.id === "string" ? t.id.trim() : "";
    if (!id || typeof t.text !== "string") return undefined;
    tokens.push({
      id,
      text: t.text.trim(),
      hidden: t.hiddenUntilAccepted === true || id === result,
    });
  }
  return tokens;
}

/**
 * The keys a typed step adds to the Nevo pad (B108), as the step names them,
 * once each. Absent where the step carries no `requiredCharacters` at all -
 * a lesson stored before the field.
 */
function keysFor(step: WireCalculationStep): string[] | undefined {
  if (!Array.isArray(step.requiredCharacters)) return undefined;
  const keys = step.requiredCharacters
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim())
    .filter((k) => k !== "");
  return [...new Set(keys)];
}

/** The problem's notation, or none where it is only the solved equation. */
function expressionOf(variant: {
  expression?: string | null;
  fullEquation?: string | null;
}): string {
  const expression = variant.expression?.trim() ?? "";
  return expression === (variant.fullEquation?.trim() ?? "") ? "" : expression;
}

/**
 * A step's stored answers, as written: its `answer` first, then - for a
 * number step - every other form in its `acceptedAnswers`, each once.
 *
 * NOT ITS `targets`. They name what a step points at, not what is right:
 * backend fills a step that has none with every one of its options, and uses
 * them as the step's highlights where it sends none. Read as answers, they
 * marked every option of such a choice right.
 *
 * `acceptedAnswers` (SCRUM-185) is where every acceptable form is stored -
 * "0.5" beside "1/2" (Lydia, 17 Oct). A NUMBER STEP ONLY: a choice is
 * answered by tapping an option, so a form that is not an option cannot be
 * given, and one that is an option would make a second option right, the
 * `targets` defect again. Nothing upstream keeps a choice step's list off its
 * other options, so a choice keeps its one answer.
 *
 * Other forms OF the answer: a step with no `answer` has none, whatever its
 * list holds - the server marks nothing against a missing key - and is still
 * the step nobody can be right about.
 */
function storedAnswers(
  step: WireCalculationStep,
  { alternatives }: { alternatives: boolean },
): string[] {
  const written = (forms: readonly unknown[]) =>
    forms
      .filter(
        (a): a is string | number | boolean =>
          typeof a === "string" ||
          typeof a === "number" ||
          typeof a === "boolean",
      )
      .map((a) => String(a).trim())
      .filter((a) => a !== "");
  const answer = written([step.answer]);
  if (answer.length === 0 || !alternatives) return answer;
  const others = Array.isArray(step.acceptedAnswers)
    ? written(step.acceptedAnswers)
    : [];
  return [...new Set([...answer, ...others])];
}

/**
 * One step, or why not - in words about our checks, never the step's own.
 *
 * `input` - SCRUM-177's tap, choice or number - is what the child does, and it
 * alone decides how the step is drawn. A step that names none is content
 * stored before it, and is refused rather than given an input inferred from
 * `expectedInput`, which says what kind of answer it is, not what the child
 * does to give it.
 *
 * A choice or a number refuses a step nobody can be right about: no stored
 * answer at all, or a choice whose stored answers name none of its own
 * options. A tap step is right when its `tapCount` is built.
 */
function calcStepFor(
  step: WireCalculationStep,
  manipulative: CalculationSegment["manipulative"],
): CalculationStep | string {
  const accepted = storedAnswers(step, {
    alternatives: step.input === "number",
  });
  const narration = narrationFor(step);
  const tokens = tokensFor(step);
  const base = {
    stepId: step.stepId,
    prompt: step.prompt,
    hint: step.hint?.trim() ?? "",
    assembles: step.assembles?.trim() ?? "",
    equationState: step.equationState?.trim() ?? "",
    ...(tokens ? { tokens } : {}),
    highlights: highlightsFor(step),
    ...(narration ? { narration } : {}),
  };

  if (step.input === "choice") {
    const options = (step.options ?? []).map((o) => ({
      value: String(o.value).trim(),
      label: o.label,
    }));
    // Backend rejects a choice with fewer than two options now, but older
    // content is already parsed and a prompt with one choice is not a choice.
    if (options.length < 2) return "a choice with fewer than two options";
    // The same defect `toQuickCheck` refuses on a checkpoint: a key that names
    // none of its own options is a question with no right answer.
    if (!options.some((o) => isStoredAnswer(o.value, accepted))) {
      return "a choice whose stored answer names none of its options";
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
    if (accepted.length === 0) return "a number step with no stored answer";
    const unit = step.unit?.trim();
    const keys = keysFor(step);
    return {
      ...base,
      input: "number",
      entry: step.expectedInput === "text" ? "text" : "numeric",
      ...(keys ? { keys } : {}),
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
    if (!manipulative) return "a tap step with nothing this app can build on";
    /*
     * HOW MANY PIECES IS `tapCount`, a positive whole number (B102). It used
     * to be read out of the step's stored answers, which said what the answer
     * was rather than how many taps build it. A count the bar or the array
     * cannot hold is refused, never clamped.
     */
    const target = step.tapCount;
    if (typeof target !== "number" || !Number.isInteger(target)) {
      return "a tap step whose tapCount is not a whole number";
    }
    const places = placesIn(manipulative);
    if (target < 1 || (places !== undefined && target > places)) {
      return "a tap step whose tapCount its build cannot hold";
    }
    const counted = countedAnswer(step.answer, target);
    return {
      ...base,
      input: "tap",
      target,
      ...(counted === undefined ? {} : { counted }),
    };
  }

  return "a step with no input this app draws";
}

/**
 * WHAT A FINISHED BUILD IS WRITTEN TO THE SERVER AS - the step's stored
 * answer, in the type it was stored in, when that answer is the count built.
 *
 * The server marks a calculation step against its stored `answer`, and reads
 * a count only where the answer is that count: 3 or "3" for a build of three.
 * A number goes up as a number and text as text, because a step that offers
 * options is matched as text, and 3 is not "3" there. 17b's own bar, three
 * quarters stored as "3/4", is not a count the server can match, and writing
 * the three pieces would file a right build as a miss - so it writes nothing,
 * and nothing here composes "3/4" out of the pieces.
 */
function countedAnswer(
  answer: unknown,
  target: number,
): string | number | undefined {
  if (typeof answer === "number") return answer === target ? answer : undefined;
  if (typeof answer === "string" && answer.trim() === String(target)) {
    return answer.trim();
  }
  return undefined;
}

/**
 * What a step's answer does to the drawing (B107), as written. A role the
 * spec does not name is dropped rather than read as one it does, and a
 * highlight with no target names nothing.
 */
function highlightsFor(step: WireCalculationStep): CalcHighlight[] {
  const out: CalcHighlight[] = [];
  for (const h of step.highlights ?? []) {
    const target = h.target?.trim();
    const role = h.role ?? "active";
    if (!target) continue;
    if (role !== "active" && role !== "source" && role !== "result") continue;
    out.push({ target, role });
  }
  return out;
}

/**
 * What a tap step builds on, where a frame draws it.
 *
 * All five of the wire's kinds (B112): 17b's tap-a-piece-into-the-bar, and
 * D149's same tap into an array's places, a hop along a number line, a place
 * value's columns, and counters - "Fill the frame with counters: tap to drop
 * a dot into the next empty space", D149's dots. `bar` and `dots`, the
 * scaffold's names for two of them, are "accepted and normalised" (B112):
 * the server does it on input, and one that still arrives here is read as
 * the build it names. Any other kind is refused. §4: the interaction IS the
 * mechanism, and a wrong one is a different task rather than a lesser version
 * of the right one.
 *
 * A NUMBER LINE IS HOPPED ALONG FROM ITS SCAFFOLD'S `start` (B111), "older
 * payloads default to 0" - its first position. A start that is not a whole
 * position, or leaves no room to hop, cannot be built and is refused rather
 * than moved.
 *
 * `rows` is the rendered row count (B100): one bar, as 17b draws, and an
 * array or counters of `rows` rows of `parts` places - "parts is the number
 * of columns in one row" (backend, 9 Oct).
 *
 * A PLACE-VALUE BUILD TAKES ITS COUNTS FROM THE SCAFFOLD. Building 123 is one
 * flat, two rods and three units, and one `tapCount` cannot say how many of
 * each. The place-value scaffold can: "marks are the piece counts for the
 * columns named by labels". So it builds only beside a place-value scaffold
 * this app draws, into those columns, and is done when each column holds its
 * own count - nothing here adds them up.
 *
 * `labels` name pieces, for a highlight to find (`pieceLabels`), and
 * `pieceIds` (B109) are their ids; no frame draws either on a build.
 */
function manipulativeFor(
  m: Manipulative | null | undefined,
  scaffold: CalcScaffold | undefined,
  wireScaffold: WireCalculationScaffold | null | undefined,
): CalculationSegment["manipulative"] {
  if (!m) return undefined;
  if (!Number.isInteger(m.parts) || m.parts < 1) return undefined;
  const rows = m.rows ?? 1;
  const pieceLabels = (m.labels ?? []).map((l) => l.trim());
  const kind = BUILD_ALIASES[m.kind] ?? m.kind;
  const ids = (pieces: number) => {
    const pieceIds = idsFor(m.pieceIds, pieces);
    return pieceIds ? { pieceIds } : {};
  };
  if (kind === "fraction_bar") {
    return rows === 1
      ? { kind: "fraction_bar", parts: m.parts, pieceLabels, ...ids(m.parts) }
      : undefined;
  }
  if (
    (kind === "array" || kind === "counters") &&
    Number.isInteger(rows) &&
    rows >= 1
  ) {
    return {
      kind,
      parts: m.parts,
      rows,
      pieceLabels,
      ...ids(rows * m.parts),
    };
  }
  if (kind === "number_line") {
    const start = lineStart(wireScaffold);
    if (rows !== 1 || start === undefined || start >= m.parts - 1) {
      return undefined;
    }
    return {
      kind: "number_line",
      parts: m.parts,
      start,
      pieceLabels,
      ...ids(m.parts),
    };
  }
  if (kind === "place_value" && scaffold?.kind === "place_value") {
    // A build with nothing to place could only be finished by doing nothing.
    if (!scaffold.places.some((p) => p.count > 0)) return undefined;
    return { kind: "place_value", columns: scaffold.places };
  }
  return undefined;
}

/** B112's normalised names: the scaffold's word for the build it names. */
const BUILD_ALIASES: Partial<Record<string, Manipulative["kind"]>> = {
  bar: "fraction_bar",
  dots: "counters",
};

/**
 * Where a number line's hops start (B111): its scaffold's `start`, as a
 * position - 0, its first, where the payload says none, as older payloads
 * default. Only a number-line scaffold carries one ("null for other scaffold
 * kinds"). Undefined for a start that names no position.
 */
function lineStart(
  scaffold: WireCalculationScaffold | null | undefined,
): number | undefined {
  if (scaffold?.kind !== "number_line" || scaffold.start == null) return 0;
  return countOf(scaffold.start);
}

/**
 * How many pieces a bar, an array or counters have places for, or how many
 * hops a line of `parts` positions has room for from its start. A
 * place-value build has no one number to hold: each column holds its own.
 */
function placesIn(
  m: NonNullable<CalculationSegment["manipulative"]>,
): number | undefined {
  if (m.kind === "array" || m.kind === "counters") return m.rows * m.parts;
  if (m.kind === "number_line") return m.parts - 1 - m.start;
  return m.kind === "fraction_bar" ? m.parts : undefined;
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
 * The drawing beside the notation, read by backend's definitions (B100, and
 * 9 Oct): "rows controls rendered rows; marks are overlays/values and do not
 * create rows. A bar may therefore have more marks than rows. label[i]
 * belongs to mark[i] when marks exist; otherwise it belongs to scaffold part
 * i." Each kind is drawn as its frame draws it, with the payload's values:
 *  - `bar`: `rows` bars of `parts` cells (17b). Where there are as many marks
 *    as bars, a mark fills its own bar from the start, its label at the
 *    bar's start, as 17b draws `1/4 + 2/4`. Where one bar carries several
 *    marks - SCRUM-177's own `3/5 + 1/5` as `rows: 1, marks: [3, 1]` - they
 *    fill it one after another, in renderer order, each label under its own
 *    cells. No marks: empty bars, a part's label under its cell;
 *  - `array`: `rows` rows of `parts` places - "parts is the number of columns
 *    in one row" - the marks filling them one after another in reading order
 *    (D149);
 *  - `place_value`: D149's three columns on one row, flats then rods then
 *    units - "marks are the piece counts for the columns named by labels".
 *    Ten to one each step is what the shapes say, so they hold for any three
 *    neighbouring places; which places is the labels' to say, and D149's
 *    "Hundreds", "Tens" and "Ones" are not drawn for a payload naming none;
 *  - `dots`: D149's `rows` rows of `parts` round places, filled as the
 *    array's are - D149 replaced 37c's groups of two, which read neither
 *    `rows` nor `parts`;
 *  - `number_line`: D149's line of `parts` positions - "cells or positions
 *    in one row" - a marker at each mark's position, its label beneath; or,
 *    with no marks, a part's label beneath its position.
 *
 * Those are the only readings made. Anything that does not fit is not drawn
 * rather than drawn some other way:
 *  - more labels than marks: a label with no mark of its own belongs nowhere;
 *  - several marks over several bars, but not one to a bar: which bar each
 *    belongs on is not said;
 *  - marks that do not fit: one bar or line holding more than `parts`, or
 *    an array more than its places - never clamped;
 *  - a mark that is not a whole number: drawing 2.5 cells is not a reading;
 *  - an array's or dots' marks with labels: no frame says where a label for
 *    a run that wraps a row would go;
 *  - place value with other than three marks, or on more than one row: D149
 *    draws three columns, and which three two marks would be is not said;
 *  - a line on more than one row, or a mark past its last position.
 */
function scaffoldFor(
  scaffold: WireCalculationScaffold | null | undefined,
): CalcScaffold | undefined {
  if (!scaffold) return undefined;
  const marks = scaffold.marks ?? [];
  const labels = (scaffold.labels ?? []).map((l) => l.trim());
  const rows = scaffold.rows ?? 1;
  const { kind, parts } = scaffold;
  if (!Number.isInteger(rows) || rows < 1) return undefined;
  if (marks.length > 0 && labels.length > marks.length) return undefined;

  const counts: number[] = [];
  for (const mark of marks) {
    const count = countOf(mark);
    if (count === undefined) return undefined;
    counts.push(count);
  }
  // B109: what a highlight names each mark and label by, where given.
  const markIds = idsFor(scaffold.markIds, marks.length);
  const labelIds = idsFor(scaffold.labelIds, labels.length);
  const quantities = counts.map((count, i) => ({
    count,
    ...(labels[i] ? { label: labels[i] } : {}),
    ...(markIds?.[i] ? { id: markIds[i] } : {}),
    ...(labelIds?.[i] ? { labelId: labelIds[i] } : {}),
  }));
  /** A part's label's id, where there are no marks and the labels are a part's. */
  const partIds = labelIds ? { partLabelIds: labelIds } : {};
  /** What the marks fill, one after another - a layout, not an answer. */
  const filled = counts.reduce((a, b) => a + b, 0);

  if (kind === "place_value") {
    return rows === 1 && marks.length === PLACE_VALUE_COLUMNS
      ? { kind, places: quantities }
      : undefined;
  }
  if (!Number.isInteger(parts) || parts < 1) return undefined;
  if (kind === "number_line") {
    if (rows !== 1) return undefined;
    if (marks.length === 0) {
      return labels.length <= parts
        ? { kind, parts, points: [], partLabels: labels, ...partIds }
        : undefined;
    }
    return counts.every((c) => c < parts)
      ? { kind, parts, points: quantities, partLabels: [] }
      : undefined;
  }
  if (kind !== "bar" && kind !== "array" && kind !== "dots") return undefined;
  if (marks.length === 0) {
    return labels.length <= parts
      ? { kind, parts, rows, quantities: [], partLabels: labels, ...partIds }
      : undefined;
  }
  if (kind === "array" || kind === "dots") {
    if (labels.length > 0) return undefined;
    return filled <= rows * parts
      ? { kind, parts, rows, quantities, partLabels: [] }
      : undefined;
  }
  if (counts.some((c) => c > parts)) return undefined;
  const fits = marks.length === rows || (rows === 1 && filled <= parts);
  return fits ? { kind, parts, rows, quantities, partLabels: [] } : undefined;
}

/** D149's place-value columns: a flat, a rod and a unit. */
const PLACE_VALUE_COLUMNS = 3;

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
  const interactive = interactiveFor(segment, lessonTitle);
  const verdict = calculationFor(segment);
  const calculation = verdict?.calculation;
  const modalities = modalitiesFor(segment, calculation);
  /*
   * WHAT THE CHILD CHOSE FOR THIS SECTION, from the sitting the read came
   * from (K4): read before the first frame, so a reload opens in it with no
   * visible change (rules 6 and 7). `deliveryPreference`, never
   * `primaryModality`, which reads as the first format where nothing was
   * chosen - see `LessonSegment.primaryModality`.
   */
  const chosen = chosenFrom(segment.deliveryPreference);
  const built: LessonSegment = {
    id: segment.id,
    modalities,
    // The activity is drawable, and offered, beside them - never opened in
    // with no pick (see the top). A calculation is the solver alone.
    ...formatsFor(
      segment,
      interactive && !calculation
        ? [...modalities, MODALITY.INTERACTIVE]
        : modalities,
    ),
    ...(chosen ? { chosen } : {}),
    text: textFor(segment, lessonTitle),
    // Omitted rather than null: the player's `hasContent` tests presence.
    ...(visual ? { visual } : {}),
    ...(audio ? { audio } : {}),
    ...(interactive ? { interactive } : {}),
    // Omitted rather than set undefined: the player tests `segment.quickCheck`
    // for presence, and an absent check must not gate progress.
    ...(quickCheck ? { quickCheck } : {}),
    // Both, because the player gates the solver on BOTH: the tag says a
    // calculation is here, the payload is what it draws.
    ...(calculation
      ? { calculationVariant: calculation.variant, calculation }
      : {}),
  };
  /*
   * OURS TO FALL BACK FROM ONLY WHERE THE SERVER OFFERED IT AS INTERACTIVE.
   * A calculation the server itself could not build arrives as text, and
   * audio where it made some, with no Interactive (Teslim, 19 Oct): that is
   * rendered as it is offered, above. One it checked and offered that our
   * stricter checks refuse is its source text, and is reported.
   */
  return verdict?.refused !== undefined && offersInteractive(segment)
    ? asSourceText(built, verdict.refused)
    : built;
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
