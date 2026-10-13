"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { dotPairs, type AgeBand, type DotPair } from "@/lib/profiling/bands";
import type { BaselineCapture } from "@/lib/profiling/capture";
import { AvatarBubble, ProfilingShell } from "./ProfilingShell";
import { SettleBadge } from "./GridSpanModule";
import { TrialButton } from "./PatternFlankerModule";
import { useTrialRunner } from "./useTrialRunner";

/**
 * 3B per band: how long the arrays show before the mask, and how big the dots
 * and their box are. Every band used to see 16px dots in a 200px box for
 * 850ms.
 *
 *  - Dot and box size: `Nevo Dot Comparison Frame` `cfg()` - dots 22 / 16 /
 *    13 / 10px, box 220 for P1-3 and 200 for the rest. On a phone every box
 *    is 200 (`boxPx = L.mobile ? 200 : C.box`).
 *  - Display time: `09c Module 3` per-band notes - P1-3 "800ms display",
 *    P4-6 "600ms display", JSS "500ms", SS "600ms display (not shorter:
 *    ratio is already at threshold)". P4-6 and SS ran the playable
 *    prototype's 850 (11:240) until design settled 09c over it (D75, 6 Oct).
 */
const DOTS: Record<
  AgeBand,
  { revealMs: number; dot: string; px: number; box: string }
> = {
  p13: { revealMs: 800, dot: "size-[22px]", px: 22, box: "size-[200px] sm:size-[220px]" },
  p46: { revealMs: 600, dot: "size-4", px: 16, box: "size-[200px]" },
  jss: { revealMs: 500, dot: "size-[13px]", px: 13, box: "size-[200px]" },
  ss: { revealMs: 600, dot: "size-2.5", px: 10, box: "size-[200px]" },
};

/** 3A's True, False and Not sure (`Nevo Sentence Verify Frame`, `btnBase` and `bW`). */
const TF_BUTTON = "h-[52px] w-full sm:w-[168px]";

/**
 * The inside of the smallest box any band draws: 200px less its 2px border.
 * Positions are worked out here and placed as percentages, so P1-3's 220px
 * box from `sm` up only spreads them further apart.
 */
const BOX_INNER_PX = 196;
/** How far every dot stays from the box's edge (`Nevo Dot Comparison Frame` `dots()`, `pad`). */
const DOT_INSET_PX = 14;
/**
 * The closest two dot centres may sit, as a multiple of the dot's diameter:
 * half a dot of clear cream between any two.
 */
export const DOT_MIN_SPACING = 1.5;

/**
 * Where one array of a band's 3B trial puts its dots. The seed is fixed per
 * trial and side, so a re-render never moves a shown dot.
 */
export function dotPositions(
  band: AgeBand,
  trial: number,
  side: number,
  count: number,
): { x: number; y: number }[] {
  return scatterDots(count, 11 + trial * 3 + side * 29, (DOTS[band] ?? DOTS.p46).px);
}

/**
 * Where a 3B array's dots go, as percentages of the box: exactly `count` of
 * them, deterministic for a seed, no two closer than `DOT_MIN_SPACING`
 * diameters centre to centre.
 *
 * THE ARRAYS OVERLAPPED. Dots were dropped anywhere between 8% and 84% with no
 * spacing, so some landed on top of each other and a child saw fewer than
 * were recorded: SS's 12 read as 11 beside a 13 that read as 10, so the
 * larger side looked the smaller, and P1-3's 3 read as 2. The count recorded
 * against the answer was not the count on screen.
 *
 * Each dot is drawn at random and redrawn if it lands too close to one already
 * placed. Should that ever fail, the whole array goes onto a lattice instead,
 * which holds the spacing for every pair a band runs. Only WHERE the dots go
 * is decided here; how many is the pair's.
 *
 * `boxPx` is the inside of the smallest box the arrays are drawn in. The
 * daily warm-up's boxes are smaller than this module's on a phone, so it
 * passes its own (D197).
 */
export function scatterDots(
  count: number,
  seed: number,
  dotPx: number,
  boxPx: number = BOX_INNER_PX,
): { x: number; y: number }[] {
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const lo = DOT_INSET_PX;
  const span = boxPx - 2 * DOT_INSET_PX - dotPx;
  const min = dotPx * DOT_MIN_SPACING;
  const pct = (p: { x: number; y: number }) => ({
    x: (p.x / boxPx) * 100,
    y: (p.y / boxPx) * 100,
  });

  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let spot: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 400 && !spot; attempt++) {
      const p = { x: lo + rng() * span, y: lo + rng() * span };
      if (placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= min)) spot = p;
    }
    if (!spot) return latticeDots(count, rng, lo, span).map(pct);
    placed.push(spot);
  }
  return placed.map(pct);
}

/** The fallback: `count` distinct points of an even lattice, chosen by the seed. */
function latticeDots(
  count: number,
  rng: () => number,
  lo: number,
  span: number,
): { x: number; y: number }[] {
  const side = Math.max(1, Math.ceil(Math.sqrt(count)));
  const step = side > 1 ? span / (side - 1) : 0;
  const cells = Array.from({ length: side * side }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count).map((c) => ({
    x: lo + (c % side) * step,
    y: lo + Math.floor(c / side) * step,
  }));
}

/**
 * Module 3 - Reading + Dot Comparison (BP-M3: reading and numerical fluency).
 * 3A adapts by band: P1-3 hears a sentence and taps the matching picture (no
 * reading required); P4-6/JSS mark localized sentences True/False with a
 * lighter "Not sure" always available; SS reads a passage and answers a
 * comprehension question. 3B flashes two dot arrays for the band's display
 * time, masks them, and asks which had more. Content is real and West-African
 * localized. No timers, no scores, never "wrong".
 */

/**
 * 3A sentences, each with the truth a child is being marked against.
 *
 * These were bare strings. A human reading them knows Lagos is not the capital
 * and the naira is not Ghana's - but nothing in the code did, so the module
 * recorded only how fast a child tapped. A child who taps True three times in
 * 800ms produced a better-looking reading vector than one who read carefully
 * and got all three right. For a READING FLUENCY measure that is not a gap in
 * the data, it is the data pointing the wrong way.
 */
const SENTENCES: Record<string, { text: string; isTrue: boolean }[]> = {
  p46: [
    { text: "Garri is made from cassava.", isTrue: true },
    { text: "Lagos is the capital of Nigeria.", isTrue: false },
    { text: "The danfo bus runs from Oshodi to CMS.", isTrue: true },
  ],
  jss: [
    {
      text: "If you travel from Lagos to Abuja by road, you pass through at least three states.",
      isTrue: true,
    },
    { text: "The naira is the currency of Ghana.", isTrue: false },
    {
      text: "Harmattan winds blow from the Sahara between November and March.",
      isTrue: true,
    },
  ],
};

const PASSAGE =
  "Every morning, Ada sets up her stall at Balogun Market before sunrise. She sells folded Ankara wrappers, and by mid-morning the narrow lane is crowded with traders calling out prices. Ada keeps a small notebook where she records each sale, because she is saving to pay her younger brother's school fees. On market days she rarely sits down before noon.";
const PASSAGE_QUESTION = "Why does Ada keep a notebook?";
const PASSAGE_OPTIONS = [
  "To remember her customers' names",
  "To track her savings for school fees",
  "To write down the market prices",
  "To record the day's weather",
];
/** The passage says she records each sale because she is saving for the fees. */
const PASSAGE_ANSWER = 1;

/** One round of 3A, for the daily warm-up. */
export type WarmUpReading =
  | { mode: "sentence"; text: string; isTrue: boolean }
  | {
      mode: "passage";
      passage: string;
      question: string;
      options: string[];
      answer: string;
    }
  | { mode: "audio"; sentence: string; answer: string };

/**
 * The daily warm-up's reading round for a band: this module's own first item
 * for that band, stripped to one round (D17, 1 Oct - the warm-up "reuses the
 * profiling activity, stripped to a single round").
 *
 * P1-3 HEARS ITS SENTENCE, AS IN THE BASELINE (D81, 6 Oct). This returned
 * nothing for P1-3, and the warm-up showed that band a written sentence to
 * read - "a defect against the architecture", which defines the band as
 * audio-led with no reading, and a warm-up that measures a different
 * construct from the baseline cannot recalibrate it.
 */
export function warmUpReading(band: AgeBand): WarmUpReading {
  if (band === "ss") {
    return {
      mode: "passage",
      passage: PASSAGE,
      question: PASSAGE_QUESTION,
      options: PASSAGE_OPTIONS,
      answer: PASSAGE_OPTIONS[PASSAGE_ANSWER],
    };
  }
  if (band === "p13") return { mode: "audio", ...AUDIO_TRIALS[0] };
  return { mode: "sentence", ...(SENTENCES[band] ?? SENTENCES.p46)[0] };
}

/**
 * The daily warm-up's dot round for a band: this module's first dot trial,
 * shown for the band's own display time in the band's own dot size (D81, 6
 * Oct). The warm-up ran one 9:6 pair for every child for 850ms - the
 * playable prototype's display time - in 16px dots.
 */
export function warmUpDots(band: AgeBand): {
  pair: DotPair;
  revealMs: number;
  dot: string;
  /** The dot's diameter, which its spacing is measured in (D197). */
  px: number;
} {
  const { revealMs, dot, px } = DOTS[band] ?? DOTS.p46;
  return { pair: dotPairs(band)[0], revealMs, dot, px };
}

/**
 * P1-3 audio mode: the sentence is heard, the answer is a picture.
 *
 * THERE WAS NO SENTENCE. The play control carried no `onClick` and no asset,
 * and no mapping from anything spoken to any of these pictures existed - so a
 * six-year-old was told "Listen, then tap the matching picture", pressed a
 * button that did nothing, and guessed between three drawings. Twice. That
 * guess was then recorded as the youngest band's entire reading measure.
 *
 * `speechSynthesis` is in every browser this ships to and needs neither an
 * asset nor the backend, so the child now actually hears it. Where it is
 * genuinely absent the activity is SKIPPED rather than mimed - see `canHear`.
 */
const AUDIO_PICS: { key: string; label: string; svg: string }[] = [
  {
    key: "bus",
    label: "A bus",
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="11" rx="2"/><path d="M3 11h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M6 8h4"/></svg>',
  },
  {
    key: "market",
    label: "A market bag",
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1.5 11H5.5z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>',
  },
  {
    key: "house",
    label: "A house",
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/></svg>',
  },
];

/** What is spoken, and which picture answers it. */
const AUDIO_TRIALS: { sentence: string; answer: string }[] = [
  { sentence: "The bus is full of people.", answer: "bus" },
  { sentence: "Mummy is going to the market.", answer: "market" },
];

/** The utterance a child is meant to be hearing; any other one is stale. */
let speaking: SpeechSynthesisUtterance | null = null;

/**
 * Say a sentence aloud, cancelling anything still speaking, and report when it
 * has been said in full.
 *
 * A shade under the default rate: the default is pitched at an adult skimming
 * a notification, not a six-year-old being asked to hold a sentence in mind.
 *
 * `onEnd` is what lets the response time start at the end of the sentence
 * rather than the start of the trial (see `useTrialRunner`). Some browsers
 * fire the CANCELLED utterance's `end` too, so the new one claims the slot
 * first and a stale `end` is ignored rather than opening the wrong trial.
 *
 * NOTE: no voice is chosen, so what the child hears is whichever voice the
 * device has. Which voice (or a recorded asset per sentence) is with design.
 *
 * Shared with the daily warm-up's heard round (D81), so both say it alike.
 */
export function speak(sentence: string, onEnd?: () => void): void {
  if (!hasSpeech()) return;
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.rate = 0.85;
  utterance.onend = () => {
    if (speaking === utterance) onEnd?.();
  };
  speaking = utterance;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/**
 * Stop mid-sentence. Guarded like `speak`, because an unmount can run after the
 * capability has gone - and a component tearing down is the worst possible
 * moment to throw, since nothing downstream is left to catch it.
 */
export function stopSpeaking(): void {
  if (!hasSpeech()) return;
  speaking = null;
  window.speechSynthesis.cancel();
}

/** The frame's shrug mark for "I don't know" (`Nevo Sentence Verify Frame`). */
const SHRUG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4 1.8c0 1.6-2 2-2 3.1"/><circle cx="11.5" cy="16.8" r="0.6" fill="currentColor"/></svg>';

export function hasSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * The heard activity's controls: the play button, the three pictures, and the
 * frame's "I don't know". Shared by this module and the daily warm-up's P1-3
 * reading round (D81), so a child meets the same activity in both.
 *
 * `onPick` gets the control's index (the pictures, then "I don't know" after
 * them) and what the pick means: right or not against the heard sentence's
 * `answer`, or declined.
 */
export function HeardPictures({
  answer,
  picked,
  onReplay,
  onPick,
}: {
  /** The key of the picture that matches the sentence being heard. */
  answer: string;
  /** The index already picked, or -1. */
  picked: number;
  onReplay: () => void;
  onPick: (
    index: number,
    detail: { correct: boolean } | { notSure: true },
    e: React.MouseEvent,
  ) => void;
}) {
  return (
    <div className="flex w-full max-w-[560px] flex-col items-center gap-8">
      <button
        type="button"
        aria-label="Play the sentence again"
        onClick={onReplay}
        className="flex size-[64px] cursor-pointer items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform active:scale-[0.96]"
      >
        <Play className="ml-1 size-6" fill="currentColor" strokeWidth={0} />
      </button>
      {/* From `sm` up each picture is a 160px square, or the square of a
          third of the row where that is narrower (the warm-up's column is
          440px on a tablet and 480px on a desktop, three 160s and their gaps
          512). */}
      <div className="flex w-full flex-col items-center gap-3.5 sm:flex-row sm:justify-center sm:gap-4">
        {AUDIO_PICS.map((p, i) => (
          <button
            key={p.key}
            type="button"
            aria-label={p.label}
            onClick={(e) => onPick(i, { correct: p.key === answer }, e)}
            className={cn(
              "flex h-[120px] w-full cursor-pointer items-center justify-center rounded-[12px] bg-nevo-cream transition-transform active:scale-[0.97] sm:aspect-square sm:h-auto sm:w-[160px] sm:min-w-0",
              picked === i
                ? "border-[3px] border-nevo-navy"
                : "border-2 border-nevo-navy",
            )}
          >
            <div
              className="size-[76px] text-nevo-navy sm:size-[96px]"
              dangerouslySetInnerHTML={{ __html: p.svg }}
            />
          </button>
        ))}
      </div>
      {/*
        The listening task's honest non-answer, which it did not have:
        a child who missed the sentence had to guess between pictures,
        and the guess was filed as their reading measure. The sentence
        and passage tasks always offered "Not sure"; this is the
        frame's own control for the audio form, words and mark
        (`Nevo Sentence Verify Frame` :45, `idkStyle`). Recorded the
        same way - declined, never wrong.
      */}
      <button
        type="button"
        onClick={(e) => onPick(AUDIO_PICS.length, { notSure: true }, e)}
        className={cn(
          "flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-2 border-nevo-violet text-sm font-medium transition-transform active:scale-[0.97] sm:w-[220px]",
          picked === AUDIO_PICS.length
            ? "bg-nevo-violet text-nevo-near-black"
            : "bg-nevo-cream text-nevo-violet",
        )}
      >
        <span
          aria-hidden
          className="size-[22px] shrink-0"
          dangerouslySetInnerHTML={{ __html: SHRUG }}
        />
        I don&apos;t know
      </button>
    </div>
  );
}

export function SentenceDotModule({
  band,
  capture,
  onComplete,
}: {
  band: AgeBand;
  capture?: BaselineCapture;
  onComplete: () => void;
}) {
  const mode =
    band === "p13" ? "audio" : band === "ss" ? "passage" : "sentence";
  /*
   * Settled once, at mount, so the run cannot change shape underneath a child.
   * A browser with no speech cannot present the audio activity honestly, and
   * miming it produced three-way guesses filed as a reading measure - so the
   * activity is dropped and the module runs its dot half alone. Nothing is
   * recorded for reading, so no reading trial is sent: "not measured", never
   * a zero.
   */
  const [canHear] = useState(() => mode !== "audio" || hasSpeech());
  const sentences = SENTENCES[band] ?? SENTENCES.p46;
  const readingCount =
    mode === "sentence"
      ? sentences.length
      : mode === "audio"
        ? canHear
          ? AUDIO_TRIALS.length
          : 0
        : 1;
  // The frame's pair, then two derived from the band's ratio (D76).
  const pairs = dotPairs(band);
  const dots = DOTS[band] ?? DOTS.p46;

  const { act, trial, picked, settling, pick, open } = useTrialRunner({
    module: "sentence_dot",
    counts: (
      [
        ["reading", readingCount],
        ["dots", pairs.length],
      ] as [string, number][]
    ).filter(([, n]) => n > 0),
    capture,
    onComplete,
    // The dots can be answered once masked; the heard sentence once said.
    opensLate: mode === "audio" ? ["reading", "dots"] : ["dots"],
  });

  // 3B reveal/mask cycle, restarted per dot trial (both edges on cancellable
  // timers - no synchronous setState in the effect body). The mask is also the
  // moment the buttons arm, so it is when the response time starts.
  const [masked, setMasked] = useState(false);
  useEffect(() => {
    if (act !== "dots") return;
    const t0 = setTimeout(() => setMasked(false), 0);
    const t1 = setTimeout(() => {
      setMasked(true);
      open();
    }, dots.revealMs);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [act, trial, dots.revealMs, open]);

  /*
   * WHICH SIDE HOLDS MORE, drawn once per run.
   *
   * Every pair listed its larger count first and the arrays were drawn in
   * that order, in every band - so the answer was ALWAYS the first button,
   * and a child who tapped Left every time scored full marks on a measure of
   * number sense. The flanker already varies its target; this was missed.
   * Drawn in the initializer so a re-render never moves a shown array.
   */
  const [largerOnRight] = useState(() =>
    pairs.map(() => Math.random() < 0.5),
  );

  const sentence = sentences[Math.min(trial, sentences.length - 1)];
  const heard = AUDIO_TRIALS[Math.min(trial, AUDIO_TRIALS.length - 1)];
  const pair = pairs[Math.min(trial, pairs.length - 1)];
  const flipped = largerOnRight[Math.min(trial, largerOnRight.length - 1)];
  const [left, right] = flipped ? [pair.b, pair.a] : [pair.a, pair.b];
  /** How hard the comparison is - the engine's reason for the band's pairs. */
  const ratio =
    Math.round((Math.max(pair.a, pair.b) / Math.min(pair.a, pair.b)) * 100) /
    100;

  // Say it on arrival - a six-year-old should not have to find the button to be
  // given the question. The button is there to hear it again.
  useEffect(() => {
    if (act !== "reading" || mode !== "audio" || !canHear) return;
    speak(heard.sentence, open);
    return stopSpeaking;
  }, [act, mode, canHear, heard.sentence, open]);

  /*
   * THE ARRAYS STACK ON A PHONE, so the question names top and bottom there,
   * as the buttons already did. It asked which SIDE had more above buttons
   * reading Top and Bottom. Words from `Nevo Dot Comparison Frame`'s `prompt`,
   * with its em dash as a colon (the design system allows none).
   *
   * NO BUBBLE OVER ANY OF 3A. "Listen, then tap the matching picture" and
   * "Read it, then answer" sat there, and no frame has either: `Nevo Sentence
   * Verify Frame` draws 3A with no avatar row at all. Nor over the sentence
   * (D198, 13 Oct): "Is this true or false?" was the playable prototype's
   * (11:324), and Lydia dropped it because no frame draws it.
   */
  const bubble = settling
    ? ""
    : act === "dots"
      ? masked
        ? "Which had more dots?"
        : "Watch the dots"
      : "";
  const phoneBubble =
    act === "dots" && masked ? "Which had more dots: top or bottom?" : undefined;

  return (
    <ProfilingShell filled={settling ? 3 : 2} active={settling ? -1 : 2}>
      {!settling && bubble && (
        <AvatarBubble text={bubble} phoneText={phoneBubble} />
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 sm:gap-10">
        {settling ? (
          <SettleBadge />
        ) : act === "reading" ? (
          mode === "audio" ? (
            <HeardPictures
              answer={heard.answer}
              picked={picked}
              onReplay={() => {
                capture?.record("replay", { module: "sentence_dot", trial });
                speak(heard.sentence, open);
              }}
              onPick={(i, detail, e) => pick(i, { mode, ...detail }, e)}
            />
          ) : mode === "passage" ? (
            <div className="flex w-full max-w-[600px] flex-col gap-4">
              <div className="rounded-[12px] border-2 border-nevo-navy bg-nevo-cream px-[18px] py-4 text-[15px] leading-[1.6] text-pretty text-nevo-near-black">
                {PASSAGE}
              </div>
              <p className="text-[15px] font-medium text-nevo-navy">
                {PASSAGE_QUESTION}
              </p>
              <div className="flex flex-col gap-2.5">
                {PASSAGE_OPTIONS.map((o, i) => (
                  <button
                    key={o}
                    type="button"
                    onClick={(e) =>
                      pick(i, { mode, correct: i === PASSAGE_ANSWER }, e)
                    }
                    className={cn(
                      "flex min-h-12 w-full cursor-pointer items-center rounded-[10px] border-2 px-4 py-3.5 text-left text-[15px] leading-[1.4]",
                      picked === i
                        ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                        : "border-nevo-navy bg-nevo-cream text-nevo-near-black",
                    )}
                  >
                    {o}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) =>
                    pick(PASSAGE_OPTIONS.length, { mode, notSure: true }, e)
                  }
                  className="flex min-h-12 w-full cursor-pointer items-center rounded-[10px] border-2 border-nevo-violet bg-nevo-cream px-4 py-3.5 text-left text-sm font-medium text-nevo-violet"
                >
                  Not sure
                </button>
              </div>
            </div>
          ) : (
            <div className="flex w-full max-w-[560px] flex-col items-center gap-7">
              <div
                key={trial}
                className="w-full rounded-[12px] border-2 border-nevo-navy bg-nevo-cream px-5 py-[22px] text-center text-[17px] leading-[1.5] text-pretty text-nevo-near-black"
              >
                {sentence.text}
              </div>
              {/*
                The frame's True / False / Not sure (`btnBase`, `bW`): 52px tall,
                full width on a phone and 168px from tablet up. They were
                the module's 180x56 default.
              */}
              <div className="flex w-full flex-col items-center gap-3.5 sm:w-auto sm:flex-row">
                <TrialButton
                  label="True"
                  className={TF_BUTTON}
                  pressed={picked === 0}
                  onClick={(e) =>
                    pick(0, { mode, correct: sentence.isTrue === true }, e)
                  }
                />
                <TrialButton
                  label="False"
                  className={TF_BUTTON}
                  pressed={picked === 1}
                  onClick={(e) =>
                    pick(1, { mode, correct: sentence.isTrue === false }, e)
                  }
                />
                <TrialButton
                  label="Not sure"
                  className={TF_BUTTON}
                  soft
                  pressed={picked === 2}
                  onClick={(e) => pick(2, { mode, notSure: true }, e)}
                />
              </div>
            </div>
          )
        ) : (
          <>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
              {[left, right].map((count, side) => (
                <div
                  key={`${trial}-${side}`}
                  className={cn(
                    "relative overflow-hidden rounded-[12px] border-2 border-nevo-navy bg-nevo-cream",
                    dots.box,
                  )}
                >
                  {dotPositions(band, trial, side, count).map((d, i) => (
                    <span
                      key={i}
                      className={cn(
                        "absolute rounded-full bg-nevo-violet",
                        dots.dot,
                      )}
                      style={{ left: `${d.x}%`, top: `${d.y}%` }}
                    />
                  ))}
                  {masked && (
                    <div className="absolute inset-0 bg-nevo-cream-elevated" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
              <DotButton
                label="Top"
                wide={left}
                onClick={(e) =>
                  masked &&
                  pick(
                    0,
                    { a: left, b: right, ratio, correct: left > right },
                    e,
                  )
                }
                pressed={picked === 0}
                armed={masked}
                sideLabel="Left"
              />
              <DotButton
                label="Bottom"
                wide={right}
                onClick={(e) =>
                  masked &&
                  pick(
                    1,
                    { a: left, b: right, ratio, correct: right > left },
                    e,
                  )
                }
                pressed={picked === 1}
                armed={masked}
                sideLabel="Right"
              />
            </div>
          </>
        )}
      </div>
    </ProfilingShell>
  );
}

/**
 * 3B answer button: disabled-looking until the mask lands, per the frame.
 * The frame's `btnBase` and `bW`: the full width at 56px and 16px on a phone,
 * 200x64 at 18px from tablet up. It was 170x56 there, and 300 wide at 18px on
 * a phone.
 *
 * NO COLOUR TRANSITION, here or on any trial button: the frames move only
 * their scale (`.dc-tap`), and a button that eased its colour carried the
 * last answer's violet into the next trial, fading as the child looked.
 */
function DotButton({
  sideLabel,
  label,
  onClick,
  pressed,
  armed,
}: {
  label: string;
  sideLabel: string;
  wide: number;
  onClick: (e: React.MouseEvent) => void;
  pressed: boolean;
  armed: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-[10px] border-2 text-base font-semibold sm:h-16 sm:w-[200px] sm:text-lg",
        pressed
          ? "border-nevo-violet bg-nevo-violet text-nevo-near-black"
          : armed
            ? "cursor-pointer border-nevo-navy bg-nevo-cream text-nevo-navy"
            : "cursor-default border-nevo-navy/30 bg-nevo-cream text-nevo-navy/40",
        // The frame's `.dc-tap` press, once the button is live: a button
        // that still reads as disabled does not answer a press.
        armed && "transition-transform active:scale-[0.98]",
      )}
    >
      <span className="sm:hidden">{label}</span>
      <span className="hidden sm:inline">{sideLabel}</span>
    </button>
  );
}
