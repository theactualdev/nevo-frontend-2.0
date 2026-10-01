"use client";

import { useEffect, useRef, useState } from "react";
import { intelligenceApi } from "@/lib/api";
import type {
  AdaptSegment,
  RuntimeSignals,
} from "@/lib/api/intelligence";
import { BREAK_TYPES, type BreakType } from "@/lib/constants";
import { toAdaptationPlan } from "@/lib/lessons/adaptation";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * The engine's mid-lesson read, from `POST /api/intelligence/adapt` in
 * `in_lesson` mode. The ONLY source of a break offer on a live lesson: the
 * client's own 20-minute timer is gone, because when to break is the
 * engine's call (rule 3, and frontend §5b: "No local timer").
 *
 * ASKED AT SEGMENT BOUNDARIES, and again when the child does something the
 * request reports - a replay, an answer, a declined offer. Those counts are
 * about the segment the child is on, so asked only on the way in they were
 * always zero; frontend §1 has the state read "after every interaction event".
 * Nothing is asked on a timer and nothing while a child simply reads. The
 * clock is read when the request is built, never during render.
 */

/**
 * What the player observes. Every field is a fact, not a measurement.
 *
 * THE HOOK KEEPS THE CLOCKS. It would be natural to pass elapsed times in, but
 * the caller cannot produce them honestly: `Date.now()` during render is
 * impure (`react-hooks/purity`), and holding them in refs means reading
 * `ref.current` during render, which `react-hooks/refs` rejects for good
 * reason - a ref read while rendering is a value React never promised to be
 * current. So the caller passes only what it already renders from, and
 * everything time-shaped is tracked here, in effects.
 *
 * The counts are COUNTS - what the child did, tallied, never weighed. The
 * contract's scores and its two "below baseline" flags stay unsent: those are
 * measurements of a child this app cannot make (see `RuntimeSignals`).
 */
export interface RuntimeState {
  currentSegmentId: string | null;
  currentModality: string;
  availableModalities: string[];
  midpointReached: boolean;
  /** Replays on the segment the child is on. */
  replayCountOnSegment: number;
  /**
   * In-lesson answers wrong in a row - quick checks and calculation steps. A
   * right answer ends the run. The after-lesson check is not in-lesson.
   */
  consecutiveErrors: number;
  /** Modalities offered and turned down this session, each once. */
  declinedModalities: string[];
  /** Every "Not now" to a modality offer this session. */
  sessionDeclineCount: number;
  /** Whether an offer has been on screen on this segment. */
  sameSegmentSuggestionShown: boolean;
  /** Segments entered since an offer was last on screen; null if none yet. */
  segmentsSinceLastSuggestion: number | null;
  /** Breaks finished this session. Each one ends a stretch of work. */
  breaksTaken: number;
}

export interface RuntimeAdaptation {
  /**
   * A break the engine suggests NOW, or null.
   *
   * Always surfaced as an offer the child can decline, never inserted: the
   * player already separates `breakAfter` (inserted on the way out) from
   * `offerBreak` (accept/decline), and a break a child did not ask for and
   * cannot refuse is the more intrusive of the two.
   */
  offeredBreak: BreakType | null;
  /** Why, in the engine's words - for logging, never for a child to read. */
  reason: string | null;
  /**
   * The segment this answer was asked about. Between the child moving on and
   * the next answer landing, the last one is still here - and it was about
   * the segment they left, so it is not an offer for the one they are on.
   */
  segmentId: string | null;
  /**
   * EVERYTHING ELSE THE ENGINE SAID MID-LESSON, which used to be discarded.
   *
   * The `in_lesson` response carries the same instruction, hint, guided
   * questions, scaffolding and modality suggestion as the load-time one - and
   * only `breakSuggestion` was kept. So a simplify, a slower, a hint or a
   * Socratic prompt decided while the child was working never reached them.
   * Translated through `toAdaptationPlan`, so it gets exactly the load-time
   * clamps: nothing a segment cannot render, no hint under the wrong action,
   * never the engine's reasoning. Null until the engine has answered.
   */
  plan: AdaptationPlan | null;
}

const BREAK_VALUES: readonly string[] = Object.values(BREAK_TYPES);

function asBreakType(value: string | null | undefined): BreakType | null {
  return value && BREAK_VALUES.includes(value) ? (value as BreakType) : null;
}

export function useRuntimeAdaptation(
  lessonId: string | undefined,
  segments: AdaptSegment[] | undefined,
  /** Live lessons only - a mock's ids mean nothing to the engine. */
  enabled: boolean,
  runtime: RuntimeState,
  /** The built lesson, so the engine's rows are clamped to what it renders. */
  lesson: Lesson | null = null,
): RuntimeAdaptation {
  const [result, setResult] = useState<RuntimeAdaptation>({
    offeredBreak: null,
    reason: null,
    segmentId: null,
    plan: null,
  });
  // Read at response time through a ref, like the runtime state, so a new
  // lesson object does not re-fire the request.
  const lessonRef = useRef(lesson);
  useEffect(() => {
    lessonRef.current = lesson;
  }, [lesson]);

  // The player re-renders constantly (timers, scroll, density). Reading the
  // runtime through a ref keeps it out of the effect's dependencies, so the
  // request fires on the moments below alone and not on every tick.
  const latest = useRef(runtime);
  useEffect(() => {
    latest.current = runtime;
  }, [runtime]);

  const segmentId = runtime.currentSegmentId;
  const modality = runtime.currentModality;
  // What the child did that the engine is told about, as values rather than
  // through the ref - a change in any of them is a reason to ask again.
  const replays = runtime.replayCountOnSegment;
  const errors = runtime.consecutiveErrors;
  const declines = runtime.sessionDeclineCount;
  const breaksTaken = runtime.breaksTaken;

  // The clocks, kept here so nothing reads a ref while rendering.
  const openedAt = useRef(0);
  const segmentStartedAt = useRef(0);
  const modalityShifts = useRef(0);
  const last = useRef<{ segmentId: string | null; modality: string } | null>(
    null,
  );

  useEffect(() => {
    if (openedAt.current === 0) openedAt.current = performance.now();
  }, []);

  /*
   * A BREAK ENDS A STRETCH OF CONTINUOUS WORK. `continuousMinutes` counted
   * from the lesson opening and never stopped, so a child back from a break
   * was reported as still on the same unbroken run - which is the reading the
   * engine's `time_threshold` offers a break on.
   */
  useEffect(() => {
    if (breaksTaken > 0) openedAt.current = performance.now();
  }, [breaksTaken]);

  // A new segment restarts the segment clock. Runs before the request effect
  // below on the same change, so the request sees the fresh start.
  useEffect(() => {
    segmentStartedAt.current = performance.now();
  }, [segmentId]);

  /*
   * A SHIFT IS A CHANGE WITHIN A SEGMENT - an offer taken. Every segment opens
   * in its own modality, and counting those openings reported a child who
   * changed nothing as one who had switched at every segment.
   */
  useEffect(() => {
    const prev = last.current;
    if (prev && prev.segmentId === segmentId && prev.modality !== modality) {
      modalityShifts.current += 1;
    }
    last.current = { segmentId, modality };
  }, [segmentId, modality]);

  useEffect(() => {
    if (!enabled || !lessonId || !segments?.length || !segmentId) return;
    let active = true;
    // Monotonic (rule 4): every duration below is sent to the engine, and a
    // wall clock that jumps would send negatives or fail validation.
    const now = performance.now();

    const state = latest.current;
    const signals: RuntimeSignals = {
      currentSegmentId: state.currentSegmentId,
      currentModality: state.currentModality,
      availableModalities: state.availableModalities,
      // Worked out here, from the hook's own clocks - see `RuntimeState`.
      continuousMinutes: openedAt.current
        ? Math.max(0, (now - openedAt.current) / 60_000)
        : 0,
      currentSegmentElapsedSeconds: segmentStartedAt.current
        ? Math.max(0, Math.round((now - segmentStartedAt.current) / 1000))
        : 0,
      midpointReached: state.midpointReached,
      sessionModalityShiftCount: modalityShifts.current,
      replayCountOnSegment: state.replayCountOnSegment,
      consecutiveErrors: state.consecutiveErrors,
      declinedModalities: state.declinedModalities,
      sessionDeclineCount: state.sessionDeclineCount,
      sameSegmentSuggestionShown: state.sameSegmentSuggestionShown,
      segmentsSinceLastSuggestion: state.segmentsSinceLastSuggestion,
      /*
       * NOT SENT: `secondsSinceLastAdaptation`. What went out under that name
       * was the time since this hook last ASKED - in practice the last
       * segment's dwell - and no adaptation is involved in that at all. Which
       * moment the engine counts from is backend's to say; until it does, a
       * mislabelled number is worse than the contract's own null.
       */
    };
    const askedFor = state.currentSegmentId;

    void intelligenceApi
      .getAdaptation(lessonId, segments, { mode: "in_lesson", signals })
      .then((res) => {
        if (!active) return;
        const built = lessonRef.current;
        setResult({
          offeredBreak: asBreakType(res.breakSuggestion?.breakType),
          reason: res.breakSuggestion?.reason ?? null,
          segmentId: askedFor,
          plan: built ? toAdaptationPlan(res, built) : null,
        });
      })
      .catch(() => {
        // A failed read is not "no break needed", but it is not grounds to
        // interrupt a child either, so it offers none. Nor is it an
        // instruction: the plan falls back to the load-time one rather than
        // to "the engine now says nothing".
        if (active)
          setResult((prev) => ({
            offeredBreak: null,
            reason: null,
            segmentId: prev.segmentId,
            plan: prev.plan,
          }));
      });

    return () => {
      active = false;
    };
  }, [enabled, lessonId, segments, segmentId, replays, errors, declines]);

  return result;
}
