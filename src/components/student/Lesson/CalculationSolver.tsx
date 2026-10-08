"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Delete, Pause, Play } from "lucide-react";
import { Button, NevoKeyboard } from "@/components/shared";
import type {
  CalcHighlight,
  CalcNarration,
  CalcNumberStep,
  CalcScaffold,
  CalculationSegment,
  CalculationStep,
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
 *   - the drawing is the payload's `scaffold`, drawn with the values given,
 *     and what each answered step does to it is that step's `highlights`;
 *   - the equation is the payload's own `assembles` and `equationState`, and
 *     its `fullEquation` once every step is done;
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
  const line = equationAt(calculation, index, !asking, done);
  // The step whose answer the drawing is showing: the one just settled.
  const emphasis = emphasisAt(steps, asking ? index - 1 : index);

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
          emphasis={emphasis}
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
                {calculation.manipulative?.kind === "array" ? (
                  <ArrayBuild
                    rows={calculation.manipulative.rows}
                    parts={calculation.manipulative.parts}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                  />
                ) : (
                  <BuildTray
                    parts={calculation.manipulative?.parts ?? 0}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                  />
                )}
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

            {/* D150: the Nevo pad, last, as the keypad frame docks it. */}
            {step.input === "number" && step.entry === "numeric" && (
              <NevoKeyboard
                layout="calc"
                onKey={(c) => setTyped((t) => t + c)}
                className="mt-6"
              />
            )}
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
 *
 * Once every step is done it is `fullEquation`, "the complete solved equation
 * revealed after all construction steps finish" (B101) - 17b's equation
 * assembling to its answer - and it is read at no other point.
 */
function equationAt(
  calculation: CalculationSegment,
  index: number,
  settled: boolean,
  done: boolean,
): string {
  if (done && calculation.fullEquation) return calculation.fullEquation;
  let line = calculation.expression;
  for (let i = 0; i <= index; i++) {
    const step = calculation.steps[i];
    if (step.assembles) line = step.assembles;
    if ((i < index || settled) && step.equationState) line = step.equationState;
  }
  return line;
}

/** What the drawing shows, by the labels it draws. See `emphasisAt`. */
interface ScaffoldEmphasis {
  /** 17b's violet ring: the answered step's `active` targets. */
  ring: ReadonlySet<string>;
  /** 17b's navy fill: the answered step's `source` targets. */
  navy: ReadonlySet<string>;
  /** 17b's result row: a `result` target an answered step has named. */
  result: ReadonlySet<string>;
  /** A `result` target no answered step has named yet: not drawn. */
  withheld: ReadonlySet<string>;
}

/**
 * 17b's per-step choreography - denominators ringed, numerators to navy, the
 * result row filling - as each step's `highlights` name it (B107), with
 * nothing inferred.
 *
 * A HIGHLIGHT IS WHAT A STEP'S ANSWER DOES TO THE DRAWING. 17b's table puts it
 * in the "system response / scaffold change" column, on the right answer, and
 * its frame rings the bars once step 1 is confirmed and drops the ring when
 * step 2's answer turns them navy. So the drawing shows the latest answered
 * step's highlights (`settled`, -1 before any), and only those.
 *
 * A RESULT IS NEVER SHOWN EARLY. A quantity a `result` highlight names
 * anywhere is the answer, so it is withheld until a step that names it is
 * answered, and stays once it has been - the same rule as `fullEquation`.
 *
 * A TARGET IS MATCHED AGAINST THE DRAWING'S OWN LABELS, exactly. The wire
 * gives `target` no vocabulary; a label is the one thing on screen a string
 * can name without being interpreted, so a target that is not a label names
 * nothing here (asked of backend).
 */
function emphasisAt(
  steps: CalculationStep[],
  settled: number,
): ScaffoldEmphasis {
  const named = (
    step: CalculationStep | undefined,
    role: CalcHighlight["role"],
  ) =>
    (step?.highlights ?? [])
      .filter((h) => h.role === role)
      .map((h) => h.target);
  const result = new Set(
    steps.slice(0, settled + 1).flatMap((s) => named(s, "result")),
  );
  return {
    ring: new Set(named(steps[settled], "active")),
    navy: new Set(named(steps[settled], "source")),
    result,
    withheld: new Set(
      steps.flatMap((s) => named(s, "result")).filter((t) => !result.has(t)),
    ),
  };
}

/** Is this quantity drawn yet - not a result still kept back? */
const drawnNow = (emphasis: ScaffoldEmphasis) => (q: ScaffoldQuantity) =>
  !q.label || !emphasis.withheld.has(q.label);

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
 * A NUMBER TAKES THE NEVO PAD (D150), with its minus sign and point - "the
 * device's own keyboard cannot be relied on". The device's numeric keyboard
 * stood in here before; an iPhone's has no minus key, so a child doing
 * subtraction on one was simply stuck. The field suppresses the device's
 * keyboard (`inputMode="none"`), the solver docks the pad under the step, and
 * a laptop's own keys still type straight into the field. Delete sits at the
 * field, as the keypad frame draws it.
 *
 * AN EXPRESSION ("3x - 4") STILL TAKES THE DEVICE'S FULL KEYBOARD. It needs
 * letters and operators, D150 draws a number pad only, and the Nevo qwerty has
 * no "+" or "=" - so it is unchanged until design says which (asked).
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
  if (step.entry === "numeric") {
    return (
      <PadEntry
        step={step}
        reading={reading}
        nudge={nudge}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
      />
    );
  }
  return (
    <EntryForm value={value} onCommit={onCommit}>
      <Nudged nudge={nudge} className="mt-[18px] flex justify-center">
        <input
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="-"
          aria-label={step.prompt}
          className="h-[52px] w-[220px] rounded-[10px] border-2 border-nevo-near-black/18 bg-nevo-cream-elevated text-center text-[22px] font-semibold text-nevo-navy shadow-elevation-1 outline-none transition-colors focus:border-nevo-navy"
        />
        <Unit unit={step.unit} reading={reading} />
      </Nudged>
    </EntryForm>
  );
}

/** The step's form: Enter or "Check my answer" commits what is typed. */
function EntryForm({
  value,
  onCommit,
  children,
}: {
  value: string;
  onCommit: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onCommit();
      }}
    >
      {children}
      {value.trim().length > 0 && (
        <Button type="submit" className="mt-[18px] w-full">
          Check my answer
        </Button>
      )}
    </form>
  );
}

/**
 * Beside the field, not inside it: a child types the number, not the noun.
 */
function Unit({ unit, reading }: { unit?: string; reading: boolean }) {
  if (!unit) return null;
  return (
    <span
      className={cn(
        "ml-2.5 shrink-0 self-center text-[15px] text-nevo-near-black/60",
        reading && [READING_BODY, READING_INK],
      )}
    >
      {unit}
    </span>
  );
}

/**
 * The minus sign as the keypad frame draws it in the field. What is kept, and
 * matched against the stored answers, is the hyphen they are written with.
 */
const MINUS = "\u2212";
const drawn = (value: string) => value.replace(/-/g, MINUS);
const kept = (shown: string) => shown.replace(/\u2212/g, "-");

/**
 * The number field, as D150's keypad frame draws it: "YOUR ANSWER", the field
 * with delete at its end once something is typed, and the line under it.
 * The pad itself is docked below the step by the solver.
 */
function PadEntry({
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
  return (
    <EntryForm value={value} onCommit={onCommit}>
      <div className="mt-[18px] flex flex-col items-center gap-4">
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-nevo-near-black/50 uppercase sm:text-[11.5px]">
          Your answer
        </span>
        <Nudged
          nudge={nudge}
          className="flex w-full items-center sm:max-w-[440px]"
        >
          <div className="flex min-h-[72px] min-w-0 flex-1 items-center gap-1 rounded-[10px] border-[1.5px] border-nevo-navy/40 bg-nevo-cream-elevated px-[18px] py-2.5 transition-colors focus-within:border-nevo-navy sm:min-h-[82px] lg:min-h-[80px]">
            <input
              // The pad below is this field's keyboard (D150).
              inputMode="none"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={drawn(value)}
              onChange={(e) => onChange(kept(e.target.value))}
              aria-label={step.prompt}
              className="min-w-0 flex-1 bg-transparent text-[38px] leading-[1.1] font-semibold text-nevo-navy caret-nevo-navy outline-none sm:text-[48px] lg:text-[46px]"
            />
            {value.length > 0 && (
              <button
                type="button"
                aria-label="Delete"
                onClick={() => onChange(value.slice(0, -1))}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-nevo-near-black"
              >
                <Delete className="size-[22px] sm:size-6" strokeWidth={1.9} />
              </button>
            )}
          </div>
          <Unit unit={step.unit} reading={reading} />
        </Nudged>
        <p
          className={cn(
            "max-w-[360px] text-center text-[13.5px] leading-[1.5] text-pretty text-nevo-near-black/60 sm:text-[15px]",
            reading && [READING_BODY, READING_INK],
          )}
        >
          Type the number you worked out. You can use a minus sign or a point.
        </p>
      </div>
    </EntryForm>
  );
}

/** The drawing, in 17b's "Picture it" card. Decorative-with-labels (17b §11). */
function ScaffoldCard({
  scaffold,
  emphasis,
  reading,
}: {
  scaffold: CalcScaffold;
  emphasis: ScaffoldEmphasis;
  reading: boolean;
}) {
  const shown = drawnNow(emphasis);
  return (
    <div className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
      <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
        Picture it
      </span>
      <div className="mt-3.5">
        {scaffold.kind === "bar" && (
          <BarRows
            parts={scaffold.parts}
            quantities={scaffold.quantities.filter(shown)}
            emphasis={emphasis}
            reading={reading}
          />
        )}
        {/*
          No frame draws choreography on dots, a line, an array or place
          value, so none takes one. A result is still kept back until its
          step is answered.
        */}
        {scaffold.kind === "array" && (
          <ArrayRows
            parts={scaffold.parts}
            quantities={scaffold.quantities.filter(shown)}
            reading={reading}
          />
        )}
        {scaffold.kind === "place_value" && (
          <PlaceValue places={scaffold.places} shown={shown} reading={reading} />
        )}
        {scaffold.kind === "dots" && (
          <DotGroups
            quantities={scaffold.quantities.filter(shown)}
            reading={reading}
          />
        )}
        {scaffold.kind === "number_line" && (
          <NumberLine
            parts={scaffold.parts}
            points={scaffold.points.filter(shown)}
            reading={reading}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 17b's fraction bars: one row per quantity, `parts` cells, `count` of them
 * filled. What an answered step's highlights name changes in place (17b
 * §3): a ring in violet, cells strengthened to navy, and a result row that
 * fills below a rule. A row nothing names stays as it was drawn - nothing
 * here turns navy because the solve finished.
 */
function BarRows({
  parts,
  quantities,
  emphasis,
  reading,
}: {
  parts: number;
  quantities: ScaffoldQuantity[];
  emphasis: ScaffoldEmphasis;
  reading: boolean;
}) {
  const labelled = quantities.some((q) => q.label);
  return (
    <div className="flex flex-col gap-3">
      {quantities.map((q, row) => {
        const named = (set: ReadonlySet<string>) =>
          q.label != null && set.has(q.label);
        const result = named(emphasis.result);
        // The frame's result row takes no ring, only its navy.
        const ring = !result && named(emphasis.ring);
        const strong = result || named(emphasis.navy);
        return (
          <div
            key={row}
            className={cn(
              "flex items-center gap-3",
              result &&
                "border-t border-nevo-near-black/10 pt-3 motion-safe:animate-nevo-reveal",
            )}
          >
            {labelled && (
              <span
                className={cn(
                  "min-w-[34px] shrink-0 text-sm transition-colors sm:text-[15px]",
                  strong
                    ? "font-semibold text-nevo-navy"
                    : "text-nevo-near-black/60",
                  // Navy is what the step's answer did, so it keeps its ink.
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
                    ring && "outline-2 outline-offset-2 outline-nevo-violet",
                  )}
                />
              ))}
            </div>
          </div>
        );
      })}
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
 * D149's square place, at its 40px where the column has room and narrower
 * where it does not. Filled is navy with the frame's inset; empty is the
 * frame's dashed place.
 */
const SQUARE =
  "aspect-square min-w-0 flex-[0_1_40px] rounded-lg transition-colors duration-200";
const SQUARE_FILLED = "bg-nevo-navy shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]";
const SQUARE_EMPTY =
  "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]";

/**
 * D149's array: a row of `parts` square places per quantity, `count` of them
 * filled. D149 draws no labels on an array; where the payload pairs one with
 * a row, it sits at the row's start as it does on the bars.
 */
function ArrayRows({
  parts,
  quantities,
  reading,
}: {
  parts: number;
  quantities: ScaffoldQuantity[];
  reading: boolean;
}) {
  const labelled = quantities.some((q) => q.label);
  return (
    <div className="flex flex-col gap-2.5">
      {quantities.map((q, row) => (
        <div key={row} className="flex items-center gap-3">
          {labelled && (
            <span
              className={cn(
                "min-w-[34px] shrink-0 text-sm text-nevo-near-black/60 sm:text-[15px]",
                reading && [READING_BODY, READING_INK],
              )}
            >
              {q.label}
            </span>
          )}
          <div
            aria-hidden
            data-array-row
            className="flex min-w-0 flex-1 justify-center gap-2.5"
          >
            {Array.from({ length: parts }).map((_, cell) => (
              <span
                key={cell}
                className={cn(
                  SQUARE,
                  cell < q.count ? SQUARE_FILLED : SQUARE_EMPTY,
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** D149's three place-value pieces, largest first, in its own sizes. */
const PIECES = [
  {
    piece: "flat",
    className: "size-[58px] rounded-md shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]",
    grid: "repeating-linear-gradient(0deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 11.6px),repeating-linear-gradient(90deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 11.6px)",
  },
  {
    piece: "rod",
    className: "h-[58px] w-3.5 rounded shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]",
    grid: "repeating-linear-gradient(0deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 6.8px)",
  },
  {
    piece: "unit",
    className: "size-4 rounded-[3px] shadow-[inset_0_-2px_0_rgba(0,0,0,0.14)]",
    grid: undefined,
  },
] as const;

/**
 * D149's place value: three columns, flats then rods then units, each holding
 * its mark's count of pieces. The shapes say ten to one at each step, which is
 * true of any three neighbouring places; which places they are is the
 * payload's labels to say, under each column. D149's "Hundreds", "Tens" and
 * "Ones" are not drawn for a payload that names none - for a lesson on
 * tenths they would be wrong.
 *
 * A column whose quantity is a result still kept back is not drawn; the
 * others keep their own shapes.
 */
function PlaceValue({
  places,
  shown,
  reading,
}: {
  places: ScaffoldQuantity[];
  shown: (q: ScaffoldQuantity) => boolean;
  reading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-5">
      {places.map((place, i) => {
        const shape = PIECES[i];
        if (!shape || !shown(place)) return null;
        return (
          <div key={i} className="flex flex-col items-center gap-2.5">
            <div
              aria-hidden
              className={cn(
                "gap-1.5",
                shape.piece === "unit"
                  ? "grid grid-cols-[repeat(2,auto)]"
                  : "flex flex-wrap items-end justify-center",
              )}
            >
              {Array.from({ length: place.count }).map((_, n) => (
                <span
                  key={n}
                  data-piece={shape.piece}
                  className={cn("bg-nevo-navy", shape.className)}
                  style={
                    shape.grid ? { backgroundImage: shape.grid } : undefined
                  }
                />
              ))}
            </div>
            {place.label && (
              <span
                className={cn(
                  "text-xs font-medium text-nevo-near-black/60",
                  reading && [READING_BODY, READING_INK],
                )}
              >
                {place.label}
              </span>
            )}
          </div>
        );
      })}
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

/**
 * An array build (D149): `rows` rows of `parts` empty places, filled in
 * reading order as the child taps the one piece the tray offers. "Nothing
 * marks right or wrong while building", and the tray goes once the stored
 * count is placed, as the bar's does.
 */
function ArrayBuild({
  rows,
  parts,
  target,
  placed,
  onPlace,
}: {
  rows: number;
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
}) {
  return (
    <>
      <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div aria-hidden className="mt-3 flex flex-col gap-2.5">
          {Array.from({ length: rows }).map((_, row) => (
            <div
              key={row}
              data-array-row
              className="flex justify-center gap-2.5"
            >
              {Array.from({ length: parts }).map((_, cell) => (
                <span
                  key={cell}
                  className={cn(
                    SQUARE,
                    // Reading order: a row fills before the next one starts.
                    row * parts + cell < placed ? SQUARE_FILLED : SQUARE_EMPTY,
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {placed < target && (
        <div className="mt-4 flex items-center justify-center gap-2.5">
          <span aria-hidden className="text-xs text-nevo-near-black/55">
            Tap to add
          </span>
          {/* D149's 34px piece, in a 44px target. */}
          <button
            type="button"
            aria-label="Tap to add"
            onClick={onPlace}
            className="flex size-11 cursor-pointer items-center justify-center"
          >
            <span className="size-[34px] rounded-lg border-2 border-nevo-violet bg-nevo-violet/18 shadow-elevation-1" />
          </button>
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
