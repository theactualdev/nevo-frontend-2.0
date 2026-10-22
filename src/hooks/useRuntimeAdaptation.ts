"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { intelligenceApi } from "@/lib/api";
import type {
  AdaptResponse,
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
 * request reports - a replay or an answer. Those counts are about the
 * segment the child is on, so asked only on the way in they were always
 * zero; frontend §1 has the state read "after every interaction event".
 * Nothing is asked on a timer and nothing while a child simply reads. The
 * clock is read when the request is built, never during render. And nothing
 * is asked before the backend's lesson session exists, nor before the answers
 * already given have landed - see the request.
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
 * One reading is the player's: the moment an adaptation reached the screen,
 * which only the player sees. It takes that in its own effects and hands it
 * over in a ref - see `AppliedAdaptations`.
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
  /**
   * Every "Not now" to a modality offer this session. Always 0 since 21 Oct,
   * with the two fields below false and null: the separate suggestion pill
   * is gone (SCRUM-271 amended), so nothing is offered to decline.
   */
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
   * EVERYTHING ELSE THE ENGINE SAID MID-LESSON, which used to be discarded.
   *
   * The `in_lesson` response carries the same instruction, hint, guided
   * questions, scaffolding and formats as the load-time one - and
   * only `breakSuggestion` was kept. So a simplify, a slower, a hint or a
   * Socratic prompt decided while the child was working never reached them.
   * Translated through `toAdaptationPlan`, so it gets exactly the load-time
   * clamps: nothing a segment cannot render, no hint under the wrong action,
   * never the engine's reasoning. Null until the engine has answered.
   *
   * Its help - the instruction and what it shows - is the newest answer's,
   * unless that answer says `retain`: then the help already here stays, for
   * the section it was given for (`withDisposition`).
   */
  plan: AdaptationPlan | null;
  /**
   * The segment this answer is for: the instruction's own `segmentId` (B46,
   * 5 Oct), else `currentSegmentId` on the request, which backend says it
   * always is. Between the child moving on and the next answer landing, the
   * last one is still here - and it was about the segment they left, so its
   * break, offer or hint is not for the one they are on.
   *
   * The instruction is lesson-level on the wire, but a hint or a guided
   * question is about the content in front of the child when it was asked
   * for. Kept with the plan so the player can show it there and not under
   * every segment after, including through a failed read that keeps the plan.
   */
  forSegmentId: string | null;
}

/**
 * THE ADAPTATIONS A CHILD SAW APPLIED, kept by the player because only the
 * player knows when something reached the screen (B42): a reshape of the text
 * the system chose, a hint, a Socratic panel rendered, a density spacing
 * changed mid-session (B74). Not offers, not instructions the screen could
 * not show, and not the child's own picks - a format chosen in the group.
 *
 * `lastAt` is `performance.now()` at that moment (rule 4). Held in a ref and
 * read only when a request or a batch is built, never while rendering.
 */
export interface AppliedAdaptations {
  count: number;
  lastAt: number | null;
}

/**
 * WHAT BECOMES OF THE HELP ON SCREEN, as the answer's `adjustmentDisposition`
 * says (backend 864dff0; Teslim, 22 Oct, answer 3: "null alone no longer
 * means dismiss").
 *
 * - `apply`: the answer's instruction, as it says.
 * - `clear`, or no disposition - the contract's default: the answer as it
 *   stands, so help it does not carry is gone. The reading before this.
 * - `retain`: the help on screen stays. Resent with its decision id, it is
 *   the answer's own instruction again - the same help, and the same words.
 *   With `proactiveAdjustment` null - a cooldown, or a hand-off the server
 *   knows is open - the instruction, hint, questions and prompts already
 *   held are kept with the section they were given for, over the answer's
 *   fresh rows.
 *
 * RETAINED FOR ITS OWN SECTION ONLY: an answer about a different section
 * than the held help was given for keeps nothing - "retain" there is about
 * that section's help, and it has none here. Nothing held, nothing kept:
 * there is no help this could invent.
 */
export function withDisposition(
  held: RuntimeAdaptation,
  answer: RuntimeAdaptation,
  res: Pick<AdaptResponse, "adjustmentDisposition" | "proactiveAdjustment">,
  askedFor: string | null,
): RuntimeAdaptation {
  if (res.adjustmentDisposition !== "retain" || res.proactiveAdjustment)
    return answer;
  const help = held.plan;
  if (!answer.plan || !help?.adjustment || held.forSegmentId !== askedFor)
    return answer;
  return {
    ...answer,
    plan: {
      ...answer.plan,
      adjustment: help.adjustment,
      ...(help.hint ? { hint: help.hint } : {}),
      ...(help.guidedQuestions ? { guidedQuestions: help.guidedQuestions } : {}),
      ...(help.guidedPrompts ? { guidedPrompts: help.guidedPrompts } : {}),
    },
    forSegmentId: held.forSegmentId,
  };
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
  /**
   * The lesson session the BACKEND issued (`useLessonProgress`), null until
   * `POST /session` answers. Nothing is asked without it - see the request.
   */
  lessonSessionId: string | null,
  runtime: RuntimeState,
  /** The built lesson, so the engine's rows are clamped to what it renders. */
  lesson: Lesson | null = null,
  /** What the player has applied - see `AppliedAdaptations`. */
  applied: RefObject<AppliedAdaptations> | null = null,
  /**
   * The answers the player has sent to `POST /lessons/{id}/attempts`, landed
   * or still on their way. An ask waits for the ones on their way - see the
   * request.
   */
  answerWrites: RefObject<Promise<unknown>[]> | null = null,
): RuntimeAdaptation {
  const [result, setResult] = useState<RuntimeAdaptation>({
    offeredBreak: null,
    reason: null,
    plan: null,
    forSegmentId: null,
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
   * A SHIFT IS A CHANGE WITHIN A SEGMENT - since 21 Oct, a format the child
   * picks in the format group. Every segment opens in its own modality,
   * and counting those openings reported a child who changed nothing as one
   * who had switched at every segment.
   *
   * Counted for the whole session and never reset, however the change came
   * about - backend's definition (B42): it caps how often one session may be
   * rearranged, and a per-segment count would lift that cap every segment.
   */
  useEffect(() => {
    const prev = last.current;
    if (prev && prev.segmentId === segmentId && prev.modality !== modality) {
      modalityShifts.current += 1;
    }
    last.current = { segmentId, modality };
  }, [segmentId, modality]);

  useEffect(() => {
    /*
     * NOTHING IS ASKED UNTIL THE LESSON SESSION EXISTS, and every ask names
     * it. The engine refuses an `in_lesson` read 409 `lesson_session_required`
     * unless the child has an open sitting on this lesson
     * (`prepare_adaptation`), and the player arrives on its first segment
     * before `POST /session` has answered - so the first ask raced the
     * session open, and on the 20 Oct production run the ask that followed
     * the 201 was refused as well. The session id is a dependency, so the
     * first ask goes the moment it lands, for the segment the child is on;
     * a reroute that opens a new sitting is named on the next ask.
     *
     * The load-time read (`useAdaptation`, `lesson_load`) is untouched: it
     * needs no sitting, and it gates the first frame (rule 6), so holding it
     * for the session would hold the lesson. Whether it should follow the
     * session is a separate, open question.
     */
    if (
      !enabled ||
      !lessonId ||
      !lessonSessionId ||
      !segments?.length ||
      !segmentId
    )
      return;
    let active = true;
    const ask = () => {
      // Monotonic (rule 4): every duration below is sent to the engine, and a
      // wall clock that jumps would send negatives or fail validation.
      const now = performance.now();

      const state = latest.current;
      const appliedAt = applied?.current.lastAt ?? null;
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
         * B42: FROM THE MOMENT AN ADAPTATION WAS APPLIED ON SCREEN - not
         * decided, not asked for. It feeds the engine's cooldown, so the
         * wrong moment makes it too eager or deaf. Null while nothing has
         * been applied this session. Whole seconds, rounded down, so the
         * cooldown is never told more time has passed than has. Left out
         * when the caller does not say what it applied: a number nobody can
         * vouch for is worse than the contract's own null.
         */
        ...(applied
          ? {
              secondsSinceLastAdaptation:
                appliedAt === null
                  ? null
                  : Math.max(0, Math.floor((now - appliedAt) / 1000)),
            }
          : {}),
      };
      const askedFor = state.currentSegmentId;

      void intelligenceApi
        .getAdaptation(lessonId, segments, {
          mode: "in_lesson",
          signals,
          sessionId: lessonSessionId,
        })
        .then((res) => {
          if (!active) return;
          const built = lessonRef.current;
          const answer: RuntimeAdaptation = {
            offeredBreak: asBreakType(res.breakSuggestion?.breakType),
            reason: res.breakSuggestion?.reason ?? null,
            plan: built ? toAdaptationPlan(res, built) : null,
            forSegmentId: res.proactiveAdjustment?.segmentId ?? askedFor,
          };
          // Whether the help on screen stays is the answer's to say.
          setResult((held) => withDisposition(held, answer, res, askedFor));
        })
        .catch(() => {
          // A failed read is not "no break needed", but it is not grounds to
          // interrupt a child either, so it offers none. Nor is it an
          // instruction: the plan falls back to the load-time one rather
          // than to "the engine now says nothing".
          if (active)
            setResult((prev) => ({ ...prev, offeredBreak: null, reason: null }));
        });
    };

    /*
     * BUILT A MICROTASK LATER, once every effect in this commit has run. The
     * player notes what reached the screen in its own effects, which run
     * after this hook's - so a reshape applied as the child arrives on a
     * segment would otherwise be missing from the request that arrival
     * makes, and the engine would read a lesson that had just been
     * rearranged as one that had not been, for one answer.
     *
     * AND ONLY ONCE THE ANSWERS ALREADY GIVEN HAVE LANDED (SCRUM-275, the 21
     * Oct run). An answer is written and then counted here, and the count
     * changing is what asks - so the ask went beside the write, not after
     * it. The engine reads its error streak from the answers it has stored,
     * not from this count, and the two routes do not wait for each other: it
     * could read one miss where there were two, and hold the hint two misses
     * earn. So the ask waits for every write still on its way - landed, or
     * failed, because a write that failed is no reason for the engine to say
     * nothing. A newer reason to ask, in the meantime, replaces this one
     * (`active`), and asks once the writes have landed in its turn.
     */
    queueMicrotask(() => {
      if (!active) return;
      const owed = answerWrites?.current ?? [];
      if (owed.length === 0) {
        ask();
        return;
      }
      void Promise.allSettled(owed).then(() => {
        if (active) ask();
      });
    });

    return () => {
      active = false;
    };
  }, [
    enabled,
    lessonId,
    lessonSessionId,
    segments,
    segmentId,
    replays,
    errors,
    declines,
    applied,
    answerWrites,
  ]);

  return result;
}
