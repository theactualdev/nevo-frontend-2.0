"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { formFactor } from "@/hooks/useSignals";
import { AGE_BANDS, gridSpanConfig, type AgeBand } from "@/lib/profiling/bands";
import type { BaselineCapture } from "@/lib/profiling/capture";
import { cn } from "@/lib/utils";

/** What the device is, as the signal stream already tags it (G6). */
export type FormFactor = ReturnType<typeof formFactor>;

/**
 * The eight positions, as cells of the band's tile-memory lattice, numbered
 * from the top left (08a, "Order"). Fixed, so every child in a band reaches
 * the same distances in the same order: short, middle, long, short, long,
 * short, middle.
 */
export const MOTOR_ORDER: Record<number, readonly number[]> = {
  3: [4, 5, 6, 2, 1, 7, 8, 0],
  4: [5, 6, 12, 3, 7, 13, 14, 8],
  5: [12, 13, 20, 4, 9, 21, 22, 5],
};

/** The first two taps are practice. Flagged, never dropped: see `hit`. */
export const MOTOR_PRACTICE_TAPS = 2;

/**
 * 08a: "If ten seconds pass with no tap on the target, the step ends and the
 * baseline continues." Counted from the frame the target is painted.
 *
 * AN EXIT, NOT A READING OF THE CHILD. It decides nothing about them and
 * changes nothing they are given: the way out is identical to finishing all
 * eight, and the engine is sent the samples there are and how the step
 * ended. What it prevents is a step that cannot end.
 */
const IDLE_END_MS = 10_000;

/**
 * A FAILSAFE FOR THE VOICE, NOT A PACE. For Primary 1-3 the first target
 * waits for the spoken line to finish, and a speech engine that never reports
 * the end would leave a six-year-old looking at an empty square for ever.
 * Comfortably longer than the line takes to say.
 */
const VOICE_FAILSAFE_MS = 8_000;

/** The target is the band's tile size (08a): phone, then tablet up. */
const TARGET: Record<number, string> = {
  3: "size-[92px] sm:size-[104px]",
  4: "size-[78px] sm:size-[84px]",
  5: "size-[62px] sm:size-[66px]",
};

/** 08a's one line. No speed words: a comfortable pace is the comparator. */
const LINE = "Tap the square each time you see it.";
/** Primary 1-3 hear it instead, once, in 08a's spoken wording. */
const SPOKEN_LINE = "Touch the square each time you see it.";

/**
 * Whether the step runs on this device at all.
 *
 * NOT ON A CURSOR. 08a draws a phone and a tablet and says desktop is not
 * drawn: "a cursor is a different motion from a reach", and whether a
 * desktop baseline runs, or is only ever compared with another desktop
 * baseline, is open with Teslim (SCRUM-213). Until that is answered a cursor
 * device skips the step and the run records why, rather than putting cursor
 * timings where the engine expects reaches.
 */
export function motorStepRuns(device: FormFactor): boolean {
  return device !== "desktop";
}

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * 08a, the motor-speed step (SCRUM-214): eight clean samples of the child
 * tapping at a natural pace, so every timed activity after it can be read
 * against how long the physical reach takes (frontend section 3, "the motor
 * baseline is not optional"). It sits between the intro and Module 1.
 *
 * ONE LINE, A GROUND, ONE TARGET. The ground is a square at 90% of the
 * screen's short side, and positions are fractions of it, so a reach is the
 * same share of the space on a phone and a tablet. The lattice and the target
 * size are the band's tile-memory ones, so a sample is comparable to a tap in
 * the activity it corrects.
 *
 * NOTHING REACTS. No pressed state, sound, count, progress, timer, praise or
 * summary, before, during or after: anything that answers a tap tells the
 * child their taps are being judged. A touch outside the target does nothing
 * and the target stays where it is. The hit area is the target exactly.
 * There is no failed state, and the end is a straight cut to Module 1.
 *
 * NO ENTRY ANIMATION, so nothing moves under reduced motion either. D12 allows
 * up to 300ms of one provided it is left out of the tap's latency; 08a's build
 * note draws none, and says the sample starts on the first frame the target
 * is painted at full opacity. That frame is stamped here with
 * `performance.now()` inside the animation frame that paints it - not when
 * the tap before it landed, or when React rendered it - so nothing before
 * the target was visible is counted.
 *
 * WHAT IS KEPT is every tap as it happened: which target, its cell, the
 * latency, whether it was practice, and the form factor. The engine takes the
 * median of taps three to eight; the device takes none (rule 3). Each tap
 * leaves as one trial in `baselineTrials`; a trial has no field for the form
 * factor yet, which is with backend.
 *
 * NO KEYBOARD PATH, deliberately. A key press is not a reach, so it would put
 * the wrong motion in the baseline. A child who cannot tap is not stranded:
 * the step ends itself after ten seconds without a tap, the same way it ends
 * after eight.
 */
export function MotorStep({
  band,
  formFactor,
  capture,
  onComplete,
}: {
  band: AgeBand;
  /** Read once when the run starts; every sample carries it. */
  formFactor: FormFactor;
  capture?: BaselineCapture;
  onComplete: () => void;
}) {
  const n = gridSpanConfig(band).n;
  const order = MOTOR_ORDER[n] ?? MOTOR_ORDER[4];

  /*
   * PRIMARY 1-3 HEAR THE LINE AND READ NOTHING (08a). The first target waits
   * for the voice; the line's slot stays empty so the ground does not move.
   * Where the device cannot speak, the target simply appears. NOT DRAWN: what
   * a child that young is told when there is no voice; the written line is
   * not put back in its place.
   */
  const spoken = band === AGE_BANDS.P13;
  const [voiced] = useState(() => spoken && canSpeak());
  const [heard, setHeard] = useState(false);
  const [step, setStep] = useState(0);
  const [ended, setEnded] = useState(false);

  /** `performance.now()` on the frame the current target was painted. */
  const visibleAt = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const over = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finish = useCallback(
    (reason: "complete" | "idle") => {
      if (over.current) return;
      over.current = true;
      if (idle.current) clearTimeout(idle.current);
      capture?.record("motor_end", { reason, grid: n, formFactor });
      void capture?.persist();
      setEnded(true);
      onCompleteRef.current();
    },
    [capture, n, formFactor],
  );

  useEffect(() => {
    if (!voiced) return;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setHeard(true);
    };
    const line = new SpeechSynthesisUtterance(SPOKEN_LINE);
    // A shade slow, for the reason `SentenceDotModule` gives.
    line.rate = 0.85;
    // The cleanup below holds `line`, so it is not collected before `end`.
    line.onend = go;
    line.onerror = go;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(line);
    const failsafe = setTimeout(go, VOICE_FAILSAFE_MS);
    return () => {
      done = true;
      clearTimeout(failsafe);
      line.onend = null;
      line.onerror = null;
      window.speechSynthesis.cancel();
    };
  }, [voiced]);

  const showing = (!voiced || heard) && !ended;
  const cell = order[Math.min(step, order.length - 1)];

  /*
   * THE SAMPLE STARTS ON THE PAINTED FRAME. The animation frame requested
   * after the commit that put this target in the page is the frame that
   * paints it, so that is where the clock starts - and where the ten
   * seconds start, for the first target as for every other.
   */
  useLayoutEffect(() => {
    if (!showing) return;
    visibleAt.current = null;
    const frame = requestAnimationFrame(() => {
      visibleAt.current = performance.now();
      idle.current = setTimeout(() => finish("idle"), IDLE_END_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (idle.current) clearTimeout(idle.current);
      idle.current = null;
    };
  }, [showing, step, finish]);

  /**
   * Pointer-down inside the target ends the sample. The target goes on this
   * frame and the next one is painted on the next.
   *
   * PRACTICE TAPS ARE FLAGGED, NOT DROPPED. Design discards the first two;
   * discarding is part of computing the baseline, which is the engine's, so
   * they travel marked `practice` and the engine leaves them out.
   */
  const hit = () => {
    const tappedAt = performance.now();
    const shownAt = visibleAt.current;
    // Before its frame is stamped the target has not been seen.
    if (over.current || shownAt === null) return;
    visibleAt.current = null;
    if (idle.current) clearTimeout(idle.current);
    capture?.record("motor_tap", {
      target: step,
      cell,
      latencyMs: tappedAt - shownAt,
      practice: step < MOTOR_PRACTICE_TAPS,
      formFactor,
    });
    if (step + 1 >= order.length) finish("complete");
    else setStep(step + 1);
  };

  return (
    <div className="relative h-[100dvh] w-full touch-manipulation overflow-hidden bg-nevo-cream text-nevo-near-black select-none [-webkit-tap-highlight-color:transparent]">
      {!spoken && (
        <p className="absolute inset-x-6 top-[72px] m-0 text-center text-[17px] leading-[1.4] font-medium sm:top-24 sm:text-xl">
          {LINE}
        </p>
      )}
      <div className="absolute top-1/2 left-1/2 size-[min(90vw,90dvh)] -translate-x-1/2 translate-y-[calc(-50%+24px)] rounded-[12px] bg-nevo-cream-elevated">
        {showing && (
          <div
            data-testid="motor-target"
            data-cell={cell}
            aria-hidden
            onPointerDown={hit}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 cursor-default rounded-[12px] bg-nevo-navy",
              TARGET[n] ?? TARGET[4],
            )}
            style={{
              left: `${(((cell % n) + 0.5) / n) * 100}%`,
              top: `${((Math.floor(cell / n) + 0.5) / n) * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
