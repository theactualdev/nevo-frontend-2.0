"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgeBand } from "@/lib/profiling/bands";
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
 *  - Display time: `09c Module 3` per-band notes - P1-3 "800ms display", JSS
 *    "500ms". ASK for the other two: for P4-6 09c says 600ms and the playable
 *    prototype (11:240) shows 850; for SS 09c states none. Both keep the
 *    850ms already shipped until design says which.
 */
const DOTS: Record<AgeBand, { revealMs: number; dot: string; box: string }> = {
  p13: { revealMs: 800, dot: "size-[22px]", box: "size-[200px] sm:size-[220px]" },
  p46: { revealMs: 850, dot: "size-4", box: "size-[200px]" },
  jss: { revealMs: 500, dot: "size-[13px]", box: "size-[200px]" },
  ss: { revealMs: 850, dot: "size-2.5", box: "size-[200px]" },
};

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
    };

/**
 * The daily warm-up's reading round for a band: this module's own first item
 * for that band, stripped to one round (D17, 1 Oct - the warm-up "reuses the
 * profiling activity, stripped to a single round").
 *
 * Null for P1-3, whose reading is heard rather than read; a heard round is
 * not built into the warm-up, which keeps its frame's one sentence there.
 */
export function warmUpReading(band: AgeBand): WarmUpReading | null {
  if (band === "ss") {
    return {
      mode: "passage",
      passage: PASSAGE,
      question: PASSAGE_QUESTION,
      options: PASSAGE_OPTIONS,
      answer: PASSAGE_OPTIONS[PASSAGE_ANSWER],
    };
  }
  const first = SENTENCES[band]?.[0];
  return first ? { mode: "sentence", ...first } : null;
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
 */
function speak(sentence: string, onEnd?: () => void): void {
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
function stopSpeaking(): void {
  if (!hasSpeech()) return;
  speaking = null;
  window.speechSynthesis.cancel();
}

/** The frame's shrug mark for "I don't know" (`Nevo Sentence Verify Frame`). */
const SHRUG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4 1.8c0 1.6-2 2-2 3.1"/><circle cx="11.5" cy="16.8" r="0.6" fill="currentColor"/></svg>';

function hasSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Dot pairs per trial (left/right counts converge by band difficulty).
 *
 * ASK, NOT SETTLED BY ANY FRAME. Design states one exemplar pair per band
 * (`Nevo Dot Comparison Frame` `cfg()`: 8:4, 9:5, 12:8, 13:12 - each band's
 * first pair below) and one ratio per band (`09c`: 2:1, 1.8:1, 1.5:1,
 * 1.1:1). Trials two and three are not drawn anywhere except for P4-6, whose
 * prototype pairs (11:178) are 8:6 and 10:7 - harder than its own frame's
 * 1.8:1, as are JSS's 11:9 and 13:10 against 1.5:1. They are left as shipped
 * rather than replaced with pairs nobody has designed either.
 */
const DOT_PAIRS: Record<AgeBand, { a: number; b: number }[]> = {
  p13: [
    { a: 8, b: 4 },
    { a: 7, b: 3 },
    { a: 9, b: 5 },
  ],
  p46: [
    { a: 9, b: 5 },
    { a: 8, b: 6 },
    { a: 10, b: 7 },
  ],
  jss: [
    { a: 12, b: 8 },
    { a: 11, b: 9 },
    { a: 13, b: 10 },
  ],
  ss: [
    { a: 13, b: 12 },
    { a: 12, b: 11 },
    { a: 14, b: 13 },
  ],
};

/** Deterministic scatter so re-renders never reshuffle a shown array. */
function scatter(count: number, seed: number): { x: number; y: number }[] {
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: 8 + rng() * 76,
    y: 8 + rng() * 76,
  }));
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
  const dotPairs = DOT_PAIRS[band] ?? DOT_PAIRS.p46;
  const dots = DOTS[band] ?? DOTS.p46;

  const { act, trial, picked, settling, pick, open } = useTrialRunner({
    module: "sentence_dot",
    counts: (
      [
        ["reading", readingCount],
        ["dots", dotPairs.length],
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
    dotPairs.map(() => Math.random() < 0.5),
  );

  const sentence = sentences[Math.min(trial, sentences.length - 1)];
  const heard = AUDIO_TRIALS[Math.min(trial, AUDIO_TRIALS.length - 1)];
  const pair = dotPairs[Math.min(trial, dotPairs.length - 1)];
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
   */
  const bubble = settling
    ? ""
    : act === "dots"
      ? masked
        ? "Which had more dots?"
        : "Watch the dots"
      : mode === "audio"
        ? "Listen, then tap the matching picture"
        : mode === "passage"
          ? "Read it, then answer"
          : "Is this true or false?";
  const phoneBubble =
    act === "dots" && masked ? "Which had more dots: top or bottom?" : undefined;

  return (
    <ProfilingShell filled={settling ? 3 : 2} active={settling ? -1 : 2}>
      {!settling && bubble && (
        <AvatarBubble text={bubble} phoneText={phoneBubble} />
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-7">
        {settling ? (
          <SettleBadge />
        ) : act === "reading" ? (
          mode === "audio" ? (
            <div className="flex w-full max-w-[560px] flex-col items-center gap-8">
              <button
                type="button"
                aria-label="Play the sentence again"
                onClick={() => {
                  capture?.record("replay", { module: "sentence_dot", trial });
                  speak(heard.sentence, open);
                }}
                className="flex size-[64px] cursor-pointer items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform active:scale-[0.96]"
              >
                <Play
                  className="ml-1 size-6"
                  fill="currentColor"
                  strokeWidth={0}
                />
              </button>
              <div className="flex w-full flex-col items-center gap-3.5 sm:flex-row sm:justify-center sm:gap-4">
                {AUDIO_PICS.map((p, i) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-label={p.label}
                    onClick={(e) =>
                      pick(i, { mode, correct: p.key === heard.answer }, e)
                    }
                    className={cn(
                      "flex h-[120px] w-full cursor-pointer items-center justify-center rounded-[12px] bg-nevo-cream transition-transform active:scale-[0.97] sm:size-[160px]",
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
                onClick={(e) =>
                  pick(AUDIO_PICS.length, { mode, notSure: true }, e)
                }
                className={cn(
                  "flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-2 border-nevo-violet text-sm font-medium transition-[background-color,transform] active:scale-[0.97] sm:w-[220px]",
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
              <div className="flex w-full flex-col items-center gap-3.5 sm:w-auto sm:flex-row">
                <TrialButton
                  label="True"
                  pressed={picked === 0}
                  onClick={(e) =>
                    pick(0, { mode, correct: sentence.isTrue === true }, e)
                  }
                />
                <TrialButton
                  label="False"
                  pressed={picked === 1}
                  onClick={(e) =>
                    pick(1, { mode, correct: sentence.isTrue === false }, e)
                  }
                />
                <TrialButton
                  label="Not sure"
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
                  {scatter(count, 11 + trial * 3 + side * 29).map((d, i) => (
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
            <div className="flex w-full max-w-[300px] flex-col gap-4 sm:w-auto sm:max-w-none sm:flex-row">
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

/** 3B answer button: disabled-looking until the mask lands, per the frame. */
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
        "flex h-14 min-w-[170px] items-center justify-center rounded-[10px] border-2 text-lg font-semibold transition-[background-color,border-color]",
        pressed
          ? "border-nevo-violet bg-nevo-violet text-nevo-near-black"
          : armed
            ? "cursor-pointer border-nevo-navy bg-nevo-cream text-nevo-navy"
            : "cursor-default border-nevo-navy/30 bg-nevo-cream text-nevo-navy/40",
      )}
    >
      <span className="sm:hidden">{label}</span>
      <span className="hidden sm:inline">{sideLabel}</span>
    </button>
  );
}
