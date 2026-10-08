"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { Button } from "@/components/shared";
import type {
  CalcNarration,
  CalcNumberStep,
  CalcScaffold,
  CalculationSegment,
  ScaffoldQuantity,
} from "@/lib/types";
import { isStoredAnswer } from "@/lib/lessons/storedAnswer";
import { cn } from "@/lib/utils";
import { READING_BODY, READING_HEADING, READING_INK } from "./readingSupport";
import { useMediaSource, type MediaFailReason } from "./useMediaSource";

/**
 * Calculation Solver (17b, co-construction), rendered from the engine's
 * payload (SCRUM-181, on SCRUM-177).
 *
 * The system holds the notation and the drawing on screen throughout; the
 * child supplies one step at a time; the solution assembles as they go. Never
 * a generic "enter the answer" component (17b §2), and never the full worked
 * example: only the step in front of the child is shown.
 *
 * THE FRONT END COMPUTES NOTHING. The previous solver worked the maths out
 * itself - it summed the bars, wrote the result row and drew the fraction from
 * numbers it had added - which is why it only ever handled two like
 * fractions. Now:
 *   - the drawing is the payload's `scaffold`, drawn with the values given;
 *   - the equation is the payload's own `assembles` and `equationState`;
 *   - a step is right when the child's entry is one of the answers the
 *     pipeline stored for it (`isStoredAnswer`), and never otherwise;
 *   - each step takes the input it names: a choice, a number, or a tap.
 *
 * NOT COUNTED HERE: misses. The hint used to surface itself after two missed
 * picks or one missed number, which is a threshold this screen has no
 * business setting (rule 3). The engine offers a hint after misses (B18), and
 * the player shows it. What stays is the child's own "Need a hint?", which
 * opens this step's hint because they asked.
 *
 * No evaluative colour ever - never red or green, never a cross. A miss is a
 * soft violet ring pulse and nothing else. No score, percentage or counter.
 *
 * READING SUPPORT'S TYPOGRAPHY REACHES EVERY WORD A CHILD READS HERE (D30):
 * the prompt, the options, the confirmation and completion lines, the hint,
 * the scaffold's labels and the unit. The notation takes the heading's
 * spacing only - "notation is never simplified away, because the notation is
 * the content". The drawing's geometry, the field a child types into and the
 * controls are left as they are, as they are on the checks.
 */
export function CalculationSolver({
  calculation,
  reading = false,
  onSolved,
  onStepAnswered,
  onPiecePlaced,
  onHintOpened,
  onReplay,
  onNarrationPlayed,
  onAudioBusy,
  onNarrationFailed,
}: {
  calculation: CalculationSegment;
  /**
   * The reading accommodation's typographic half (D30), from the same plan
   * the text segment and the checks read - see `readingSupport`.
   */
  reading?: boolean;
  /** Fired once the solution assembles - the player opens the forward chevron. */
  onSolved: () => void;
  /**
   * Each committed step (`calculation_step_response`). `correct` is this
   * screen's match against the stored answers; it feeds the lesson's error
   * streak and is never sent as a key of its own.
   */
  onStepAnswered?: (stepId: string, correct: boolean) => void;
  /** A piece tapped into the manipulative (`manipulative_piece_placed`). */
  onPiecePlaced?: (stepId: string) => void;
  /** The child opened this step's hint themselves. */
  onHintOpened?: (stepId: string) => void;
  /** A finished narration played again from the start (`replay`). */
  onReplay?: () => void;
  /** Narration started for the first time on this calculation. */
  onNarrationPlayed?: () => void;
  /** `system_busy` while narration plays - the child is listening, not idle. */
  onAudioBusy?: (phase: "start" | "end") => void;
  /** A step's narration would not load (`media_load_failed`). */
  onNarrationFailed?: (reason: MediaFailReason) => void;
}) {
  const { steps } = calculation;
  const lastIndex = steps.length - 1;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"ask" | "confirmed" | "done">("ask");
  const [hintOpen, setHintOpen] = useState(false);
  // Choice steps: selecting is not answering (SCRUM-94.3). The child picks,
  // can change their mind, then commits - a changed selection before commit
  // is itself a hesitation signal worth having.
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [placed, setPlaced] = useState(0);
  /**
   * Re-keys the ring pulse so it plays again on the next miss. It decides
   * nothing: no hint, no emphasis and no copy reads it.
   */
  const [nudge, setNudge] = useState(0);
  /**
   * Once the child has started the narration, each new step is read as it
   * arrives (17b §5, "re-reads whenever the step advances"). Never before:
   * sound nobody asked for is not this layer's to start.
   */
  const [listening, setListening] = useState(false);
  const narrationStarted = useRef(false);

  const step = steps[index];
  const done = phase === "done";
  /** A line of the child's reading that is not coloured to mean anything. */
  const readable = reading && [READING_BODY, READING_INK];
  const asking = phase === "ask";
  const line = equationAt(calculation, index, !asking);

  const advance = () => {
    if (index === lastIndex) {
      setPhase("done");
      onSolved();
      return;
    }
    setIndex(index + 1);
    setPhase("ask");
    setHintOpen(false);
    setChosen(null);
    setTyped("");
    setPlaced(0);
    setNudge(0);
  };

  // SCRUM-94.3: every step ends on a tap the child chooses to make.
  const answer = (correct: boolean) => {
    onStepAnswered?.(step.stepId, correct);
    if (!correct) {
      setNudge((n) => n + 1);
      return;
    }
    // A confirmation waits for the child's "Next step" (17b step 1). On the
    // last step there is no next step to wait for: the solution assembles.
    if (step.input === "choice" && step.confirm && index !== lastIndex) {
      setPhase("confirmed");
      return;
    }
    advance();
  };

  const openHint = () => {
    setHintOpen(true);
    onHintOpened?.(step.stepId);
  };

  const place = () => {
    if (step.input !== "tap" || placed >= step.target) return;
    setPlaced(placed + 1);
    onPiecePlaced?.(step.stepId);
  };

  const startedNarration = () => {
    setListening(true);
    if (narrationStarted.current) return;
    narrationStarted.current = true;
    onNarrationPlayed?.();
  };

  return (
    // Frame: the calc column is narrower than the reading column (560/600 vs
    // the player's 620/680).
    <div className="mx-auto sm:max-w-[560px] lg:max-w-[600px]">
      {step.narration && !done && (
        <StepNarration
          // One clip per step: a new step is a new recording, from the top.
          key={step.stepId}
          clip={step.narration}
          autoPlay={listening}
          onStarted={startedNarration}
          onReplay={onReplay}
          onBusy={onAudioBusy}
          onFailed={onNarrationFailed}
        />
      )}

      {/* SCAFFOLD - persistent; the payload's drawing, with its values */}
      {calculation.scaffold && (
        <ScaffoldCard
          scaffold={calculation.scaffold}
          done={done}
          reading={reading}
        />
      )}

      {/*
        NOTATION - alongside the drawing, never replaced by it, and updated in
        place as the solution assembles. Announced, because the equation and
        each prompt must be (17b §11).
      */}
      <div
        aria-live="polite"
        className="mt-[18px] flex min-h-[52px] items-center justify-center"
      >
        {line && (
          <div
            key={line}
            className={cn(
              "text-center text-[26px] font-medium tracking-[-0.01em] text-nevo-navy sm:text-[34px] motion-safe:animate-nevo-reveal",
              reading && READING_HEADING,
            )}
          >
            {line}
          </div>
        )}
      </div>

      {/* RESPONSE - the one thing the child does, per step */}
      <div className="mt-5">
        {phase === "confirmed" && step.input === "choice" && (
          <div className="flex flex-col gap-3.5 motion-safe:animate-nevo-reveal">
            <div className="flex items-center justify-between rounded-[12px] border-2 border-nevo-navy bg-nevo-cream-elevated px-[18px] py-4 text-base font-semibold text-nevo-near-black shadow-elevation-1 sm:text-[18px]">
              <span className={cn(readable)}>
                {chosen != null ? step.options[chosen]?.label : null}
              </span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                <Check
                  className="size-[13px] text-nevo-cream"
                  strokeWidth={2.8}
                />
              </span>
            </div>
            <p
              className={cn(
                "text-center text-sm leading-[1.6] text-nevo-near-black/70 sm:text-[15px]",
                readable,
              )}
            >
              {step.confirm}
            </p>
            <Button className="w-full" onClick={advance}>
              Next step
            </Button>
          </div>
        )}

        {done && calculation.completion && (
          <p
            className={cn(
              "text-center text-sm leading-[1.6] text-nevo-near-black/70 motion-safe:animate-nevo-reveal sm:text-[15px]",
              readable,
            )}
          >
            {calculation.completion}
          </p>
        )}

        {asking && (
          <>
            <p
              className={cn(
                "text-center text-[19px] font-semibold leading-[1.35] text-nevo-near-black sm:text-[22px]",
                reading && READING_HEADING,
              )}
            >
              {step.prompt}
            </p>
            {hintOpen && step.hint && (
              <HintPill text={step.hint} reading={reading} />
            )}

            {step.input === "choice" && (
              <>
                <Nudged nudge={nudge} className="mt-4 flex flex-col gap-2.5">
                  {step.options.map((option, i) => (
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
                        readable,
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </Nudged>
                {chosen != null && (
                  <Button
                    className="mt-3.5 w-full"
                    onClick={() =>
                      answer(
                        isStoredAnswer(
                          step.options[chosen]?.value ?? "",
                          step.accepted,
                        ),
                      )
                    }
                  >
                    Check my answer
                  </Button>
                )}
              </>
            )}

            {step.input === "number" && (
              <NumberEntry
                step={step}
                reading={reading}
                nudge={nudge}
                value={typed}
                onChange={setTyped}
                onCommit={() => answer(isStoredAnswer(typed, step.accepted))}
              />
            )}

            {step.input === "tap" && (
              <>
                <BuildTray
                  parts={calculation.manipulative?.parts ?? 0}
                  target={step.target}
                  placed={placed}
                  onPlace={place}
                />
                {placed >= step.target && (
                  <Button
                    className="mt-[18px] w-full"
                    onClick={() => answer(true)}
                  >
                    That&apos;s the total
                  </Button>
                )}
              </>
            )}

            {!hintOpen && step.hint && <HintLink onClick={openHint} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The solution as it stands: the problem's notation, then each step's
 * `assembles` while it is asked and its `equationState` once it is done, up
 * to where the child is - the latest of those the payload actually wrote.
 * `settled` is a step answered (confirmed, or the last one done).
 */
function equationAt(
  calculation: CalculationSegment,
  index: number,
  settled: boolean,
): string {
  let line = calculation.expression;
  for (let i = 0; i <= index; i++) {
    const step = calculation.steps[i];
    if (step.assembles) line = step.assembles;
    if ((i < index || settled) && step.equationState) line = step.equationState;
  }
  return line;
}

/**
 * The "not that one" ring pulse (SCRUM-94: the displacing shake is retired),
 * drawn on a layer of its own so that replaying it never remounts what the
 * child is touching - a remounted field loses focus and its keyboard.
 */
function Nudged({
  nudge,
  className,
  children,
}: {
  nudge: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative rounded-[12px]", className)}>
      {children}
      {nudge > 0 && (
        <span
          key={nudge}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[12px] motion-safe:animate-nevo-nudge"
        />
      )}
    </div>
  );
}

/**
 * A typed step.
 *
 * WHICH KEYBOARD IS THE STEP'S CALL, and the frame's. The solver frame draws
 * this field as `inputmode="numeric"` and 17b §10 asks for the device's
 * on-screen numeric keyboard - not the Nevo pad, whose 0-9 grid has no minus
 * sign and no decimal point, so "-3" or "2.5" could not be typed on a tablet
 * and the forward chevron stayed held (audit 51). `decimal` is that keyboard
 * with its point. An expression ("3x - 4") needs letters and an operator, and
 * takes the device's full keyboard. A hardware keyboard needs neither.
 */
function NumberEntry({
  step,
  reading,
  nudge,
  value,
  onChange,
  onCommit,
}: {
  step: CalcNumberStep;
  reading: boolean;
  nudge: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const text = step.entry === "text";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onCommit();
      }}
    >
      <Nudged nudge={nudge} className="mt-[18px] flex justify-center">
        <input
          inputMode={text ? "text" : "decimal"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="-"
          aria-label={step.prompt}
          className={cn(
            "h-[52px] rounded-[10px] border-2 border-nevo-near-black/18 bg-nevo-cream-elevated text-center font-semibold text-nevo-navy shadow-elevation-1 outline-none transition-colors focus:border-nevo-navy",
            text ? "w-[220px] text-[22px]" : "w-[120px] text-[26px]",
          )}
        />
        {step.unit ? (
          // Beside the field, not inside it: a child types the number, not
          // the noun.
          <span
            className={cn(
              "ml-2.5 self-center text-[15px] text-nevo-near-black/60",
              reading && [READING_BODY, READING_INK],
            )}
          >
            {step.unit}
          </span>
        ) : null}
      </Nudged>
      {value.trim().length > 0 && (
        <Button type="submit" className="mt-[18px] w-full">
          Check my answer
        </Button>
      )}
    </form>
  );
}

/** The drawing, in 17b's "Picture it" card. Decorative-with-labels (17b §11). */
function ScaffoldCard({
  scaffold,
  done,
  reading,
}: {
  scaffold: CalcScaffold;
  done: boolean;
  reading: boolean;
}) {
  return (
    <div className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
      <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
        Picture it
      </span>
      <div className="mt-3.5">
        {scaffold.kind === "bar" && (
          <BarRows
            parts={scaffold.parts}
            quantities={scaffold.quantities}
            strong={done}
            reading={reading}
          />
        )}
        {scaffold.kind === "dots" && (
          <DotGroups quantities={scaffold.quantities} reading={reading} />
        )}
        {scaffold.kind === "number_line" && (
          <NumberLine
            parts={scaffold.parts}
            points={scaffold.points}
            reading={reading}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 17b's fraction bars: one row per quantity, `parts` cells, `count` of them
 * filled. Navy once the solution has assembled (17b's complete state). No
 * result row: 17b fills one on completion, but its count would be this
 * screen's sum, and nothing in the payload carries it.
 */
function BarRows({
  parts,
  quantities,
  strong,
  reading,
}: {
  parts: number;
  quantities: ScaffoldQuantity[];
  strong: boolean;
  reading: boolean;
}) {
  const labelled = quantities.some((q) => q.label);
  return (
    <div className="flex flex-col gap-3">
      {quantities.map((q, row) => (
        <div key={row} className="flex items-center gap-3">
          {labelled && (
            <span
              className={cn(
                "min-w-[34px] shrink-0 text-sm transition-colors sm:text-[15px]",
                strong
                  ? "font-semibold text-nevo-navy"
                  : "text-nevo-near-black/60",
                // Navy says the solution has assembled, so it keeps its ink.
                reading && READING_BODY,
                reading && !strong && READING_INK,
              )}
            >
              {q.label}
            </span>
          )}
          <div aria-hidden className="flex flex-1 gap-[5px]">
            {Array.from({ length: parts }).map((_, cell) => (
              <span
                key={cell}
                className={cn(
                  // Frame cell heights per variant: 28 / 34 / 30.
                  "h-7 flex-1 rounded-[5px] transition-colors duration-200 sm:h-[34px] lg:h-[30px]",
                  cell < q.count
                    ? strong
                      ? "bg-nevo-navy"
                      : "bg-nevo-violet"
                    : "border border-nevo-near-black/12 bg-nevo-near-black/[0.08]",
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 37c's grouped dots: one group per quantity, two to a row, the groups in
 * navy then violet. 37c's "+" between groups is notation, and the notation is
 * the equation line below - nothing here reads an operator out of it.
 */
function DotGroups({
  quantities,
  reading,
}: {
  quantities: ScaffoldQuantity[];
  reading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-4">
      {quantities.map((q, group) => (
        <div key={group} className="flex flex-col items-center gap-2">
          <div aria-hidden className="grid grid-cols-[repeat(2,16px)] gap-1.5">
            {Array.from({ length: q.count }).map((_, dot) => (
              <span
                key={dot}
                className={cn(
                  "size-4 rounded-full",
                  group % 2 === 0 ? "bg-nevo-navy" : "bg-nevo-violet",
                )}
              />
            ))}
          </div>
          {q.label && (
            <span
              className={cn(
                "text-xs text-nevo-near-black/60",
                reading && [READING_BODY, READING_INK],
              )}
            >
              {q.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 37c's number line: `parts` equal steps, a tick at each, the marked ones in
 * navy with their label beneath. The other ticks are not numbered - those
 * numbers are not in the payload, and on a line of quarters they would be the
 * wrong ones.
 */
function NumberLine({
  parts,
  points,
  reading,
}: {
  parts: number;
  points: ScaffoldQuantity[];
  reading: boolean;
}) {
  return (
    <div className="mx-1.5 mt-[18px] mb-7">
      <div className="relative h-0.5 bg-nevo-near-black/30">
        {Array.from({ length: parts + 1 }).map((_, tick) => {
          const here = points.filter((p) => p.count === tick);
          return (
            <div
              key={tick}
              className="absolute top-[-5px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${(tick / parts) * 100}%` }}
            >
              <span
                aria-hidden
                className={cn(
                  "h-3 w-0.5",
                  here.length > 0 ? "bg-nevo-navy" : "bg-nevo-near-black/30",
                )}
              />
              {here.map((p, i) =>
                p.label ? (
                  <span
                    key={i}
                    className={cn(
                      "mt-1 text-[10px] whitespace-nowrap text-nevo-near-black/60",
                      reading && [READING_BODY, READING_INK],
                    )}
                  >
                    {p.label}
                  </span>
                ) : null,
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The hint the child opened - a calm pill above the response, no dismiss. */
function HintPill({ text, reading }: { text: string; reading: boolean }) {
  return (
    <div className="mx-auto mt-4 flex w-max max-w-full items-center gap-2.5 rounded-full bg-nevo-cream-elevated px-[18px] py-2.5 shadow-elevation-1 motion-safe:animate-nevo-reveal">
      <span className="size-[7px] shrink-0 rounded-full bg-nevo-violet" />
      <span
        className={cn(
          "text-sm leading-[1.4] text-nevo-near-black",
          reading && [READING_BODY, READING_INK],
        )}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * "Need a hint?" - the same weight however the step has gone. 17b drew it
 * heavier after a miss; a control that grows when a child gets something
 * wrong is this screen reacting to their difficulty, which is the engine's
 * call to make (B18) and nobody's to show.
 */
function HintLink({ onClick }: { onClick: () => void }) {
  return (
    <p className="mt-4 text-center">
      <button
        type="button"
        onClick={onClick}
        className="min-h-11 cursor-pointer px-2 text-[13px] text-nevo-violet"
      >
        Need a hint?
      </button>
    </p>
  );
}

/**
 * A tap step (17b §6): tap pieces into the empty bar until it holds the
 * stored count. The pieces offered are the ones still to place, as drawn.
 */
function BuildTray({
  parts,
  target,
  placed,
  onPlace,
}: {
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
}) {
  const remaining = Math.max(0, target - placed);
  return (
    <>
      <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div aria-hidden className="mt-3 flex gap-[5px]">
          {Array.from({ length: parts }).map((_, i) => (
            <span
              key={i}
              className={cn(
                // Frame: barH + 6 per variant (34 / 40 / 36).
                "h-[34px] flex-1 rounded-md transition-colors duration-200 sm:h-10 lg:h-9",
                i < placed
                  ? "bg-nevo-navy"
                  : "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]",
              )}
            />
          ))}
        </div>
      </div>
      {remaining > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {Array.from({ length: remaining }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={onPlace}
              className="h-[52px] min-w-[72px] cursor-pointer rounded-[12px] border-2 border-nevo-violet bg-nevo-violet/14 text-base font-semibold text-nevo-navy shadow-elevation-1 transition-transform active:scale-[0.98]"
            >
              + 1/{parts}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** 17a's narration-bar silhouette - 20 bars, explicit px heights. */
const BAR_HEIGHTS = [
  6, 10, 13, 8, 14, 10, 12, 7, 13, 9, 11, 14, 8, 12, 10, 7, 13, 9, 11, 8,
];

/**
 * The audio layer (17b §5): this step's own narration, read aloud while
 * every word stays on screen.
 *
 * IT PLAYS THE CLIP NOW. It ran a timer before - a progress line filling over
 * silence, and a `replay` sent for audio that never played - because the
 * per-step asset did not exist. `narrationAudio` carries it, so a step with a
 * clip gets a real player, and a step without one gets no bar at all.
 */
function StepNarration({
  clip,
  autoPlay,
  onStarted,
  onReplay,
  onBusy,
  onFailed,
}: {
  clip: CalcNarration;
  autoPlay: boolean;
  onStarted: () => void;
  onReplay?: () => void;
  onBusy?: (phase: "start" | "end") => void;
  onFailed?: (reason: MediaFailReason) => void;
}) {
  const media = useMediaSource(clip.src, clip.storagePath, onFailed);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const playingRef = useRef(false);
  const onBusyRef = useRef(onBusy);

  useEffect(() => {
    onBusyRef.current = onBusy;
  }, [onBusy]);

  // Moving on mid-sentence must still close the busy window.
  useEffect(
    () => () => {
      if (playingRef.current) onBusyRef.current?.("end");
    },
    [],
  );

  const setPlayState = (on: boolean) => {
    if (playingRef.current === on) return;
    playingRef.current = on;
    setPlaying(on);
    onBusyRef.current?.(on ? "start" : "end");
    if (on) onStarted();
  };

  const toggle = () => {
    const el = audioRef.current;
    if (media.failed || !el) return;
    if (playing) {
      el.pause();
      return;
    }
    // Pressing play on a finished step reads it again from the top.
    if (pct >= 100) {
      onReplay?.();
      el.currentTime = 0;
    }
    // Only a source the browser cannot play is a failure. A refusal to start
    // without a tap, or a pause while buffering, is not.
    void el.play()?.catch((err: unknown) => {
      setPlayState(false);
      if ((err as { name?: string } | null)?.name === "NotSupportedError") {
        void media.onError();
      }
    });
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-3 py-2.5 shadow-elevation-1">
      {!media.failed && (
        <audio
          // Keyed so a re-issued link actually reloads.
          key={media.key}
          ref={audioRef}
          src={media.src}
          preload="auto"
          autoPlay={autoPlay && media.key === "0"}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (!Number.isFinite(el.duration) || el.duration <= 0) return;
            setPct(Math.min(100, (el.currentTime / el.duration) * 100));
          }}
          onPlay={() => setPlayState(true)}
          onPause={() => setPlayState(false)}
          onEnded={() => {
            setPct(100);
            setPlayState(false);
          }}
          onError={() => {
            setPlayState(false);
            void media.onError();
          }}
        />
      )}
      <button
        type="button"
        aria-label={playing ? "Pause narration" : "Play narration"}
        disabled={media.failed}
        onClick={toggle}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform",
          media.failed
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer active:scale-[0.98]",
        )}
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
      {media.failed ? (
        <span role="status" className="text-[13px] text-nevo-near-black/70">
          {"Couldn't load this recording"}
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-nevo-near-black">
              Read this step aloud
            </span>
            <span className="font-mono text-[10px] tracking-[0.04em] text-nevo-near-black/50 uppercase">
              · Text stays
            </span>
          </div>
          <div aria-hidden className="flex h-3.5 items-end gap-0.5">
            {BAR_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className="w-[3px] shrink-0 rounded-full bg-nevo-navy transition-opacity duration-[160ms]"
                style={{
                  height: `${h}px`,
                  opacity: (i + 1) / BAR_HEIGHTS.length <= pct / 100 ? 0.95 : 0.28,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
