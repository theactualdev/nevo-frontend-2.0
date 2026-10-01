"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { Button, NevoKeyboard } from "@/components/shared";
import { CALC_MODALITY } from "@/lib/constants";
import type { CalculationSegment } from "@/lib/types";
import { isCardStep, isNumericStep, isTextStep } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Calculation Solver (17b — co-construction). The one component that teaches a
 * calculation across all three modalities: Interactive (the default co-construction
 * flow), Audio (a narration layer that never hides text), and Kinesthetic (a
 * tap-to-build manipulative for the final step). The system holds the equation
 * and a visual scaffold on screen throughout; the student supplies one thinking
 * step at a time; the answer assembles itself. This is the accessibility
 * requirement — never a generic "enter the answer" component (17b §2).
 *
 * v1 renders the `fraction_add_like` scaffold (fraction bars). Prompts, choices,
 * hints, confirm and completion copy are driven by the segment payload; the bar
 * scaffold + equation rendering are specific to this variant (17b §1, §7).
 *
 * No evaluative colour ever — never red/green, never a cross. A miss is a single
 * gentle shake and warmer framing. No score, percentage or progress counter.
 */
export function CalculationSolver({
  calculation,
  onSolved,
  onStepAnswered,
  onReplay,
  onPiecePlaced,
}: {
  calculation: CalculationSegment;
  /** Fired once the answer assembles - the player opens the forward chevron. */
  onSolved: () => void;
  /** Each confirmed step (comprehension_response signal). */
  onStepAnswered?: (correct: boolean) => void;
  /** Audio narration replay (replay signal). */
  onReplay?: () => void;
  /**
   * A kinesthetic tile placed onto the scaffold. The ingest contract has a
   * `manipulative_piece_placed` type for exactly this and nothing was ever
   * emitting it - on this layer the placement IS the child's working, and it
   * was the one layer producing no evidence at all.
   */
  onPiecePlaced?: (placed: number, needed: number) => void;
}) {
  const steps = calculation.steps;
  const lastIndex = steps.length - 1;

  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"ask" | "confirmed" | "done">("ask");
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  // Card steps: selecting is not answering (SCRUM-94.3). The student picks, can
  // change their mind, then commits - a changed selection before commit is
  // itself a hesitation signal worth having.
  const [chosen, setChosen] = useState<number | null>(null);
  const [numVal, setNumVal] = useState("");
  const [manip, setManip] = useState(false);
  const [placed, setPlaced] = useState(0);

  const done = phase === "done";

  /*
   * ── The drawn scaffold, when there is one ──────────────────────────────
   *
   * `fraction_add_like` is an authored variant and carries `{parts, rows}`, so
   * the bars and the fraction equation below are driven by it. Nothing on the
   * deployed contract carries that shape: a generated calculation gives a
   * `fullEquation`, a per-step `equationState` string, and at most a generated
   * `scaffoldImage`. So a real lesson renders the equation as the words the
   * backend wrote, and draws no bars, because there are none to draw and
   * inventing some would be drawing a picture of a child's problem that nobody
   * authored.
   */
  const scaffold = calculation.scaffold;
  const rows = scaffold?.rows ?? [];
  /*
   * ── What the tap-to-build layer is built from ──────────────────────────
   *
   * TWO SOURCES, and the authored one still wins where it exists. The demo's
   * `scaffold` carries `{parts, rows}` and drives the drawn bars AND the tray.
   * Generated content has no scaffold and, since 21 Sep, may carry a
   * `manipulative` instead - `{kind, parts, target}`, resolved in
   * `fromContent` from the wire's `kind, parts, rows`.
   *
   * They are kept apart rather than merged because the two `rows` mean
   * different things: the authored one is the numerators being added, the
   * wire's is a count of piece rows. The bars below stay scaffold-only - there
   * is still nothing authored to draw them from on generated content - while
   * the TRAY now works from either.
   */
  const manipulative = calculation.manipulative;
  const parts = scaffold?.parts ?? manipulative?.parts ?? 0;
  const sum = scaffold
    ? rows.reduce((a, b) => a + b, 0)
    : (manipulative?.target ?? 0);
  const last = steps[lastIndex];
  const numericAnswer = isNumericStep(last)
    ? last.answer
    : isTextStep(last)
      ? last.answer
      : scaffold
        ? String(sum)
        : (calculation.problem.answer ?? "");

  // Denominators highlighted while resolving them (step 0 confirmed) and step 1.
  const ring = (step === 0 && phase === "confirmed") || step === 1;
  // Numerators emphasised (navy) from step 1 onward.
  const strong = step >= 1 || done;

  const current = steps[step];
  const onCards = phase === "ask" && isCardStep(current);
  const typing = phase === "ask" && !isCardStep(current);
  /*
   * WHICH EQUATION THE CHILD SEES. Authored fraction content draws its own
   * bars and fractions; generated content has `equationStates`, one per step,
   * written by the backend to say how the equation reads at that moment. The
   * index walks with the child - and a confirmed step shows the state it just
   * produced, which is the whole point of showing it at all.
   */
  const equationLine = calculation.equationStates?.length
    ? (calculation.equationStates[
        Math.min(
          phase === "ask" ? step : step + 1,
          calculation.equationStates.length - 1,
        )
      ] ?? calculation.problem.expression)
    : null;
  const kinestheticAvailable = calculation.modalities.includes(
    CALC_MODALITY.KINESTHETIC,
  );
  const audioAvailable = calculation.modalities.includes(CALC_MODALITY.AUDIO);

  const finish = () => {
    setPhase("done");
    onSolved();
  };

  const goNext = () => {
    setStep((s) => s + 1);
    setPhase("ask");
    setAttempts(0);
    setShowHint(false);
    setChosen(null);
  };

  // SCRUM-94.3: every step ends on a tap the student chooses to make. The
  // 1500ms confirmation hold, the value-sniff numeric advance and the
  // third-tile hop are all gone - answer-submission latency now exists.
  const commitChoice = () => {
    if (phase !== "ask" || !isCardStep(current) || chosen == null) return;
    const correct = chosen === current.correct;
    onStepAnswered?.(correct);
    if (!correct) {
      setAttempts((a) => {
        const next = a + 1;
        if (next >= 2) setShowHint(true); // two misses auto-surface the hint
        return next;
      });
      return;
    }
    if (current.onCorrect?.confirm) {
      setPhase("confirmed"); // waits for the student's "Next step" tap
      setChosen(null);
    } else {
      goNext();
    }
  };

  /*
   * THIS STEP'S ANSWER, NOT THE LAST ONE'S.
   *
   * `numericAnswer` is the whole calculation's finish, and comparing every
   * typed step against it was safe only while exactly one step was ever typed.
   * Real content types more than one: the algebra lesson answers "3x - 4",
   * then "3x", then 5, and checking any of the first two against 5 fails a
   * child who is right. It is the same mistake as mapping the variant's answer
   * onto every step, one layer down.
   *
   * A typed step that carries no answer of its own cannot be marked at all -
   * `fromContent` refuses to build one - so the fallback here is only ever
   * reached by the authored fraction content, whose single typed step IS the
   * finish.
   */
  const expectedForCurrent = isNumericStep(current)
    ? current.answer
    : isTextStep(current)
      ? current.answer
      : numericAnswer;

  const commitNum = () => {
    // Trimmed on both sides and case-folded: "3X - 4" is the same answer as
    // "3x - 4", and a child who capitalised is not wrong about algebra.
    const correct =
      numVal.trim().toLowerCase() === String(expectedForCurrent).trim().toLowerCase();
    onStepAnswered?.(correct);
    if (!correct) {
      setAttempts((a) => a + 1);
      setShowHint(true);
      return;
    }
    // Only the LAST step finishes the calculation. A typed step in the middle
    // advances like any other, which is what a multi-step solve needs.
    if (step === lastIndex) finish();
    else {
      setNumVal("");
      goNext();
    }
  };

  const placeTile = () => {
    setPlaced((p) => {
      const next = Math.min(sum, p + 1);
      // Only a placement that actually moved the scaffold is a signal; tapping
      // a full scaffold is not a new piece.
      if (next !== p) onPiecePlaced?.(next, sum);
      return next;
    });
  };

  const commitManip = () => {
    if (placed >= sum) {
      onStepAnswered?.(true);
      finish();
    }
  };

  const hintText = "hint" in current ? current.hint : "";

  return (
    // Frame: the calc column is narrower than the reading column (560/600 vs
    // the player's 620/680).
    <div className="mx-auto sm:max-w-[560px] lg:max-w-[600px]">
      {audioAvailable && <NarrationBar onReplay={onReplay} />}

      {/* SCAFFOLD — persistent; highlights per step, fills as the answer assembles */}
      {/*
        DRAWN ONLY WHERE THERE IS ONE. `fraction_add_like` carries the parts
        and rows these bars are made of; the deployed contract carries no such
        field for anything else. A generated calculation therefore shows its
        equation and its steps and no picture, which is honest - the
        alternative was drawing bars from numbers that mean something else.
        `scaffoldImage` on the wire is a generated illustration and a separate
        question; it is not this.
      */}
      {scaffold && (
      <div className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          Picture it
        </span>
        <div className="mt-3.5 flex flex-col gap-3">
          <BarRow
            label={`${rows[0]}/${parts}`}
            parts={parts}
            filled={rows[0]}
            strong={strong}
            ring={ring}
          />
          <BarRow
            label={`${rows[1]}/${parts}`}
            parts={parts}
            filled={rows[1]}
            strong={strong}
            ring={ring}
          />
          {done && (
            <div className="flex items-center gap-3 border-t border-nevo-near-black/10 pt-3 motion-safe:animate-nevo-reveal">
              <span className="w-[34px] shrink-0 text-sm font-semibold text-nevo-navy sm:text-[15px]">
                {sum}/{parts}
              </span>
              <div className="flex flex-1 gap-[5px]">
                {Array.from({ length: parts }).map((_, i) => (
                  <span
                    key={i}
                    className="h-7 flex-1 rounded-[5px] bg-nevo-navy origin-left motion-safe:animate-nevo-fill sm:h-[34px] lg:h-[30px]"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* EQUATION — updates in place, assembles to the answer on completion */}
      <div className="mt-[18px] flex min-h-[52px] items-center justify-center">
        {equationLine ? (
          /*
           * GENERATED CONTENT WRITES ITS OWN EQUATION. `equationState` is a
           * string the backend composed for this moment of this calculation -
           * "3x - 4 = 11" - and it is the only honest thing to show for a
           * problem that is not two like fractions. The fraction rendering
           * below stays for the authored variant that has the parts to draw.
           */
          <div
            key={equationLine}
            className="text-center text-[26px] font-medium tracking-[-0.01em] text-nevo-navy sm:text-[34px] motion-safe:animate-nevo-reveal"
          >
            {equationLine}
          </div>
        ) : typing && !done ? (
          <div className="flex items-center gap-2.5 text-[30px] font-medium tracking-[-0.01em] text-nevo-navy sm:text-[40px] motion-safe:animate-nevo-reveal">
            <span>{rows[0]}</span>
            <span className="text-nevo-navy/70">+</span>
            <span>{rows[1]}</span>
            <span className="text-nevo-navy/70">=</span>
            <span className="text-nevo-navy/50">?</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <Fraction top={rows[0]} bottom={parts} />
            <span className="text-[30px] font-medium text-nevo-navy sm:text-[40px]">
              +
            </span>
            <Fraction top={rows[1]} bottom={parts} />
            <span className="text-[30px] font-medium text-nevo-navy sm:text-[40px]">
              =
            </span>
            {done ? (
              <span className="motion-safe:animate-nevo-pop">
                <Fraction top={sum} bottom={parts} bold />
              </span>
            ) : (
              <span className="flex size-11 items-center justify-center rounded-[10px] border-2 border-dashed border-nevo-navy/40 text-[30px] font-semibold text-nevo-navy/55 sm:size-[52px] sm:text-[40px]">
                ?
              </span>
            )}
          </div>
        )}
      </div>

      {/* RESPONSE — the one thing the student does, per step */}
      <div className="mt-5">
        {phase === "confirmed" && isCardStep(current) && (
          <div className="flex flex-col gap-3.5 motion-safe:animate-nevo-reveal">
            <div className="flex items-center justify-between rounded-[12px] border-2 border-nevo-navy bg-nevo-cream-elevated px-[18px] py-4 text-base font-semibold text-nevo-near-black shadow-elevation-1 sm:text-[18px]">
              <span>{current.choices[current.correct]}</span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                <Check
                  className="size-[13px] text-nevo-cream"
                  strokeWidth={2.8}
                />
              </span>
            </div>
            {current.onCorrect?.confirm && (
              <p className="text-center text-sm leading-[1.6] text-nevo-near-black/70 sm:text-[15px]">
                {current.onCorrect.confirm}
              </p>
            )}
            <Button className="w-full" onClick={goNext}>
              Next step
            </Button>
          </div>
        )}

        {done && (
          <p className="text-center text-sm leading-[1.6] text-nevo-near-black/70 motion-safe:animate-nevo-reveal sm:text-[15px]">
            {calculation.completion}
          </p>
        )}

        {onCards && (
          <>
            <p className="text-center text-[19px] font-semibold leading-[1.35] text-nevo-near-black sm:text-[22px]">
              {current.prompt}
            </p>
            {showHint && <HintPill text={hintText} />}
            <div
              key={`cards-${attempts}`}
              className={cn(
                "mt-4 flex flex-col gap-2.5 rounded-[12px]",
                // A wrong commit answers with a soft-violet ring pulse - the
                // "not that one" message with nothing moving under the finger
                // (SCRUM-94: the displacing shake is retired).
                attempts > 0 && "motion-safe:animate-nevo-nudge",
              )}
            >
              {current.choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setChosen(i)}
                  aria-pressed={chosen === i}
                  className={cn(
                    "cursor-pointer rounded-[12px] border-2 bg-nevo-cream-elevated px-[18px] py-4 text-center text-base font-medium text-nevo-near-black shadow-elevation-1 transition-[transform,border-color] active:scale-[0.98] sm:text-[18px]",
                    // Frame: selection = 2px border plus a further 2px ring.
                    chosen === i
                      ? "border-nevo-navy ring-2 ring-nevo-navy"
                      : "border-transparent",
                  )}
                >
                  {choice}
                </button>
              ))}
            </div>
            {chosen != null && (
              <Button className="mt-3.5 w-full" onClick={commitChoice}>
                Check my answer
              </Button>
            )}
            {!showHint && (
              <HintLink attempts={attempts} onClick={() => setShowHint(true)} />
            )}
          </>
        )}

        {typing && (
          <>
            <p className="text-center text-[19px] font-semibold leading-[1.35] text-nevo-near-black sm:text-[22px]">
              {manip
                ? "Build the total - tap a quarter to drop it in."
                : current.prompt}
            </p>
            {showHint && <HintPill text={hintText} />}

            {manip ? (
              <>
                <ManipulativeTray
                  parts={parts}
                  sum={sum}
                  placed={placed}
                  onPlace={placeTile}
                />
                {placed >= sum && (
                  <Button className="mt-[18px] w-full" onClick={commitManip}>
                    That&apos;s the total
                  </Button>
                )}
              </>
            ) : (
              <div
                key={`num-${attempts}`}
                className={cn(
                  "mt-[18px] flex justify-center rounded-[12px]",
                  attempts > 0 && "motion-safe:animate-nevo-nudge",
                )}
              >
                <input
                  // A.12 suppresses the native OS keyboard for a NUMBER,
                  // because the Nevo pad drives entry on touch. An EXPRESSION
                  // needs letters and an operator, which that pad does not
                  // have, so a text step takes the device's own keyboard
                  // rather than a field a child cannot type into.
                  inputMode={isTextStep(current) ? "text" : "none"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={numVal}
                  onChange={(e) => setNumVal(e.target.value)}
                  placeholder="-"
                  aria-label={current.prompt}
                  className={cn(
                    "h-[52px] rounded-[10px] border-2 border-nevo-near-black/18 bg-nevo-cream-elevated text-center font-semibold text-nevo-navy shadow-elevation-1 outline-none transition-colors focus:border-nevo-navy",
                    isTextStep(current)
                      ? "w-[220px] text-[22px]"
                      : "w-[120px] text-[26px]",
                  )}
                />
                {"unit" in current && current.unit ? (
                  // The wire gives a unit where it is what makes the step
                  // answerable - "naira", "years", "%". Beside the field, not
                  // inside it: a child types the number, not the noun.
                  <span className="ml-2.5 self-center text-[15px] text-nevo-near-black/60">
                    {current.unit}
                  </span>
                ) : null}
              </div>
            )}

            {!manip && numVal.trim().length > 0 && (
              <Button className="mt-[18px] w-full" onClick={commitNum}>
                Check my answer
              </Button>
            )}

            {/* The pad is for digits. A text step uses the device keyboard. */}
            {!manip && !isTextStep(current) && (
              <NevoKeyboard
                layout="pad"
                onKey={(d) => setNumVal(numVal + d)}
                onBackspace={() => setNumVal(numVal.slice(0, -1))}
                className="fixed inset-x-0 bottom-0 z-40"
              />
            )}

            {kinestheticAvailable && !manip && (
              <p className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setManip(true)}
                  className="cursor-pointer text-[13px] font-medium text-nevo-violet"
                >
                  Want to build it instead?
                </button>
              </p>
            )}
            {!showHint && !manip && (
              <HintLink attempts={attempts} onClick={() => setShowHint(true)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One scaffold bar: a fraction label + `parts` cells, `filled` of them shaded. */
function BarRow({
  label,
  parts,
  filled,
  strong,
  ring,
}: {
  label: string;
  parts: number;
  filled: number;
  strong: boolean;
  ring: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "w-[34px] shrink-0 text-sm transition-colors sm:text-[15px]",
          strong ? "font-semibold text-nevo-navy" : "text-nevo-near-black/60",
        )}
      >
        {label}
      </span>
      <div className="flex flex-1 gap-[5px]">
        {Array.from({ length: parts }).map((_, i) => {
          const on = i < filled;
          return (
            <span
              key={i}
              className={cn(
                // Frame cell heights per variant: 28 / 34 / 30.
                "h-7 flex-1 rounded-[5px] transition-[background-color,outline-color] duration-200 sm:h-[34px] lg:h-[30px]",
                on
                  ? strong
                    ? "bg-nevo-navy"
                    : "bg-nevo-violet"
                  : "border border-nevo-near-black/12 bg-nevo-near-black/[0.08]",
                ring &&
                  "outline outline-2 outline-nevo-violet outline-offset-2",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A stacked numerator/denominator fraction. */
function Fraction({
  top,
  bottom,
  bold,
}: {
  top: number;
  bottom: number;
  bold?: boolean;
}) {
  const weight = bold ? "font-bold" : "font-medium";
  return (
    <span className="flex flex-col items-center text-nevo-navy">
      <span className={cn("text-[30px] leading-none sm:text-[40px]", weight)}>
        {top}
      </span>
      <span className="my-[3px] h-0.5 w-[22px] bg-nevo-navy sm:w-7" />
      <span className={cn("text-[30px] leading-none sm:text-[40px]", weight)}>
        {bottom}
      </span>
    </span>
  );
}

/** The requested/auto-surfaced hint - a calm pill above the response. */
function HintPill({ text }: { text: string }) {
  return (
    <div className="mx-auto mt-4 flex w-max max-w-full items-center gap-2.5 rounded-full bg-nevo-cream-elevated px-[18px] py-2.5 shadow-elevation-1 motion-safe:animate-nevo-reveal">
      <span className="size-[7px] shrink-0 rounded-full bg-nevo-violet" />
      <span className="text-sm leading-[1.4] text-nevo-near-black">{text}</span>
    </div>
  );
}

/** "Need a hint?" - grows to medium weight once the student has missed. */
function HintLink({
  attempts,
  onClick,
}: {
  attempts: number;
  onClick: () => void;
}) {
  return (
    <p className="mt-4 text-center">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "cursor-pointer text-[13px] text-nevo-violet",
          attempts >= 1 ? "font-medium" : "font-normal",
        )}
      >
        Need a hint?
      </button>
    </p>
  );
}

/** Kinesthetic final step - tap quarter tiles into the total bar until it fills. */
function ManipulativeTray({
  parts,
  sum,
  placed,
  onPlace,
}: {
  parts: number;
  sum: number;
  placed: number;
  onPlace: () => void;
}) {
  const remaining = Math.max(0, sum - placed);
  return (
    <>
      <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div className="mt-3 flex gap-[5px]">
          {Array.from({ length: parts }).map((_, i) => {
            const on = i < placed;
            return (
              <span
                key={i}
                className={cn(
                  // Frame: barH + 6 per variant (34 / 40 / 36).
                  "h-[34px] flex-1 rounded-md transition-colors duration-200 sm:h-10 lg:h-9",
                  on
                    ? "bg-nevo-navy"
                    : "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]",
                )}
              />
            );
          })}
        </div>
      </div>
      {remaining > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          {Array.from({ length: remaining }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={onPlace}
              className="h-[52px] min-w-[72px] cursor-pointer rounded-[12px] border-2 border-nevo-violet bg-nevo-violet/14 text-base font-semibold text-nevo-navy shadow-elevation-1 transition-transform active:scale-[0.98]"
            >
              + {1}/{parts}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Audio narration layer - reads the current step aloud; the text always stays. */
function NarrationBar({ onReplay }: { onReplay?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const toggle = () => {
    if (playing) {
      if (timer.current) clearInterval(timer.current);
      setPlaying(false);
      return;
    }
    if (pct >= 100) onReplay?.();
    setPct((p) => (p >= 100 ? 0 : p));
    setPlaying(true);
    // TODO(audio): play the produced per-step narration asset (17b §9).
    timer.current = setInterval(() => {
      setPct((p) => {
        if (p + 2.2 >= 100) {
          if (timer.current) clearInterval(timer.current);
          setPlaying(false);
          return 0;
        }
        return p + 2.2;
      });
    }, 140);
  };

  const bars = [
    6, 10, 13, 8, 14, 10, 12, 7, 13, 9, 11, 14, 8, 12, 10, 7, 13, 9, 11, 8,
  ];
  const played = pct / 100;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-3 py-2.5 shadow-elevation-1">
      <button
        type="button"
        aria-label={playing ? "Pause narration" : "Play narration"}
        onClick={toggle}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform active:scale-[0.98]"
      >
        {playing ? (
          <Pause className="size-[18px]" fill="currentColor" strokeWidth={0} />
        ) : (
          <Play
            className="ml-0.5 size-[18px]"
            fill="currentColor"
            strokeWidth={0}
          />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-nevo-near-black">
            Read this step aloud
          </span>
          <span className="font-mono text-[10px] tracking-[0.04em] text-nevo-near-black/50 uppercase">
            · Text stays
          </span>
        </div>
        <div className="flex h-3.5 items-end gap-0.5">
          {bars.map((h, i) => (
            <span
              key={i}
              className="w-[3px] shrink-0 rounded-full bg-nevo-navy transition-opacity duration-[160ms]"
              style={{
                height: `${h}px`,
                opacity: (i + 1) / bars.length <= played ? 0.95 : 0.28,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
