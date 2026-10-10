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
  /** A place-value build's pieces, column by column. */
  const [placedCols, setPlacedCols] = useState<number[]>([]);
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
  /*
   * Backend, 9 Oct: "Highlights apply while the step is being asked. Once
   * accepted, render assembles and move to the next step's highlights." So
   * a confirmed step has been accepted, and it is the next step's highlights
   * that show beside its confirmation - 17b's ring on "s1-correct".
   */
  const accepted = asking ? index - 1 : index;
  const line = equationAt(calculation, accepted, done);
  const emphasis = emphasisAt(steps, accepted + 1, accepted);
  const manipulative = calculation.manipulative;
  /** The tap step's pieces are all placed: what "That's the total" waits on. */
  const built =
    step.input === "tap" &&
    (manipulative?.kind === "place_value"
      ? manipulative.columns.every((c, i) => (placedCols[i] ?? 0) >= c.count)
      : placed >= step.target);

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
    setPlacedCols([]);
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

  /** A piece into one place-value column, until it holds that column's count. */
  const placeIn = (column: number) => {
    if (step.input !== "tap" || manipulative?.kind !== "place_value") return;
    const have = placedCols[column] ?? 0;
    if (have >= (manipulative.columns[column]?.count ?? 0)) return;
    const next = [...placedCols];
    next[column] = have + 1;
    setPlacedCols(next);
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
            <Notation line={line} emphasis={emphasis} />
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
                {manipulative?.kind === "array" && (
                  <ArrayBuild
                    rows={manipulative.rows}
                    parts={manipulative.parts}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                    ringed={piecesRinged(manipulative.pieceLabels, emphasis)}
                  />
                )}
                {manipulative?.kind === "number_line" && (
                  <LineBuild
                    parts={manipulative.parts}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                    ringed={piecesRinged(manipulative.pieceLabels, emphasis)}
                  />
                )}
                {manipulative?.kind === "place_value" && (
                  <PlaceValueBuild
                    columns={manipulative.columns}
                    placed={placedCols}
                    onPlace={placeIn}
                    reading={reading}
                  />
                )}
                {manipulative?.kind === "fraction_bar" && (
                  <BuildTray
                    parts={manipulative.parts}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                    ringed={piecesRinged(manipulative.pieceLabels, emphasis)}
                  />
                )}
                {built && (
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
 * The solution as it stands: the problem's notation, then the `assembles` of
 * each step accepted so far - backend, 9 Oct: "Once accepted, render
 * assembles". `equationState` stands in only for a step whose `assembles` is
 * empty. `accepted` is the last step accepted, -1 before any.
 *
 * Once every step is done it is `fullEquation`, "the complete solved equation
 * revealed after all construction steps finish" (B101) - 17b's equation
 * assembling to its answer - and it is read at no other point.
 */
function equationAt(
  calculation: CalculationSegment,
  accepted: number,
  done: boolean,
): string {
  if (done && calculation.fullEquation) return calculation.fullEquation;
  let line = calculation.expression;
  for (let i = 0; i <= accepted; i++) {
    const step = calculation.steps[i];
    line = step.assembles || step.equationState || line;
  }
  return line;
}

/** What the screen shows of the highlights, by target. See `emphasisAt`. */
interface Emphasis {
  /** 17b's violet ring: the asked step's `active` targets. */
  ring: ReadonlySet<string>;
  /** 17b's navy: the asked step's `source` targets. */
  navy: ReadonlySet<string>;
  /** The asked step's `result` targets: where its answer goes. */
  result: ReadonlySet<string>;
  /** A `result` target an accepted step named: shown, as the result. */
  revealed: ReadonlySet<string>;
  /** A `result` target no accepted step has named yet: not drawn. */
  withheld: ReadonlySet<string>;
}

/**
 * 17b's per-step choreography - denominators ringed, numerators to navy, the
 * result - as each step's `highlights` name it (B107), with nothing inferred.
 *
 * A STEP'S HIGHLIGHTS APPLY WHILE IT IS ASKED (backend, 9 Oct), and on its
 * acceptance the next step's take over. `asked` is that step - one past the
 * end once the last is done, when none apply.
 *
 * A TARGET IS "AN OPAQUE RENDERER TARGET ... MATCH IT ONLY TO AN ID CARRIED BY
 * THE SAME CALCULATION; AN UNKNOWN TARGET IS IGNORED RATHER THAN GUESSED". The
 * calculation carries no ids for its parts, so a target is matched, exactly,
 * against what does name each one: a token of the equation on screen, a
 * scaffold mark's label (or a part's, where there are no marks), a
 * manipulative piece's label. Nothing else is tried - not a mark's value or
 * its position, which "0" or "3" could name by accident - and a target that
 * matches nothing changes nothing.
 *
 * A RESULT IS NEVER SHOWN EARLY. A mark a `result` highlight names is the
 * answer, so it is kept back until a step that names it is accepted, and
 * stays once it has been - the same rule as `fullEquation`.
 */
function emphasisAt(
  steps: CalculationStep[],
  asked: number,
  accepted: number,
): Emphasis {
  const named = (
    step: CalculationStep | undefined,
    role: CalcHighlight["role"],
  ) =>
    (step?.highlights ?? [])
      .filter((h) => h.role === role)
      .map((h) => h.target);
  const revealed = new Set(
    steps.slice(0, accepted + 1).flatMap((s) => named(s, "result")),
  );
  return {
    ring: new Set(named(steps[asked], "active")),
    navy: new Set(named(steps[asked], "source")),
    result: new Set(named(steps[asked], "result")),
    revealed,
    withheld: new Set(
      steps.flatMap((s) => named(s, "result")).filter((t) => !revealed.has(t)),
    ),
  };
}

/** Is this quantity drawn yet - not a result still kept back? */
const drawnNow = (emphasis: Emphasis) => (q: ScaffoldQuantity) =>
  !q.label || !emphasis.withheld.has(q.label);

/** Does the emphasis set name this label? An unlabelled thing is never named. */
const names = (set: ReadonlySet<string>, label: string | undefined) =>
  label != null && label !== "" && set.has(label);

/** The pieces of a build an `active` highlight names, by their labels. */
const piecesRinged = (labels: string[], emphasis: Emphasis) =>
  new Set(labels.flatMap((l, i) => (names(emphasis.ring, l) ? [i] : [])));

/**
 * The equation, token by token as written - split at its spaces, nothing
 * parsed - so a highlight can name one. A ring is the drawing's violet ring,
 * `source` the weight the frame gives the assembled answer, and `result` the
 * frame's dashed box around the "?" still to find. The text is unchanged.
 */
function Notation({ line, emphasis }: { line: string; emphasis: Emphasis }) {
  return (
    <>
      {line.split(/(\s+)/).map((token, i) => {
        const ring = names(emphasis.ring, token);
        const bold = names(emphasis.navy, token);
        const box = names(emphasis.result, token);
        // A token nothing names stays plain text.
        if (!ring && !bold && !box) return token;
        return (
          <span
            key={i}
            className={cn(
              ring && "rounded-md outline-2 outline-offset-4 outline-nevo-violet",
              bold && "font-bold",
              box &&
                "inline-block rounded-[10px] border-2 border-dashed border-nevo-navy/40 px-2",
            )}
          >
            {token}
          </span>
        );
      })}
    </>
  );
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
 * A NUMBER TAKES THE NEVO PAD (D150), with its minus sign and point - "the
 * device's own keyboard cannot be relied on". The device's numeric keyboard
 * stood in here before; an iPhone's has no minus key, so a child doing
 * subtraction on one was simply stuck. The field suppresses the device's
 * keyboard (`inputMode="none"`), the solver docks the pad under the step, and
 * a laptop's own keys still type straight into the field. Delete sits at the
 * field, as the keypad frame draws it.
 *
 * AN EXPRESSION ("3x - 4") STILL TAKES THE DEVICE'S FULL KEYBOARD, for now.
 * Design ruled on 9 Oct: "The Nevo pad, extended by the step ... the step
 * says which characters it needs and the pad carries those." No step says so
 * yet - the wire's `expectedInput` is only "text" - and reading the
 * characters off the stored answer would be this screen deciding what the
 * child may type. So it waits on that field (asked of backend).
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
  emphasis: Emphasis;
  reading: boolean;
}) {
  const shown = drawnNow(emphasis);
  return (
    <div className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
      <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
        Picture it
      </span>
      <div className="mt-3.5">
        {(scaffold.kind === "bar" ||
          scaffold.kind === "array" ||
          scaffold.kind === "dots") && (
          <CellRows scaffold={scaffold} emphasis={emphasis} reading={reading} />
        )}
        {/*
          Only 17b draws navy on a mark, so only the bars take it; every
          kind takes the ring, and keeps a result back until its step is
          accepted.
        */}
        {scaffold.kind === "place_value" && (
          <PlaceValue
            places={scaffold.places}
            shown={shown}
            emphasis={emphasis}
            reading={reading}
          />
        )}
        {scaffold.kind === "number_line" && (
          <NumberLine
            parts={scaffold.parts}
            points={scaffold.points.filter(shown)}
            partLabels={scaffold.partLabels}
            emphasis={emphasis}
            reading={reading}
          />
        )}
      </div>
    </div>
  );
}

type CellScaffold = Extract<CalcScaffold, { kind: "bar" | "array" | "dots" }>;

/**
 * Which mark fills each cell, bar by bar or row by row. One mark to a bar
 * where there are as many marks as bars, each from the bar's start (17b);
 * otherwise the marks one after another in reading order - along a bar's
 * one row, or through an array's rows (D149). A layout, never a total: the
 * adapter has already refused marks that do not fit.
 */
function cellsOf({
  kind,
  parts,
  rows,
  quantities,
}: CellScaffold): (number | null)[][] {
  const grid = Array.from({ length: rows }, () =>
    Array<number | null>(parts).fill(null),
  );
  if (kind === "bar" && quantities.length === rows) {
    quantities.forEach((q, row) => {
      for (let cell = 0; cell < q.count; cell++) grid[row][cell] = row;
    });
    return grid;
  }
  let at = 0;
  quantities.forEach((q, mark) => {
    for (let n = 0; n < q.count; n++, at++) {
      grid[Math.floor(at / parts)][at % parts] = mark;
    }
  });
  return grid;
}

/** 17b's ring, on a cell, a group or a column. */
const RING = "outline-2 outline-offset-2 outline-nevo-violet";

/** 17b's bar cell, at the frame's 28 / 34 / 30 per variant. */
const BAR_CELL =
  "h-7 rounded-[5px] transition-colors duration-200 sm:h-[34px] lg:h-[30px]";
const BAR_EMPTY = "border border-nevo-near-black/12 bg-nevo-near-black/[0.08]";
/** D149's square place, at its 40px where the row has room. */
const ARRAY_CELL = "aspect-square rounded-lg transition-colors duration-200";
const ARRAY_INSET = "shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]";
/** D149's round place for dots; a filled one holds a 34px dot. */
const DOT_CELL =
  "flex aspect-square items-center justify-center rounded-full transition-colors duration-200";
const DOT_EMPTY =
  "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]";

/**
 * A mark's fill. 17b's bars are violet, and navy where a step names them;
 * D149's array and dots are navy. Where one bar, array or set of dots
 * carries several marks, they alternate - violet and a lighter violet on a
 * bar, 37c's navy and violet otherwise - so each can be told from the next.
 * No frame draws several marks on one; this is the least that keeps them
 * apart.
 */
function fillOf(kind: CellScaffold["kind"], mark: number, several: boolean) {
  if (kind !== "bar") {
    return cn(ARRAY_INSET, mark % 2 === 1 ? "bg-nevo-violet" : "bg-nevo-navy");
  }
  return several && mark % 2 === 1 ? "bg-nevo-violet/55" : "bg-nevo-violet";
}

/**
 * 17b's fraction bars and D149's array, from the payload's `rows`, `parts`,
 * marks and labels (see `scaffoldFor`). What the asked step names changes in
 * place: a ring in violet, a bar's cells to navy, and a result - kept back
 * until it is accepted - that fills in navy, a bar to itself below a rule.
 * Nothing turns navy because the solve finished.
 *
 * A label sits where its mark is: at the start of a bar that is its mark's
 * own (17b), under its cells where one bar carries several marks, and a
 * part's label under its part.
 */
function CellRows({
  scaffold,
  emphasis,
  reading,
}: {
  scaffold: CellScaffold;
  emphasis: Emphasis;
  reading: boolean;
}) {
  const { kind, parts, rows, quantities, partLabels } = scaffold;
  const bar = kind === "bar";
  const grid = cellsOf(scaffold);
  const oneToABar = bar && quantities.length > 0 && quantities.length === rows;
  const rowLabelled = oneToABar && quantities.some((q) => q.label);
  const several = !oneToABar && quantities.length > 1;
  const labelOf = (mark: number | null) =>
    mark == null ? undefined : quantities[mark]?.label;
  const hidden = (mark: number | null) =>
    names(emphasis.withheld, labelOf(mark));
  const dots = kind === "dots";
  const columns = {
    gridTemplateColumns: bar
      ? `repeat(${parts}, minmax(0, 1fr))`
      : `repeat(${parts}, minmax(0, 40px))`,
  };
  /** D149: 5px between a bar's cells, 10 between squares, 8 between dots. */
  const gap = bar ? "gap-[5px]" : dots ? "justify-center gap-2" : "justify-center gap-2.5";
  const labelClass = (strong: boolean) =>
    cn(
      "text-sm transition-colors sm:text-[15px]",
      strong ? "font-semibold text-nevo-navy" : "text-nevo-near-black/60",
      // Navy is what the step names, so it keeps its ink.
      reading && READING_BODY,
      reading && !strong && READING_INK,
    );

  /** Where each mark starts, for a label under its own cells. */
  const runs = quantities.reduce<{ mark: number; start: number; span: number }[]>(
    (laid, q, mark) => {
      const before = laid[laid.length - 1];
      const start = before ? before.start + quantities[before.mark].count : 0;
      return [...laid, { mark, start, span: Math.max(q.count, 1) }];
    },
    [],
  );

  return (
    <div className={cn("flex flex-col", bar ? "gap-3" : "gap-2.5")}>
      {grid.map((cells, row) => {
        const own = oneToABar ? quantities[row] : undefined;
        const result = names(emphasis.revealed, own?.label);
        return (
          <div
            key={row}
            className={cn(
              "flex items-center gap-3",
              result &&
                "border-t border-nevo-near-black/10 pt-3 motion-safe:animate-nevo-reveal",
            )}
          >
            {rowLabelled && (
              <span
                className={cn(
                  "min-w-[34px] shrink-0",
                  labelClass(result || names(emphasis.navy, own?.label)),
                )}
              >
                {hidden(row) ? null : own?.label}
              </span>
            )}
            <div
              aria-hidden
              data-scaffold-row
              className={cn("grid min-w-0 flex-1", gap)}
              style={columns}
            >
              {cells.map((mark, col) => {
                const label = labelOf(mark);
                const filled = mark != null && !hidden(mark);
                const ring =
                  (filled && names(emphasis.ring, label)) ||
                  names(emphasis.ring, partLabels[col]);
                const navy =
                  bar &&
                  filled &&
                  (names(emphasis.navy, label) ||
                    names(emphasis.revealed, label) ||
                    names(emphasis.navy, partLabels[col]));
                const fill =
                  mark == null
                    ? ""
                    : navy
                      ? "bg-nevo-navy"
                      : fillOf(kind, mark, several);
                if (dots) {
                  return (
                    <span
                      key={col}
                      className={cn(DOT_CELL, !filled && DOT_EMPTY, ring && RING)}
                    >
                      {filled && (
                        <span
                          className={cn("size-[85%] rounded-full", ARRAY_INSET, fill)}
                        />
                      )}
                    </span>
                  );
                }
                return (
                  <span
                    key={col}
                    className={cn(
                      bar ? BAR_CELL : ARRAY_CELL,
                      !filled ? (bar ? BAR_EMPTY : SQUARE_EMPTY) : fill,
                      ring && RING,
                    )}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {!oneToABar && quantities.some((q) => q.label) && (
        <div className={cn("grid", gap)} style={columns}>
          {runs.map(({ mark, start: at, span }) =>
            quantities[mark].label && !hidden(mark) ? (
              <span
                key={mark}
                className={cn(
                  "text-center",
                  labelClass(
                    names(emphasis.navy, quantities[mark].label) ||
                      names(emphasis.revealed, quantities[mark].label),
                  ),
                )}
                style={{ gridColumn: `${at + 1} / span ${span}` }}
              >
                {quantities[mark].label}
              </span>
            ) : null,
          )}
        </div>
      )}
      {partLabels.length > 0 && (
        <div className={cn("grid", gap)} style={columns}>
          {partLabels.map((label, col) => (
            <span
              key={col}
              className={cn(
                "text-center",
                labelClass(names(emphasis.navy, label)),
              )}
            >
              {label}
            </span>
          ))}
        </div>
      )}
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
const SQUARE_FILLED = cn("bg-nevo-navy", ARRAY_INSET);
const SQUARE_EMPTY =
  "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]";

/** D149's three place-value pieces, largest first, in its own sizes. */
const PIECES = [
  {
    piece: "flat",
    className: "size-[58px] rounded-md shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]",
    zone: "size-[58px] rounded-md",
    tile: "size-[34px] rounded-[7px]",
    grid: "repeating-linear-gradient(0deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 11.6px),repeating-linear-gradient(90deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 11.6px)",
  },
  {
    piece: "rod",
    className: "h-[58px] w-3.5 rounded shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]",
    zone: "h-[58px] w-3.5 rounded",
    tile: "h-[34px] w-3 rounded-[5px]",
    grid: "repeating-linear-gradient(0deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 6.8px)",
  },
  {
    piece: "unit",
    className: "size-4 rounded-[3px] shadow-[inset_0_-2px_0_rgba(0,0,0,0.14)]",
    zone: "size-4 rounded-[3px]",
    tile: "size-4 rounded",
    grid: undefined,
  },
] as const;

/** One place-value piece, placed (navy, the frame's grid) or still empty. */
function Piece({
  shape,
  placed,
}: {
  shape: (typeof PIECES)[number];
  placed: boolean;
}) {
  return placed ? (
    <span
      data-piece={shape.piece}
      className={cn("bg-nevo-navy", shape.className)}
      style={shape.grid ? { backgroundImage: shape.grid } : undefined}
    />
  ) : (
    <span
      data-zone={shape.piece}
      className={cn(
        "box-border border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]",
        shape.zone,
      )}
    />
  );
}

/** A column's pieces: the units two to a row, as D149 stacks them. */
function PieceStack({
  shape,
  children,
  ringed = false,
}: {
  shape: (typeof PIECES)[number];
  children: React.ReactNode;
  ringed?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "gap-1.5 rounded-md",
        shape.piece === "unit"
          ? "grid grid-cols-[repeat(2,auto)]"
          : "flex flex-wrap items-end justify-center",
        ringed && RING,
      )}
    >
      {children}
    </div>
  );
}

/** A column's name, as the payload's label gives it. */
function ColumnLabel({ label, reading }: { label?: string; reading: boolean }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "text-xs font-medium text-nevo-near-black/60",
        reading && [READING_BODY, READING_INK],
      )}
    >
      {label}
    </span>
  );
}

/**
 * D149's place value: three columns, flats then rods then units, each holding
 * its mark's count of pieces - "marks are the piece counts for the columns
 * named by labels". The shapes say ten to one at each step, true of any
 * three neighbouring places; which places is the labels' to say, under each
 * column. D149's "Hundreds", "Tens" and "Ones" are not drawn for a payload
 * that names none - for a lesson on tenths they would be wrong.
 *
 * A column whose quantity is a result still kept back is not drawn; the
 * others keep their own shapes.
 */
function PlaceValue({
  places,
  shown,
  emphasis,
  reading,
}: {
  places: ScaffoldQuantity[];
  shown: (q: ScaffoldQuantity) => boolean;
  emphasis: Emphasis;
  reading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-5">
      {places.map((place, i) => {
        const shape = PIECES[i];
        if (!shape || !shown(place)) return null;
        return (
          <div key={i} className="flex flex-col items-center gap-2.5">
            <PieceStack shape={shape} ringed={names(emphasis.ring, place.label)}>
              {Array.from({ length: place.count }).map((_, n) => (
                <Piece key={n} shape={shape} placed />
              ))}
            </PieceStack>
            <ColumnLabel label={place.label} reading={reading} />
          </div>
        );
      })}
    </div>
  );
}

/** D149's line: where position `i` of `parts` sits along it. */
const along = (position: number, parts: number) =>
  `${parts > 1 ? (position / (parts - 1)) * 100 : 0}%`;

/** D149's track and ticks, a tick at each of the line's `parts` positions. */
function LineTrack({ parts }: { parts: number }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-x-0 top-[30px] h-1 rounded-full bg-nevo-near-black/20"
      />
      {Array.from({ length: parts }).map((_, tick) => (
        <span
          key={tick}
          aria-hidden
          data-tick
          className="absolute top-[22px] h-5 w-0.5 -translate-x-1/2 rounded-full bg-nevo-near-black/30"
          style={{ left: along(tick, parts) }}
        />
      ))}
    </>
  );
}

/** D149's marker: the navy bead on the line. */
const BEAD =
  "absolute top-[18px] size-[30px] -translate-x-1/2 rounded-full bg-nevo-navy shadow-[0_3px_8px_rgba(0,0,0,0.2)] transition-[left] duration-200";

/** A label under a position, in D149's line-label type. */
function LineLabel({
  at,
  parts,
  reading,
  children,
}: {
  at: number;
  parts: number;
  reading: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute top-[46px] -translate-x-1/2 text-xs whitespace-nowrap text-nevo-near-black/55",
        reading && [READING_BODY, READING_INK],
      )}
      style={{ left: along(at, parts) }}
    >
      {children}
    </span>
  );
}

/**
 * D149's number line: a track with a tick at each of its `parts` positions -
 * "cells or positions in one row" - and a navy marker at each mark's
 * position, its label beneath it. With no marks, a part's label sits under
 * its position, as D149 numbers 0, 5 and 10; a blank one leaves its tick
 * unnumbered. No other number is drawn: on a line of quarters the obvious
 * ones would be wrong.
 */
function NumberLine({
  parts,
  points,
  partLabels,
  emphasis,
  reading,
}: {
  parts: number;
  points: ScaffoldQuantity[];
  partLabels: string[];
  emphasis: Emphasis;
  reading: boolean;
}) {
  return (
    <div className="mx-[15px] mb-3">
      <div className="relative h-16">
        <LineTrack parts={parts} />
        {points.map((p, i) => (
          <span
            key={i}
            aria-hidden
            data-bead
            className={cn(BEAD, names(emphasis.ring, p.label) && RING)}
            style={{ left: along(p.count, parts) }}
          />
        ))}
        {points.map((p, i) =>
          p.label ? (
            <LineLabel key={i} at={p.count} parts={parts} reading={reading}>
              {p.label}
            </LineLabel>
          ) : null,
        )}
        {partLabels.map((label, at) =>
          label ? (
            <LineLabel key={at} at={at} parts={parts} reading={reading}>
              {label}
            </LineLabel>
          ) : null,
        )}
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
 * stored count. The tray offers ONE piece, as D149 draws it for every kind -
 * design, 9 Oct: "the fraction bar's tray becomes D149's single piece. One
 * scaffold, one interaction, everywhere." 17b drew a tile per piece still to
 * place, which also told the child how many were left. A piece the asked
 * step names by its label is ringed.
 */
function BuildTray({
  parts,
  target,
  placed,
  onPlace,
  ringed,
}: {
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
  ringed: ReadonlySet<number>;
}) {
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
              data-build-place
              className={cn(
                // Frame: barH + 6 per variant (34 / 40 / 36).
                "h-[34px] flex-1 rounded-md transition-colors duration-200 sm:h-10 lg:h-9",
                i < placed
                  ? "bg-nevo-navy"
                  : "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]",
                ringed.has(i) && RING,
              )}
            />
          ))}
        </div>
      </div>
      {placed < target && (
        <TapToAdd>
          {/* D149's fraction tile: 44px tall, at least 72 wide. */}
          <button
            type="button"
            onClick={onPlace}
            className="flex h-11 min-w-[72px] cursor-pointer items-center justify-center rounded-[12px] border-2 border-nevo-violet bg-nevo-violet/14 px-3.5 text-base font-semibold text-nevo-navy shadow-elevation-1"
          >
            + 1/{parts}
          </button>
        </TapToAdd>
      )}
    </>
  );
}

/** D149's tray: "Tap to add", then the piece to tap. */
function TapToAdd({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-2.5">
      <span aria-hidden className="text-xs text-nevo-near-black/55">
        Tap to add
      </span>
      {children}
    </div>
  );
}

/** D149's tray piece, at its own size, in a 44px target. */
function TrayPiece({
  shape,
  label,
  onPlace,
}: {
  shape: string;
  label: string;
  onPlace: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPlace}
      className="flex size-11 cursor-pointer items-center justify-center"
    >
      <span
        className={cn(
          "box-border border-2 border-nevo-violet bg-nevo-violet/18 shadow-elevation-1",
          shape,
        )}
      />
    </button>
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
  ringed,
}: {
  rows: number;
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
  ringed: ReadonlySet<number>;
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
              data-build-row
              className="flex justify-center gap-2.5"
            >
              {Array.from({ length: parts }).map((_, cell) => {
                // Reading order: a row fills before the next one starts.
                const at = row * parts + cell;
                return (
                  <span
                    key={cell}
                    className={cn(
                      SQUARE,
                      at < placed ? SQUARE_FILLED : SQUARE_EMPTY,
                      ringed.has(at) && RING,
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {placed < target && (
        <TapToAdd>
          <TrayPiece
            shape="size-[34px] rounded-lg"
            label="Tap to add"
            onPlace={onPlace}
          />
        </TapToAdd>
      )}
    </>
  );
}

/**
 * A place-value build (D149): each column's places, as many as the
 * scaffold's mark for it, filled as the child taps that column's piece - a
 * flat, a rod or a unit. A column's piece goes from the tray once it is full,
 * and the build is done when every column is: nothing counts them together.
 * Each tray piece is named by its column's label where the payload gives one.
 */
function PlaceValueBuild({
  columns,
  placed,
  onPlace,
  reading,
}: {
  columns: ScaffoldQuantity[];
  placed: number[];
  onPlace: (column: number) => void;
  reading: boolean;
}) {
  const open = columns.flatMap((c, i) =>
    PIECES[i] && (placed[i] ?? 0) < c.count ? [i] : [],
  );
  return (
    <>
      <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div className="mt-3 flex flex-wrap items-end justify-center gap-5">
          {columns.map((column, i) => {
            const shape = PIECES[i];
            if (!shape) return null;
            return (
              <div
                key={i}
                data-build-column
                className="flex flex-col items-center gap-2.5"
              >
                <PieceStack shape={shape}>
                  {Array.from({ length: column.count }).map((_, n) => (
                    <Piece key={n} shape={shape} placed={n < (placed[i] ?? 0)} />
                  ))}
                </PieceStack>
                <ColumnLabel label={column.label} reading={reading} />
              </div>
            );
          })}
        </div>
      </div>
      {open.length > 0 && (
        <TapToAdd>
          {open.map((i) => (
            <TrayPiece
              key={i}
              shape={PIECES[i].tile}
              label={
                columns[i].label
                  ? `Tap to add, ${columns[i].label}`
                  : "Tap to add"
              }
              onPlace={() => onPlace(i)}
            />
          ))}
        </TapToAdd>
      )}
    </>
  );
}

/**
 * A number-line build (D149): "count along the line in steps: tap to add a
 * hop and move the marker on". The marker starts on the line's first
 * position, as a bar fills from its first cell - the wire carries no other
 * start - and moves one position a tap, until the stored count of hops is
 * made. A position the asked step names by its label is ringed.
 */
function LineBuild({
  parts,
  target,
  placed,
  onPlace,
  ringed,
}: {
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
  ringed: ReadonlySet<number>;
}) {
  return (
    <>
      <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div className="relative mx-[15px] mt-3 h-16">
          <LineTrack parts={parts} />
          {[...ringed].map((at) => (
            <span
              key={at}
              aria-hidden
              className={cn(
                "absolute top-[18px] size-[30px] -translate-x-1/2 rounded-full",
                RING,
              )}
              style={{ left: along(at, parts) }}
            />
          ))}
          <span
            aria-hidden
            data-bead
            className={BEAD}
            style={{ left: along(placed, parts) }}
          />
        </div>
      </div>
      {placed < target && (
        <TapToAdd>
          {/* D149's hop tile, 44px tall. */}
          <button
            type="button"
            onClick={onPlace}
            className="flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-[12px] border-2 border-nevo-violet bg-nevo-violet/14 px-3.5 text-[15px] font-semibold text-nevo-navy shadow-elevation-1"
          >
            +1
          </button>
        </TapToAdd>
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
