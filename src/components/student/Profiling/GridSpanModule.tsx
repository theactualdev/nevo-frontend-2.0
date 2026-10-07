"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GridSpanConfig } from "@/lib/profiling/bands";
import { tapPoint, type BaselineCapture } from "@/lib/profiling/capture";
import { AvatarBubble, ProfilingShell } from "./ProfilingShell";

/**
 * Playback pacing (BP-M1 playable, 11:202). The highlight is per band -
 * `GridSpanConfig.litMs` - and one pace holds for the whole module: no band
 * slows after a miss (D74, 6 Oct), so a replay plays exactly as the first
 * playback did.
 */
const GAP_MS = 280;
const PLAYBACK_LEAD_MS = 560;
/** The wrong-tap nudge: grid locks, soft-violet ring, then the pattern replays. */
const NUDGE_MS = 1500;
/**
 * Beats between rounds and into the settle.
 *
 * NOTHING LOADS IN THIS BEAT, so it carries no "Loading next round": the next
 * sequence is drawn on the device (`genSeq`). Module 1's frame (09) draws that
 * state anyway, and design dropped it on 1 Oct (D14).
 */
const NEXT_ROUND_MS = 750;
const END_AT_MAX_MS = 650;
const SETTLE_MS = 1700;
/** Three misses at a length ends the module seamlessly - never a failure wall. */
const MAX_RETRIES = 3;

/**
 * SS dual-task checks, answered between watch and recall.
 *
 * DESIGN RULING, 30 SEP 2026 - KEEP AS BUILT. NOT A DEVIATION.
 * The true/false sum over the dimmed grid is drawn in neither the Grid Span
 * frame nor the playable prototype, and QA reported it as broken. Design and QA
 * then confirmed it is intended, and design approved it on 30 Sep. A check
 * against the frames will not find it there; that is expected. Do not remove
 * it to match the frames. (Recorded in CONSOLE_INVENTORY, "S-D. Not a gap".)
 *
 * The note here said "never marked", and the code agreed: `answerCheck`
 * recorded which button was pressed and nothing about whether it was right,
 * and `reduceGridSpan` never read the event at all. So the SS band's one
 * distinguishing feature reached the vector in no form whatsoever.
 *
 * That matters more than a missing field. A dual task works by imposing load
 * WHILE the sequence is held - and a child who taps True at every check
 * without reading it is not dual-tasking, they are pressing a button. Unmarked,
 * that child is indistinguishable from one who did both. Scoring the check is
 * how you tell whether the load was actually carried.
 *
 * Never SHOWN to the child, which is what the frames mean by no marking: no
 * tick, no red, no feedback of any kind.
 *
 * The daily warm-up's SS tile round runs the same checks (D81, 6 Oct): "A
 * warm-up that measures a different construct from the baseline cannot
 * recalibrate it", and the SS baseline is a complex span because of them.
 */
export const DUAL_CHECKS: { text: string; isTrue: boolean }[] = [
  { text: "7 + 5 = 13", isTrue: false },
  { text: "9 - 4 = 5", isTrue: true },
  { text: "6 + 6 = 12", isTrue: true },
  { text: "8 - 3 = 4", isTrue: false },
];

/** What a child is asked while a check is up, here and in the warm-up. */
export const DUAL_CHECK_PROMPT = "Is this true or false?";

type Step = "watching" | "check" | "input" | "wrong" | "between" | "settling";

/**
 * Per-band tile sizing. From `sm` up these are the frame's tileSize map, exact.
 *
 * BELOW `sm` THE TILES FILL THEIR COLUMN INSTEAD OF A FIXED SIZE (QA, 30 Sep).
 * The frame's phone sizes were fixed pixels, so on a phone held upright the
 * grid sat small in the middle of a tall screen - and on a 320px phone the
 * 5x5 band's 62px tiles were forced into 56px columns and overlapped. Now the
 * grid takes the width it has (see `PHONE_GRID`) and each tile is a square of
 * its column, so the grid is as large as the screen allows and never overlaps.
 *
 * Shared with the daily warm-up's tile task, which runs this module's grid
 * per band (D17).
 */
export const TILE: Record<number, { m: string; g: string }> = {
  3: { m: "aspect-square w-full sm:size-[104px]", g: "gap-1.5 sm:gap-2.5" },
  4: { m: "aspect-square w-full sm:size-[84px]", g: "gap-1.5 sm:gap-2.5" },
  5: { m: "aspect-square w-full sm:size-[66px]", g: "gap-1.5 sm:gap-[9px]" },
};

/**
 * How wide the grid is on a phone: the screen's width less the shell's
 * padding, but never so tall that the bubble, the grid and the SS dual task's
 * buttons stop fitting on one screen (the 380px is what sits above and below
 * the grid), and never wider than 420px. From `sm` up the frame's fixed tile
 * sizes decide it again.
 */
const PHONE_GRID =
  "w-[min(calc(100vw-40px),calc(100dvh-380px),420px)] sm:w-auto";

/**
 * Module 1 - Spatial Grid Span (BP-M1, working memory). Tiles light in
 * sequence; the student taps them back in reverse. Adaptive: the span starts at
 * the band's start and grows by one per clean recall to the band ceiling, each
 * from the Module 1 frame (see `gridSpanConfig`), and playback keeps one
 * pace throughout, misses or not (D74). A wrong tap gives a gentle
 * soft-violet nudge (the tile never fills, nothing shakes, nothing is "wrong"),
 * locks the grid for a beat, and replays the same pattern; three misses at a
 * length end the module seamlessly. The SS band interleaves a true/false check
 * between watch and recall (dual task). No timers, no scores, no red.
 *
 * Every playback beat and tap is captured with `performance.now()` via the
 * shared BaselineCapture (SCRUM-104 data contract).
 */
export function GridSpanModule({
  config,
  capture,
  onComplete,
}: {
  config: GridSpanConfig;
  capture?: BaselineCapture;
  onComplete: () => void;
}) {
  const { n, spanStart, spanMax, litMs, dual, instruction } = config;
  const cells = n * n;

  const [step, setStep] = useState<Step>("watching");
  const [sequence, setSequence] = useState<number[]>([]);
  const [litIndex, setLitIndex] = useState(-1);
  const [inputPos, setInputPos] = useState(0);
  const [tapped, setTapped] = useState<ReadonlySet<number>>(() => new Set());
  const [wrongCell, setWrongCell] = useState(-1);
  const [firstRound, setFirstRound] = useState(true);
  const [check, setCheck] = useState(DUAL_CHECKS[0]);

  const retries = useRef(0);
  const checkIdx = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const genSeq = useCallback(
    (len: number) => {
      const pool = [...Array(cells).keys()];
      const out: number[] = [];
      for (let i = 0; i < len; i++)
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    },
    [cells],
  );

  const settle = useCallback(() => {
    clearTimers();
    setStep("settling");
    capture?.record("module_end", { module: "grid_span" });
    void capture?.persist();
    after(SETTLE_MS, () => onCompleteRef.current());
  }, [after, capture, clearTimers]);

  const startRound = useCallback(
    (seq: number[]) => {
      clearTimers();
      setStep("watching");
      setSequence(seq);
      setLitIndex(-1);
      setInputPos(0);
      setTapped(new Set());
      setWrongCell(-1);
      capture?.record("playback_start", {
        length: seq.length,
        litMs,
        gapMs: GAP_MS,
      });
      let t = PLAYBACK_LEAD_MS;
      seq.forEach((cell) => {
        after(t, () => setLitIndex(cell));
        after(t + litMs, () => setLitIndex(-1));
        t += litMs + GAP_MS;
      });
      after(t + 150, () => {
        setLitIndex(-1);
        if (dual) {
          const next = DUAL_CHECKS[checkIdx.current % DUAL_CHECKS.length];
          checkIdx.current += 1;
          setCheck(next);
          setStep("check");
          capture?.record("check_shown", { check: next.text });
        } else {
          setStep("input");
          capture?.record("input_start", { length: seq.length });
        }
      });
    },
    [after, capture, clearTimers, dual, litMs],
  );

  // Kick off round 1 on a zero-delay timer: the cleanup cancels it, so
  // StrictMode's simulated unmount/remount reschedules cleanly (a ref guard
  // here would leave the module frozen after the simulated cleanup cleared
  // the playback timers).
  useEffect(() => {
    const t = setTimeout(() => startRound(genSeq(spanStart)), 0);
    return () => clearTimeout(t);
  }, [genSeq, spanStart, startRound]);

  const answerCheck = (answer: boolean, e: React.MouseEvent) => {
    if (step !== "check") return;
    capture?.record("check_answer", {
      check: check.text,
      answer,
      correct: answer === check.isTrue,
      ...tapPoint(e),
    });
    setStep("input");
    capture?.record("input_start", { length: sequence.length });
  };

  const tapTile = (cell: number, e: React.MouseEvent) => {
    if (step !== "input") return;
    const expected = [...sequence].reverse();
    const correct = cell === expected[inputPos];
    capture?.record("tap", {
      cell,
      correct,
      posInSeq: inputPos,
      length: sequence.length,
      ...tapPoint(e),
    });
    if (correct) {
      const nextTapped = new Set(tapped).add(cell);
      const nextPos = inputPos + 1;
      if (nextPos === sequence.length) {
        setTapped(nextTapped);
        setInputPos(nextPos);
        setStep("between");
        setFirstRound(false);
        capture?.record("round_complete", { length: sequence.length });
        if (sequence.length >= spanMax) {
          after(END_AT_MAX_MS, settle);
        } else {
          retries.current = 0;
          after(NEXT_ROUND_MS, () => startRound(genSeq(sequence.length + 1)));
        }
      } else {
        setTapped(nextTapped);
        setInputPos(nextPos);
      }
    } else {
      retries.current += 1;
      setWrongCell(cell);
      setStep("wrong");
      const fails = retries.current;
      after(NUDGE_MS, () => {
        setWrongCell(-1);
        if (fails >= MAX_RETRIES) settle();
        else startRound(sequence); // the SAME pattern, watched again
      });
    }
  };

  const interactive = step === "input";
  const settling = step === "settling";
  const dimmed = step === "check";
  const tile = TILE[n] ?? TILE[4];

  const bubbleText = settling
    ? ""
    : step === "check"
      ? DUAL_CHECK_PROMPT
      : step === "input" || step === "wrong"
        ? "Now tap them in reverse"
        : firstRound
          ? instruction
          : "Watch carefully";

  return (
    <ProfilingShell filled={settling ? 1 : 0} active={settling ? -1 : 0}>
      {!settling && bubbleText && <AvatarBubble text={bubbleText} />}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6">
        {settling ? (
          <SettleBadge />
        ) : (
          <div className="relative">
            <div
              className={cn("grid", PHONE_GRID, tile.g)}
              style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: cells }, (_, i) => {
                const lit = i === litIndex;
                const done = tapped.has(i);
                const wrong = i === wrongCell;
                return (
                  <button
                    key={i}
                    type="button"
                    tabIndex={interactive ? 0 : -1}
                    aria-hidden={!interactive}
                    onClick={(e) => tapTile(i, e)}
                    className={cn(
                      "flex items-center justify-center rounded-[12px] transition-[transform,box-shadow] duration-150",
                      tile.m,
                      lit &&
                        "scale-105 bg-nevo-violet shadow-[0_6px_18px_rgba(154,156,203,0.5)] motion-safe:animate-nevo-tile-hi",
                      done && "bg-nevo-navy",
                      wrong &&
                        "border-2 border-nevo-violet bg-nevo-cream shadow-[0_0_0_3px_rgba(154,156,203,0.35)]",
                      !lit &&
                        !done &&
                        !wrong &&
                        "border-2 border-nevo-navy bg-nevo-cream",
                      interactive ? "cursor-pointer" : "pointer-events-none",
                      dimmed && "opacity-40",
                    )}
                  >
                    {done && (
                      <Check
                        className="size-[34%] min-h-5 min-w-5 text-nevo-cream"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Change-of-mind hint on a wrong tap - informational, never alarmed */}
            <p
              className={cn(
                "absolute inset-x-0 -bottom-8 text-center text-[13px] text-nevo-violet transition-opacity duration-300",
                step === "wrong" ? "opacity-100" : "opacity-0",
              )}
              aria-hidden={step !== "wrong"}
            >
              Try another
            </p>

            {/* SS dual task: the check floats over the dimmed grid */}
            {step === "check" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-[12px] bg-nevo-cream px-[22px] py-3.5 text-xl font-medium tracking-[0.01em] text-nevo-navy shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:text-2xl">
                  {check.text}
                </span>
              </div>
            )}
          </div>
        )}

        {step === "check" && (
          <div className="flex gap-3">
            <CheckButton label="True" onClick={(e) => answerCheck(true, e)} />
            <CheckButton label="False" onClick={(e) => answerCheck(false, e)} />
          </div>
        )}
      </div>
    </ProfilingShell>
  );
}

/** A dual-task answer: 48px tall, the floor 09 bumps these to. */
export function CheckButton({
  label,
  onClick,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 min-w-[132px] cursor-pointer rounded-[10px] border-2 border-nevo-navy bg-nevo-cream text-base font-semibold text-nevo-navy transition-transform active:scale-[0.96]"
    >
      {label}
    </button>
  );
}

/** "That's it. Saved." - the module's quiet settle, no score, no celebration. */
export function SettleBadge() {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
        <Check className="size-8 text-nevo-cream" strokeWidth={2.6} />
      </span>
      <span className="text-[17px] font-semibold text-nevo-navy">
        That&apos;s it. Saved.
      </span>
    </div>
  );
}
