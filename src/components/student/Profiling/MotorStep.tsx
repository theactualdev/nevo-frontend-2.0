"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Pointer } from "lucide-react";
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

/**
 * The Primary 1-3 demonstration's beats, from the moment it starts: the
 * target alone, then a hand reaching it, pressing it, both gone, and a beat
 * of empty ground before the first real target. See `Demonstration`.
 */
const DEMO_BEATS = [
  ["reach", 400],
  ["press", 1_100],
  ["gone", 1_350],
  ["done", 1_950],
] as const;
type DemoBeat = "target" | (typeof DEMO_BEATS)[number][0];

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
 * the activity it corrects. Primary 1-3, who read nothing, are first shown
 * one tap (D122, `Demonstration`), which is not a sample.
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
 * leaves as one trial in `baselineTrials`, and the form factor goes beside
 * the trials on the request (`baselineRunContext`, B76).
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
   * PRIMARY 1-3 HEAR THE LINE AND READ NOTHING (08a). The line's slot stays
   * empty so the ground does not move. Where the device cannot speak there is
   * no voice to wait for, and the written line is not put back in its place.
   *
   * AND THEN THEY ARE SHOWN (D122, 6 Oct): "For P1 to 3 children who cannot
   * yet read the instruction, demonstrate rather than instruct: show one
   * target appearing and being tapped, then begin." After the voice, or at
   * once without one, `Demonstration` plays, and the first real target comes
   * after it.
   */
  const spoken = band === AGE_BANDS.P13;
  const [voiced] = useState(() => spoken && canSpeak());
  const [heard, setHeard] = useState(false);
  const [demo, setDemo] = useState<DemoBeat>(spoken ? "target" : "done");
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
    (reason: "complete" | "idle", untapped?: number) => {
      if (over.current) return;
      over.current = true;
      if (idle.current) clearTimeout(idle.current);
      /*
       * An idle end names the target left on screen, which leaves as a
       * skipped trial (`baselineTrials`, B76): the engine is told how the
       * step ended, not left to count the samples.
       */
      capture?.record("motor_end", {
        reason,
        grid: n,
        formFactor,
        ...(untapped === undefined
          ? {}
          : { target: untapped, practice: untapped < MOTOR_PRACTICE_TAPS }),
      });
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

  /** The voice has had its say, or there was none to wait for. */
  const ready = !voiced || heard;

  // The demonstration's beats, once the voice is done. On timers, so nothing
  // is set synchronously in the effect; the cleanup cancels them all.
  useEffect(() => {
    if (!spoken || !ready) return;
    const beats = DEMO_BEATS.map(([beat, at]) =>
      setTimeout(() => setDemo(beat), at),
    );
    return () => beats.forEach(clearTimeout);
  }, [spoken, ready]);

  const showing = ready && demo === "done" && !ended;
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
      idle.current = setTimeout(() => finish("idle", step), IDLE_END_MS);
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
        {ready && demo !== "done" && (
          <Demonstration beat={demo} target={TARGET[n] ?? TARGET[4]} />
        )}
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

/**
 * The Primary 1-3 demonstration (D122, 6 Oct): one target appears in the
 * middle of the ground, a hand reaches it and taps it, both go, and the step
 * begins. Design's sentence is the whole of it; no frame draws it, so it
 * borrows what the step already has - the band's target, no words - and adds
 * only the hand.
 *
 * NOT A SAMPLE, AND NOT A TARGET. It takes no touch at all (`pointer-events`
 * off, so a child copying the hand meets the ground, which does nothing),
 * nothing about it is recorded, and the ten seconds wait for the first real
 * target. The tap it shows is the hand's, so the target going is the same
 * thing a real one does when tapped: it is removed, with nothing else.
 *
 * Under reduced motion the hand does not travel; it is simply there on the
 * target when it reaches it.
 */
function Demonstration({ beat, target }: { beat: DemoBeat; target: string }) {
  if (beat === "gone") return null;
  return (
    <div
      data-testid="motor-demo"
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      <div
        className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-nevo-navy",
          target,
        )}
      />
      {/* The pointer's fingertip sits a third across and near the top of
          its box, so the box is offset to put that tip on the centre. */}
      <Pointer
        strokeWidth={1.8}
        className={cn(
          "absolute top-[calc(50%-5px)] left-[calc(50%-19px)] size-14 fill-nevo-cream text-nevo-near-black ease-calm motion-safe:transition-[translate,opacity,scale] motion-safe:duration-[var(--duration-break-entry)]",
          beat === "target"
            ? "translate-x-[64px] translate-y-[96px] opacity-0"
            : "translate-x-0 translate-y-0 opacity-100",
          beat === "press" && "scale-90",
        )}
      />
    </div>
  );
}
