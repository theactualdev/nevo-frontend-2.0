"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tapPoint, type BaselineCapture } from "@/lib/profiling/capture";

/**
 * The frames' commit beat: a tapped control presses violet, then the next
 * trial. No "Loading next pair" in it, though Module 2's frame draws one:
 * every trial is already on the device, and design dropped that state on
 * 1 Oct (D14).
 */
const PICK_BEAT_MS = 440;
/** Every module ends on the shared "That's it. Saved." settle. */
const SETTLE_MS = 1700;

/** What a tap handler hands over so the pick knows where the finger was. */
type TapEvent = { clientX: number; clientY: number; detail: number };

/**
 * Shared trial engine for Modules 2-4: a fixed list of trials across one or two
 * activities, tap-to-answer with a brief pressed beat, no feedback of any kind,
 * a settle at the end. Each pick is captured with its response time
 * (`performance.now()` from trial presentation to tap) and where the tap
 * landed.
 *
 * WHERE A TRIAL HAS A STIMULUS PHASE, the response time starts when it ends.
 * The dot arrays show for a fixed time before the buttons arm, and the P1-3
 * sentence is spoken before the pictures mean anything, so timing from
 * presentation added the reveal (now different per band) or the device's
 * speech to every answer - and the offset went nowhere. A module with such a
 * phase calls `open()` when the child can actually answer; the pick then times
 * from there and carries `openAfterMs`, the offset, so nothing is folded in
 * silently. An act with no such phase times from presentation, as before.
 *
 * An act listed in `opensLate` that is answered BEFORE it opens - a child who
 * taps the bus while the sentence is still being said - records `rtMs: null`
 * and `beforeOpen: true`. There is no honest number for that: timing it from
 * presentation would put the device's speech back in, and the reducer already
 * leaves a missing time out of the mean rather than counting it as zero.
 */
export function useTrialRunner({
  module,
  counts,
  capture,
  onComplete,
  opensLate = [],
}: {
  /** Capture tag, e.g. "pattern_flanker". */
  module: string;
  /** Ordered activities and their trial counts, e.g. [["pattern", 3], ["flanker", 3]]. */
  counts: [string, number][];
  capture?: BaselineCapture;
  onComplete: () => void;
  /** Acts whose trials open for answers only once their stimulus has run. */
  opensLate?: string[];
}) {
  const [actIdx, setActIdx] = useState(0);
  const [trial, setTrial] = useState(0);
  const [picked, setPicked] = useState(-1);
  const [settling, setSettling] = useState(false);

  const shownAt = useRef(0);
  /** When this trial's response window opened; null until (or unless) it does. */
  const openAt = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const act = counts[Math.min(actIdx, counts.length - 1)][0];

  // Stamp presentation time whenever the visible trial changes.
  useEffect(() => {
    shownAt.current = performance.now();
    openAt.current = null;
    capture?.record("trial_shown", { module, act, trial });
  }, [module, act, trial, capture]);

  /**
   * The stimulus has finished and the child can answer from here. Stable per
   * trial, so a module can schedule it from an effect keyed on the trial.
   *
   * Only the FIRST call in a trial counts: the response window opened when the
   * child could first answer, and a replay of the sentence (recorded on its
   * own) does not move that moment later.
   */
  const open = useCallback(() => {
    if (openAt.current !== null) return;
    openAt.current = performance.now();
    capture?.record("response_open", {
      module,
      act,
      trial,
      openAfterMs: Math.round(openAt.current - shownAt.current),
    });
  }, [module, act, trial, capture]);

  const pick = (
    choice: number,
    detail?: Record<string, unknown>,
    e?: TapEvent,
  ) => {
    if (settling || picked !== -1) return;
    const now = performance.now();
    const opened = openAt.current;
    const early = opened === null && opensLate.includes(act);
    const rtMs = early ? null : Math.round(now - (opened ?? shownAt.current));
    capture?.record("trial_pick", {
      module,
      act,
      trial,
      choice,
      rtMs,
      ...(opened !== null
        ? { openAfterMs: Math.round(opened - shownAt.current) }
        : {}),
      ...(early ? { beforeOpen: true } : {}),
      ...tapPoint(e),
      ...detail,
    });
    setPicked(choice);
    timers.current.push(
      setTimeout(() => {
        let a = actIdx;
        let t = trial + 1;
        if (t >= counts[a][1]) {
          a += 1;
          t = 0;
        }
        if (a >= counts.length) {
          setSettling(true);
          capture?.record("module_end", { module });
          void capture?.persist();
          timers.current.push(setTimeout(() => onCompleteRef.current(), SETTLE_MS));
          return;
        }
        setActIdx(a);
        setTrial(t);
        setPicked(-1);
      }, PICK_BEAT_MS),
    );
  };

  return { act, trial, picked, settling, pick, open };
}
