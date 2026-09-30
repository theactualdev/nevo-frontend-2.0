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
 * `in_lesson` mode.
 *
 * `useBreakMonitor` has always said the real decision belongs to the backend -
 * "this hook watches for that instruction" - and its `TODO: subscribe to
 * backend break instructions` is what this answers. The client timer stays as
 * the PRIMING signal it was written to be; what changes is that the decision
 * to offer now comes from the engine, which can see the whole session.
 *
 * ASKED AT SEGMENT BOUNDARIES, not on a timer. A child moving between segments
 * is the natural moment to reconsider, it bounds the number of requests to the
 * length of the lesson, and it means nothing is recomputed while they are
 * reading. The clock is read when the request is built, never during render.
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
 * `replayCountOnSegment`, `declinedModalities` and the rest of
 * `RuntimeSignalsRequest` are absent because the player does not track them.
 * They default server-side, so omitting them and sending a zero reach the
 * engine identically - but only one of the two is us claiming to know.
 */
export interface RuntimeState {
  currentSegmentId: string | null;
  currentModality: string;
  availableModalities: string[];
  midpointReached: boolean;
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
  // request fires on the segment boundary alone and not on every tick.
  const latest = useRef(runtime);
  useEffect(() => {
    latest.current = runtime;
  }, [runtime]);

  const askedAt = useRef<number | null>(null);
  const segmentId = runtime.currentSegmentId;
  const modality = runtime.currentModality;

  // The clocks, kept here so nothing reads a ref while rendering.
  const openedAt = useRef(0);
  const segmentStartedAt = useRef(0);
  const modalityShifts = useRef(0);
  const lastModality = useRef<string | null>(null);

  useEffect(() => {
    if (openedAt.current === 0) openedAt.current = Date.now();
  }, []);

  // A new segment restarts the segment clock. Runs before the request effect
  // below on the same change, so the request sees the fresh start.
  useEffect(() => {
    segmentStartedAt.current = Date.now();
  }, [segmentId]);

  // Count only actual changes, and never the first render's initial value.
  useEffect(() => {
    if (lastModality.current !== null && lastModality.current !== modality) {
      modalityShifts.current += 1;
    }
    lastModality.current = modality;
  }, [modality]);

  useEffect(() => {
    if (!enabled || !lessonId || !segments?.length || !segmentId) return;
    let active = true;
    const now = Date.now();
    const since = askedAt.current;
    askedAt.current = now;

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
      secondsSinceLastAdaptation:
        since === null ? null : Math.round((now - since) / 1000),
    };

    void intelligenceApi
      .getAdaptation(lessonId, segments, { mode: "in_lesson", signals })
      .then((res) => {
        if (!active) return;
        const built = lessonRef.current;
        setResult({
          offeredBreak: asBreakType(res.breakSuggestion?.breakType),
          reason: res.breakSuggestion?.reason ?? null,
          plan: built ? toAdaptationPlan(res, built) : null,
        });
      })
      .catch(() => {
        // A failed read is not "no break needed", but it is not grounds to
        // interrupt a child either. The client timer still primes the offer.
        // Nor is it an instruction: the plan falls back to the load-time one
        // rather than to "the engine now says nothing".
        if (active)
          setResult((prev) => ({ offeredBreak: null, reason: null, plan: prev.plan }));
      });

    return () => {
      active = false;
    };
  }, [enabled, lessonId, segments, segmentId]);

  return result;
}
