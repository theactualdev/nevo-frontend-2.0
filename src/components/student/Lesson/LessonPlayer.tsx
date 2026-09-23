"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  AdaptiveToggleBar,
  ProgressBar,
  type ToggleSegment,
} from "@/components/shared";
import {
  BREAK_TYPES,
  BUSY_PHASE,
  BUSY_REASON,
  DENSITY,
  MODALITY,
  SIGNAL_EVENT_TYPES,
  TRIGGER_SOURCE,
  type BreakType,
  type BusyPhase,
  type BusyReason,
  type Density,
  type Modality,
  type SignalEventType,
} from "@/lib/constants";
import { useAccessibility } from "@/context/AccessibilityContext";
import { useBreakMonitor, useLesson, useSignals } from "@/hooks";
import { useRuntimeAdaptation } from "@/hooks/useRuntimeAdaptation";
import { useScaffoldLevel } from "@/hooks/useScaffoldLevel";
import type { AdaptSegment } from "@/lib/api/intelligence";
import type { AdaptationPlan, Lesson, LessonSegment } from "@/lib/types";
import { cn, randomId } from "@/lib/utils";
import {
  lessonModules,
  modulePositionFor,
  opensLaterModule,
  positionLine,
} from "@/lib/utils/modules";
import {
  secondaryDim,
  DifficultyOfferPill,
  HintOverlay,
  SocraticPanel,
} from "./AffectiveLayer";
import { AfterLessonAssessment } from "./AfterLessonAssessment";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants/affect";
import { densityForAction } from "@/lib/lessons/densityForAction";
import { isChunkable } from "@/lib/lessons/chunk";
import { LESSON_STATUS } from "@/lib/api/lessons";
import { schedulerApi } from "@/lib/api/scheduler";
import { getSession } from "@/lib/auth/session";
import { useLessonProgress } from "@/hooks/useLessonProgress";
import { AudioSegment } from "./AudioSegment";
import { BreakOfferPill } from "./BreakOfferPill";
import { BreakScreen } from "./BreakScreen";
import { CalculationSolver } from "./CalculationSolver";
import { FeedbackStrip } from "./FeedbackStrip";
import { InteractiveSegment } from "./InteractiveSegment";
import { LeaveLessonDialog } from "./LeaveLessonDialog";
import { LessonComplete } from "./LessonComplete";
import { ModalitySuggestionPill } from "./ModalitySuggestionPill";
import { ModuleBoundaryScreen } from "./ModuleBoundaryScreen";
import { OfflineBanner } from "./OfflineBanner";
import { ScaffoldIndicator } from "./ScaffoldIndicator";
import { QuickCheckSheet } from "./QuickCheckSheet";
import { ReviewEntryScreen } from "./ReviewEntryScreen";
import { type ReviewAnswer, saveReviewAnswers } from "./reviewStore";
import { TextSegment } from "./TextSegment";
import { VisualSegment } from "./VisualSegment";

const LESSONS_HREF = "/student/lessons";
// Finishing a lesson returns to Home (the daily landing), not the lesson list.
const HOME_HREF = "/student/dashboard";

const DENSITIES: { id: Density; label: string }[] = [
  { id: DENSITY.SIMPLIFY, label: "Simplify" },
  { id: DENSITY.EXPAND, label: "Expand" },
  { id: DENSITY.SLOWER, label: "Slower" },
];

// Each density is its own event type in the backend ingest contract.
const DENSITY_TRIGGER: Record<Density, SignalEventType> = {
  [DENSITY.SIMPLIFY]: SIGNAL_EVENT_TYPES.SIMPLIFY_TRIGGER,
  [DENSITY.EXPAND]: SIGNAL_EVENT_TYPES.EXPAND_TRIGGER,
  [DENSITY.SLOWER]: SIGNAL_EVENT_TYPES.SLOWER_TRIGGER,
};

/** Scroll-depth marks (%) that each emit one `scroll` signal per segment. */
const SCROLL_MILESTONES = [25, 50, 75, 100];

/** How long the transient post-answer feedback note lingers before fading. */
const FEEDBACK_MS = 3500;

/** A calculation segment whose Interactive modality routes to the solver (§8). */
function isCalculation(segment: LessonSegment): boolean {
  return Boolean(segment.calculationVariant) && Boolean(segment.calculation);
}

/**
 * Whether we can actually render `modality` for this segment. A segment may list
 * a modality it has no content for. The Interactive modality renders the standard
 * interactive content, or — when the segment carries a `calculationVariant` — the
 * co-construction calculation solver instead (17b §8, the one place a toggle
 * option renders a different component).
 */
function hasContent(segment: LessonSegment, modality: Modality): boolean {
  switch (modality) {
    case MODALITY.TEXT:
      return Boolean(segment.text);
    case MODALITY.VISUAL:
      return Boolean(segment.visual);
    case MODALITY.AUDIO:
      return Boolean(segment.audio);
    case MODALITY.INTERACTIVE:
      return Boolean(segment.interactive) || isCalculation(segment);
  }
}

/** The modality a segment opens in: the plan's choice, else the first renderable one. */
function openingModality(
  segment: LessonSegment,
  planned: Modality | undefined,
): Modality {
  if (planned && hasContent(segment, planned)) return planned;
  return (
    segment.modalities.find((m) => hasContent(segment, m)) ?? MODALITY.TEXT
  );
}

/**
 * Lesson Player (screen 17) — the immersive reading/learning shell. Slices 1–4:
 * the spine, all four modalities, reading density, the modality suggestion, the
 * inline Quick Check, the after-lesson assessment, completion, the leave dialog,
 * and system states. Slice 5 wires signal collection (`useSignals`) across every
 * interaction and publishes the session into `LessonContext`.
 */
export function LessonPlayer({
  lesson,
  plan,
  review = false,
  reviewConceptId,
  live = false,
  assignmentId,
  startAt = 0,
  lastWorkedAt = null,
  adaptSegments,
}: {
  lesson: Lesson;
  plan: AdaptationPlan | null;
  /**
   * The assignment this lesson was opened from, carried onto every progress
   * write. Absent for a lesson opened from the library - see
   * `useLessonProgress`, which omits rather than nulls it.
   */
  assignmentId?: string;
  /**
   * The lesson in the adaptation engine's vocabulary, for the mid-lesson
   * `in_lesson` read. Undefined for a mock, whose authored plan is richer than
   * anything the engine returns for ids it has never seen.
   */
  adaptSegments?: AdaptSegment[];
  /**
   * The lesson came from the backend, so its id is real and progress can be
   * written against it. False for the two authored mock lessons - writing
   * their invented ids would 404 and blame the network for our own fixture.
   */
  live?: boolean;
  /**
   * Segment to open on, from saved progress. Clamped by the caller; a review
   * session always opens at the top regardless.
   */
  startAt?: number;
  /** Passed to the review entry screen so its recency line is a fact. */
  lastWorkedAt?: string | null;
  /**
   * Review session (37d): the same player as a spaced-retrieval variant. Adds
   * only an entry screen, the REVIEW pill during, and the "You strengthened
   * this concept" completion; the after-lesson assessment is skipped (the
   * quick checks are the recall).
   */
  review?: boolean;
  /** The concept a review session is for; absent on an ordinary lesson. */
  reviewConceptId?: string;
}) {
  const router = useRouter();
  const total = lesson.segments.length;

  const planFor = (segmentId: string) =>
    plan?.segments.find((s) => s.segmentId === segmentId);

  // A LOCAL correlation id for the in-app lesson context (Ask Nevo reads it).
  // It is NOT the signal session any more: the ingest contract wants a UUID,
  // this is not one, and passing it here is what had every batch rejected 422.
  // Signals ride the backend's issued id - see `useSignals`.
  const [sessionId] = useState(
    () => `${review ? "review" : "lesson"}-${lesson.id}-${randomId()}`,
  );
  // ── Persisted progress ────────────────────────────────────────────────────
  // Nothing wrote a child's position down before this: closing the tab
  // returned a lesson to unstarted. `useLessonProgress` opens the session and
  // reports position; the two authored mocks opt out (`live`), because their
  // ids are invented and a 404 would be ours, not the network's.
  const progress = useLessonProgress(lesson.id, live, assignmentId);
  const { report: reportProgress } = progress;

  // Signals ride the BACKEND's session id, not the local one above - see
  // `useSignals`. Null until `POST /session` answers, which the hook holds for.
  const { trackEvent } = useSignals(progress.sessionId, lesson.id);
  const { setActiveLesson } = useLesson();

  // Assessment picks, captured for the Review Answers screen (a separate route).
  const reviewAnswers = useRef<ReviewAnswer[]>([]);

  // Publish the active session so surfaces outside the player (e.g. Ask Nevo)
  // can see what's being learned; cleared on unmount.
  useEffect(() => {
    setActiveLesson({ lessonId: lesson.id, sessionId, adaptationPlan: plan });
    return () => setActiveLesson(null);
  }, [lesson.id, sessionId, plan, setActiveLesson]);

  // Resuming opens on the saved segment; a review session replays the whole
  // thing, so it ignores the saved position.
  const opening =
    !review && startAt > 0 && startAt < lesson.segments.length ? startAt : 0;
  const [index, setIndex] = useState(opening);

  const first = lesson.segments[opening];
  const firstPlan = planFor(first.id);

  // The student's MANUAL density pick (navy chip). Separate from the system's
  // standing density — the segment plan's, defaulting to Simplify (frame:
  // `adaptive ?? "Simplify"`) — which renders as the violet chip and supplies
  // the resting view until the student overrides. Both can show at once.
  const [density, setDensity] = useState<Density | null>(null);
  const [modality, setModality] = useState<Modality>(
    openingModality(first, firstPlan?.startModality),
  );
  // The system gets ONE suggestion per segment; taking or declining it spends it.
  const [suggestionSpent, setSuggestionSpent] = useState(false);
  // …and never offers on consecutive segments (17 doc page).
  const [lastSuggestedIndex, setLastSuggestedIndex] = useState<number | null>(
    null,
  );

  // Segments whose Quick Check has been answered correctly — only a correct
  // answer spends the check (a miss offers Try again / See it explained).
  /*
   * FIRST answers in a review session, kept only to tell the scheduler how
   * recall went. Cleared with the session; never rendered to the child.
   *
   * First and not final, because a missed inline check re-opens until it is
   * passed - so "passed" is true of everyone by the end and would report
   * perfect recall for a child who got it wrong twice.
   */
  const firstAnswers = useRef<Map<number, boolean>>(new Map());
  const [passedChecks, setPassedChecks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [checkOpen, setCheckOpen] = useState(false);
  // Segments are the lesson itself; the assessment takes over the screen once
  // the last segment is done (growth framing — never a score), then completion.
  // Review sessions open on their entry screen first (37d).
  const [phase, setPhase] = useState<
    "review-entry" | "segments" | "assessment" | "complete"
  >(review ? "review-entry" : "segments");
  // Exiting mid-lesson goes through the leave dialog, not straight out.
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Position, on every move - including the ones that go through a module
  // boundary or a break, which is why this watches `index` rather than
  // hooking each call site.
  /*
   * A REVIEW SESSION MUST NOT DEMOTE THE LESSON IT IS REVIEWING.
   *
   * This wrote `in_progress` at the current segment on every move, with no
   * regard for whether it was a review. A review is spaced retrieval on a
   * lesson the child has already FINISHED (37d) - so opening one rewrote a
   * completed lesson as `in_progress, segment 0` on the very first frame.
   *
   * Finishing the review put the completion back. Leaving it partway did not:
   * the lesson stayed demoted, reappeared on Home under "Pick back up" as
   * though it were unfinished, and the child was invited to redo work they had
   * done. The record of having completed it was simply gone.
   *
   * The review's own outcome belongs to the scheduler
   * (`POST /api/scheduler/record-review`), which nothing calls yet. Until it
   * does, the honest behaviour is to leave the lesson's progress alone rather
   * than overwrite it with something false.
   */
  useEffect(() => {
    if (review) return;
    const pos = modulePositionFor(lesson, index);
    reportProgress(LESSON_STATUS.IN_PROGRESS, {
      segment: index,
      ...(pos ? { module: pos.moduleIndex } : {}),
    });
  }, [lesson, index, review, reportProgress]);

  // Completion. Reported once, however the child leaves the finished lesson.
  //
  // This was keyed on `phase === "complete"` alone, which quietly missed a
  // whole exit: from the assessment result a child can tap "Review answers"
  // instead of "Done", which routes them away WITHOUT the phase ever reaching
  // "complete". They had played every segment and answered every question, and
  // the lesson stayed `in_progress` forever - while the review screen they
  // landed on told them "Your progress is saved".
  //
  // So completion is a function both exits call, not a side effect of one of
  // them. The ref keeps it idempotent.
  const completionReported = useRef(false);
  const markComplete = useCallback(() => {
    if (completionReported.current) return;
    completionReported.current = true;
    reportProgress(LESSON_STATUS.COMPLETED, {
      segment: Math.max(0, lesson.segments.length - 1),
    });
  }, [lesson, reportProgress]);

  useEffect(() => {
    if (phase !== "complete") return;
    markComplete();
  }, [phase, markComplete]);

  /*
   * TELL THE SCHEDULER HOW THE REVIEW WENT. Once, at the end, and only when
   * there is something true to say.
   *
   * `POST /api/scheduler/record-review` was deliberately unwired on the
   * grounds that `recallSuccessful` needs a question and there was none to
   * ask. Lessons now carry checkpoints and a four-question assessment, so a
   * review asks and the answers are marked - and the concept it was opened for
   * arrives on the URL from the due-review chip.
   *
   * ONLY THE QUESTIONS ABOUT THE CONCEPT UNDER REVIEW COUNT. A review is
   * spaced retrieval on ONE concept; crediting it with a right answer about a
   * different one is inventing a signal in a smaller shape. If none of the
   * questions was tagged with it - or the child was never asked - nothing is
   * sent at all, because there is no evidence either way and a cheerful `true`
   * for reaching the end is exactly what Zero-Tag exists to stop.
   *
   * Failure is swallowed. The scheduler missing one outcome costs a slightly
   * wrong interval; telling a child their review did not count would be worse
   * and is not true - they did the work.
   */
  /*
   * 37a's indicator, sourced from the scaffolds engine where a concept exists.
   * Null on an ordinary lesson, and null on a read that did not answer.
   */
  const conceptScaffold = useScaffoldLevel(reviewConceptId);

  const reviewRecorded = useRef(false);
  useEffect(() => {
    if (phase !== "complete" || !review || !reviewConceptId) return;
    if (reviewRecorded.current) return;
    const studentId = getSession()?.userId;
    if (!studentId) return;

    const questions = lesson.assessment?.questions ?? [];
    const onThisConcept = questions
      .map((q, i) => ({ conceptId: q.conceptId, answered: firstAnswers.current.get(i) }))
      .filter((q) => q.conceptId === reviewConceptId && q.answered !== undefined);
    if (onThisConcept.length === 0) return;

    reviewRecorded.current = true;
    void schedulerApi
      .recordReview({
        studentId,
        conceptId: reviewConceptId,
        // Every question about this concept, right first time.
        recallSuccessful: onThisConcept.every((q) => q.answered === true),
      })
      .catch(() => {});
  }, [phase, review, reviewConceptId, lesson]);
  // SCRUM-101: the segment index the player is about to enter across a module
  // boundary. Non-null takes over the screen with the boundary landing; the
  // student's continue (or break + "I'm ready") completes the move.
  const [boundaryTo, setBoundaryTo] = useState<number | null>(null);
  // Break module (frame 18): a plan-delivered break takes over the screen on
  // the way out of its segment; finishing it resumes the interrupted advance.
  // One break per segment - taken breaks never re-trigger on a back-and-forth.
  const [breakActive, setBreakActive] = useState<BreakType | null>(null);
  const breaksTaken = useRef<Set<string>>(new Set());
  // Where the active break came from: "advance" resumes the interrupted move,
  // "offer" returns to the same segment. Trigger travels into `break_start`.
  const breakOrigin = useRef<"advance" | "offer">("advance");
  const breakTrigger = useRef<string>("adaptation_plan");
  // Break OFFERS (B.7/§4): spent per segment for offered breaks, once per
  // session for the 20-minute monitor. Declining spends; never re-asks.
  const [spentBreakOffers, setSpentBreakOffers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [timeOfferSpent, setTimeOfferSpent] = useState(false);
  // Step-up offers, spent per segment by acting on them.
  const [spentEscalations, setSpentEscalations] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The student's own preference gates the prompt - turning it off used to
  // change nothing at all.
  const { suggestBreaks } = useAccessibility();
  const { approachingThreshold } = useBreakMonitor(
    phase === "segments" && suggestBreaks,
  );
  // Transient post-answer note that greets the next segment, then fades.
  const [feedback, setFeedback] = useState<string | null>(null);
  // Calculation segments the student has co-constructed to completion — the
  // forward chevron stays gated until the answer assembles (17b §11).
  const [solvedCalcs, setSolvedCalcs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const segment = lesson.segments[index];

  /**
   * The engine's mid-lesson read, asked at each segment boundary.
   *
   * This is what `useBreakMonitor`'s "the actual break decision is confirmed by
   * the backend" has always pointed at. The client timer still primes the
   * offer; the engine decides whether one is warranted and WHICH - the time
   * path used to hard-code a micro break, and the engine asks for a movement
   * break on the same trigger.
   *
   * Only observed facts are sent. Engagement and comprehension scores would
   * unlock more of the engine and would have to be invented, so they are not
   * sent at all - see `RuntimeSignals`.
   */
  const runtime = useRuntimeAdaptation(
    lesson.id,
    adaptSegments,
    live && !review,
    {
      currentSegmentId: segment.id,
      currentModality: modality,
      availableModalities: segment.modalities,
      midpointReached: index >= Math.floor(lesson.segments.length / 2),
    },
  );

  // ── Signal helpers ──────────────────────────────────────────────────────
  // Max scroll depth + which milestones have fired, reset per segment.
  const scrollDepth = useRef(0);
  const scrollMarks = useRef<Set<number>>(new Set());
  /** The scrolling reading column, so a segment can be measured, not guessed. */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /**
   * How much of a CHUNKED body has been shown, reported by the body itself.
   *
   * The attention accommodation deliberately holds most of the body back, so
   * the layout measurement below - "no room to scroll, therefore they saw all
   * of it" - becomes false exactly when it is on. The body is the only thing
   * that knows which part is showing, so it says.
   *
   * STAMPED WITH THE SEGMENT ID RATHER THAN CLEARED ON SEGMENT CHANGE, and
   * that is deliberate. React runs child effects before parent ones, so a new
   * segment's body reports BEFORE any reset here could run, and a reset would
   * wipe the fresh value rather than the stale one. Comparing ids cannot lose
   * that race because it does not race: a report either belongs to the
   * segment being asked about or it does not.
   */
  const chunkRead = useRef<{ segmentId: string; pct: number } | null>(null);
  const noteReadProgress = useCallback(
    (pct: number) => {
      chunkRead.current = { segmentId: lesson.segments[index].id, pct };
    },
    [lesson.segments, index],
  );

  /**
   * Put focus on the new segment when the content changes underneath it.
   *
   * Three things ride on this, and only the first is obvious:
   *
   * 1. A keyboard or switch-access child keeps their place. The remount drops
   *    focus to <body>, so without this they restart from the top of the
   *    document after every advance.
   * 2. A screen reader announces where they now are, from the group's label.
   * 3. THE SCROLL POSITION RESETS. Nothing reset it before - a child who read
   *    to the bottom of a long segment and pressed Next arrived halfway down
   *    the next one. Focusing scrolls its target into view, so the fix for the
   *    first two carries this one, and it applies to every child rather than
   *    only those using a keyboard.
   *
   * Not on first render: arriving at a lesson should leave focus where the
   * browser put it, not seize it.
   */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    bodyRef.current?.focus();
  }, [segment.id, modality]);

  // time_on_segment: one event per segment, emitted when it's left (index
  // change) or on unmount. Keyed on `index` so within-segment modality/density
  // changes don't split the timing.
  useEffect(() => {
    const enteredAt = Date.now();
    const segId = lesson.segments[index].id;
    scrollDepth.current = 0;
    scrollMarks.current = new Set();
    return () => {
      /*
       * A chunked body's own count outranks the layout measurement, and only
       * ever for the segment it was reported against.
       *
       * THIS IS THE WHOLE FIX, and it is deliberately the only place that
       * knows. An earlier version also guarded the measurement effect above so
       * it would not write 100 for a chunked segment; a mutation proved that
       * guard changed nothing, because a chunked segment never reads
       * `scrollDepth` anyway. Two half-defences that look load-bearing are
       * worse than one that is.
       */
      const chunked =
        chunkRead.current?.segmentId === segId ? chunkRead.current.pct : null;
      trackEvent(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT, {
        segmentId: segId,
        durationMs: Date.now() - enteredAt,
        scrollDepthPct: chunked ?? Math.round(scrollDepth.current),
      });
    };
  }, [index, lesson.segments, trackEvent]);

  /*
   * A SEGMENT THAT FITS ON ONE SCREEN WAS REPORTED AS UNREAD.
   *
   * `handleScroll` already had the right rule - no room to scroll means the
   * child can see all of it, so depth is 100 - but it lives in an `onScroll`
   * handler. A segment that fits never scrolls, so the handler never runs and
   * the rule never fires. `scrollDepth` stayed at the 0 it is reset to on
   * entry, and every short segment told the adaptation engine the child had
   * read NONE of it.
   *
   * That is most segments. This product deliberately keeps them short for low
   * cognitive load, so the engine was being fed "read nothing" about children
   * who had read everything - a fabricated signal about a child's learning,
   * which is the one kind this product must never send.
   *
   * Measured after the content is laid out, and re-measured when the modality
   * changes, because an audio segment and a text segment are different heights.
   *
   * DECLARED AFTER THE RESET ABOVE, AND THAT ORDER IS LOAD-BEARING. React runs
   * effects in declaration order, so measuring before the reset means the
   * reset wipes the measurement on every segment change - which is exactly
   * what the first version of this fix did, silently, while looking correct.
   *
   * Known and accepted: content that grows AFTER this runs - a late image -
   * could leave 100 recorded for a segment that became scrollable. The child
   * did see everything present at the time. Over-reporting one late-growing
   * segment is a far smaller error than under-reporting every short one, which
   * is what this replaces.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight <= 0) scrollDepth.current = 100;
  }, [index, modality]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const room = el.scrollHeight - el.clientHeight;
    const pct = room <= 0 ? 100 : (el.scrollTop / room) * 100;
    scrollDepth.current = Math.max(scrollDepth.current, pct);
    /*
     * A milestone describes the SEGMENT, so a chunked body cannot raise one.
     * Scrolling to the foot of Part 1 of 3 is the bottom of a third, and
     * emitting `depthPct: 100` for it would tell the engine the child had read
     * the whole segment. The honest depth for a chunked segment travels on
     * `time_on_segment` above; this stays quiet rather than overstating.
     */
    if (chunkRead.current?.segmentId === segment.id) return;
    for (const mark of SCROLL_MILESTONES) {
      if (pct >= mark && !scrollMarks.current.has(mark)) {
        scrollMarks.current.add(mark);
        trackEvent(SIGNAL_EVENT_TYPES.SCROLL, {
          segmentId: segment.id,
          depthPct: mark,
        });
      }
    }
  };

  // Auto-clear the feedback note.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [feedback]);

  // ── Touch Signal Contract markers (SCRUM-94.8) ──────────────────────────
  /** `system_busy` start/end pair — brackets windows the system owns. */
  const trackBusy = useCallback(
    (reason: BusyReason, phase: BusyPhase) =>
      trackEvent(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, { reason, phase }),
    [trackEvent],
  );

  // While the Quick Check sheet is up, the player beneath is unavailable.
  useEffect(() => {
    if (!checkOpen) return;
    trackBusy(BUSY_REASON.BLOCKED_BY_MODAL, BUSY_PHASE.START);
    return () => trackBusy(BUSY_REASON.BLOCKED_BY_MODAL, BUSY_PHASE.END);
  }, [checkOpen, trackBusy]);

  // Scrim taps (the shared sheet overlay broadcasts them): recorded as blocked,
  // never as latency or an aborted gesture — a design signal, not a student one.
  useEffect(() => {
    const onScrimTap = () =>
      trackEvent(SIGNAL_EVENT_TYPES.TAP_BLOCKED, { target: "scrim" });
    window.addEventListener("nevo-scrim-tap", onScrimTap);
    return () => window.removeEventListener("nevo-scrim-tap", onScrimTap);
  }, [trackEvent]);

  // ── The engine's instruction (§4) ───────────────────────────────────────
  const segPlan = planFor(segment.id);
  /*
   * ONE INSTRUCTION, AND NEVER A STATE.
   *
   * This read a per-segment `affect` until 17 Sep - `anxiety`, `boredom`,
   * `frustration`, `confusion` - which is the one thing §4 says the frontend
   * never knows. Only the authored demo set it, so no child saw a consequence;
   * what it cost was that every branch below described a state the product is
   * not allowed to have an opinion about.
   *
   * The engine's instruction is LESSON-level and wins. The per-segment one is
   * the authored seam, and it now speaks the same six words, because a demo
   * with a private vocabulary is how the old one would have survived this.
   *
   * Two of §4's six are applied because they need nothing the wire lacks.
   * `offer_break` has its own richer seam through `breakSuggestion`.
   * `offer_hint` and `show_socratic_panel` need hint text and guided questions
   * that no field carries, so they render the nothing-state rather than an
   * empty card - rule 5, and an empty hint is worse than no hint.
   */
  const action = plan?.adjustment ?? segPlan?.adjustment ?? null;
  /*
   * WHAT THE INSTRUCTION SHOWS, engine first and authored second - the same
   * order the instruction itself resolves in.
   *
   * These arrived on 21 Sep and are the reason `offer_hint` and
   * `show_socratic_panel` were dark: the actions were readable all along and
   * there was nothing to put on screen, so three of §4's four affective
   * responses could not reach a signed-in child at all.
   *
   * Still nothing-state when the engine sends an instruction with no content.
   * An empty hint card is worse than no hint, and the translator has already
   * dropped a hint that arrived under the wrong action.
   */
  const hintText = plan?.hint ?? segPlan?.hint ?? null;
  const guidedQuestions =
    plan?.guidedQuestions?.length
      ? plan.guidedQuestions
      : (segPlan?.socraticPrompts ?? []);
  // §4: "Secondary UI to 40% opacity, transitions slow, gentler copy variants."
  const softened = action === ADJUSTMENT_ACTIONS.MODULATE_DENSITY;
  // §4: "'Ready for something harder?' pill, scaffold withdraws." The pill
  // already carries that exact sentence.
  const stepUpOffered = action === ADJUSTMENT_ACTIONS.INCREASE_DIFFICULTY;
  // UDL accommodations (37c) - cross-session delivery themes from the plan.
  const readingOn = Boolean(plan?.accommodations?.reading);
  const attentionOn = Boolean(plan?.accommodations?.attention);

  // Break OFFERS (B.7): the plan names a break type to OFFER on this segment;
  // the 20-minute monitor primes a micro one. One ask on screen at a time -
  // an offered break outranks (and suppresses) the modality suggestion.
  //
  // `offerBreak` BEING PRESENT IS THE INSTRUCTION now. It used to be gated on
  // the frustration state as well, so the plan could name a break and be
  // ignored because the frontend disagreed about why - rule 5 read backwards.
  const offeredBreakType = segPlan?.offerBreak ?? null;
  const showOfferedBreak =
    offeredBreakType !== null && !spentBreakOffers.has(segment.id);
  // The engine's own call, or the client's 20-minute prime as the fallback it
  // was always meant to be. Either can raise the offer; the engine chooses the
  // TYPE when it is the one asking.
  const showTimeBreakOffer =
    !showOfferedBreak &&
    (runtime.offeredBreak !== null || approachingThreshold) &&
    !timeOfferSpent;
  const showBreakOffer = showOfferedBreak || showTimeBreakOffer;

  // Offer the plan's suggestion only while it's renderable and not already
  // showing. Rate-limits: never on consecutive segments, never on the first
  // segment after a module boundary (SCRUM-101 - the student just made a
  // transition decision; don't stack an adaptation offer on top of it), and
  // never alongside a break offer.
  const suggested = segPlan?.suggestModality ?? null;
  const showSuggestion =
    !suggestionSpent &&
    !showBreakOffer &&
    suggested !== null &&
    suggested !== modality &&
    hasContent(segment, suggested) &&
    lastSuggestedIndex !== index - 1 &&
    !opensLaterModule(lesson, index);

  const go = (next: number) => {
    if (next < 0 || next >= total) return;
    // Leaving a segment that had a live offer counts as that segment having
    // suggested — the next segment must stay quiet (never consecutive).
    if (showSuggestion) setLastSuggestedIndex(index);
    const nextSegment = lesson.segments[next];
    const nextPlan = planFor(nextSegment.id);
    setIndex(next);
    /*
     * THE CHILD'S PACE CHOICE HOLDS FOR THE REST OF THE LESSON.
     *
     * This used to clear it on every segment. Design's ruling, 18 Sep:
     * "Resetting it every segment would be maddening, and storing it would
     * make it an accommodation, which is exactly what we just said it is not.
     * It holds for the current lesson and resets after."
     *
     * So it lives in component state and nowhere else: never written to the
     * profile, never sent back to the engine as a value, and gone at the next
     * sign-in because a new lesson is a new player. What the engine still
     * learns is the truth about what the child was actually shown, through the
     * chunked flow's exposure reporting.
     *
     * A segment that cannot deliver the chosen density simply renders its
     * default - the pick is not cleared, so it applies again on the next
     * segment that can.
     */
    setModality(openingModality(nextSegment, nextPlan?.startModality));
    setSuggestionSpent(false);
    /*
     * A plan-applied density is a system-driven adaptation - but only when the
     * system's density is the one actually on screen.
     *
     * Gated on there being no manual pick in force, which became possible the
     * moment the pick started carrying across segments. Without the gate, a
     * child who asked for Slower on segment 1 would have every later segment
     * report that the SYSTEM applied its own density, while the screen showed
     * the child's. That is a false signal about an adaptation that did not
     * happen, and the engine would learn from it.
     */
    if (nextPlan?.density && density === null) {
      trackEvent(DENSITY_TRIGGER[nextPlan.density], {
        segmentId: nextSegment.id,
        source: TRIGGER_SOURCE.SYSTEM,
      });
    }
  };

  /** The forward move itself — next segment, then assessment, then done. */
  const continueAdvance = () => {
    if (index < total - 1) {
      // Crossing into a later module lands on the boundary screen first
      // (SCRUM-101). Backward moves never re-show it.
      if (opensLaterModule(lesson, index + 1)) {
        setBoundaryTo(index + 1);
        return;
      }
      go(index + 1);
      return;
    }
    // Review sessions end on the strengthened completion - the quick checks
    // were the retrieval, so no second assessment (37d).
    setPhase(hasAssessment && !review ? "assessment" : "complete");
  };

  /**
   * Leave the current segment forward. A plan-delivered break (frame 18)
   * intercepts once on the way out; finishing it resumes this same advance.
   */
  const advancePastSegment = () => {
    const plannedBreak = planFor(segment.id)?.breakAfter ?? null;
    if (plannedBreak && !breaksTaken.current.has(segment.id)) {
      breaksTaken.current.add(segment.id);
      breakOrigin.current = "advance";
      breakTrigger.current = "adaptation_plan";
      setBreakActive(plannedBreak);
      return;
    }
    continueAdvance();
  };

  /** Accept/decline the offered break; either way the offer is spent. */
  const acceptBreakOffer = () => {
    if (showOfferedBreak) {
      setSpentBreakOffers((prev) => new Set(prev).add(segment.id));
      // NOT RENAMED, deliberately. This string is sent to the engine as the
      // `trigger` on a BREAK_START signal, so it is wire vocabulary and not
      // ours to tidy. Raised with backend instead - see BUILD_STATUS.
      breakTrigger.current = "affect_offer";
      breakOrigin.current = "offer";
      setBreakActive(offeredBreakType);
      return;
    }
    setTimeOfferSpent(true);
    breakTrigger.current = runtime.offeredBreak ? "engine_offer" : "time_offer";
    breakOrigin.current = "offer";
    // The engine's type when it asked; the micro break only when this is the
    // client timer talking, which is all it could ever offer.
    setBreakActive(runtime.offeredBreak ?? BREAK_TYPES.MICRO);
  };

  const dismissBreakOffer = () => {
    if (showOfferedBreak) {
      setSpentBreakOffers((prev) => new Set(prev).add(segment.id));
      return;
    }
    setTimeOfferSpent(true);
  };

  /** Next chevron — an unpassed Quick Check intercepts the advance. */
  const handleNext = () => {
    if (segment.quickCheck && !passedChecks.has(segment.id)) {
      setCheckOpen(true);
      return;
    }
    advancePastSegment();
  };

  const pickDensity = (id: string) => {
    const d = id as Density;
    const next = density === d ? null : d;
    setDensity(next);
    // A tap that sets (not clears) a density is a manual adaptation.
    if (next) {
      trackEvent(DENSITY_TRIGGER[next], {
        segmentId: segment.id,
        source: TRIGGER_SOURCE.MANUAL,
      });
    }
  };

  // Frame contract: the manual pick is navy; the system's standing density is
  // violet (glow-once) and KEEPS showing beside a different manual pick. The
  // sparkle rides the unfollowed system chip (AdaptiveToggleBar).
  /*
   * ONE PATH, TWO CALLERS - design, 23 Sep. The engine's `simplify`, `slower`
   * and `expand` are the same operation as the child's own chips, so they
   * arrive as the SYSTEM's density and go through everything below exactly as
   * the plan's own density did.
   *
   * It sits ahead of `segPlan?.density` because it is the live instruction for
   * this lesson, while the per-segment density is authored content's standing
   * choice; and a child's manual pick still beats both, on the next line.
   *
   * **A SEGMENT THAT CANNOT DELIVER IT STILL SHOWS ITS DEFAULT.**
   * `densitySegments` below offers only what a segment can actually reshape
   * into, so an instruction the content cannot honour lights no chip and
   * claims no adaptation - `TextSegment` falls back to `body.default` on its
   * own. That is the existing rule, not a new one, and it is why this needed
   * no gate of its own.
   */
  const systemDensity: Density =
    densityForAction(action) ?? segPlan?.density ?? DENSITY.SIMPLIFY;
  const effectiveDensity: Density = density ?? systemDensity;
  /*
   * Only the densities this segment can actually deliver.
   *
   * An offered density that re-renders identical prose is the player telling a
   * child it adapted when it did not, so Simplify and Expand still require an
   * authored reshape to switch to - parsed content has one body and neither.
   *
   * SLOWER IS DIFFERENT, as of 17 Sep, because it is not a rewording. Design:
   * "Slower is about how much arrives at once, which is segmentation and
   * pacing rather than wording." Chunking regroups sentences the lesson
   * already has, so it is available on live content, and the gate is whether
   * chunking would change anything - a one-sentence segment still offers
   * nothing rather than a control that does nothing.
   */
  const densitySegments: ToggleSegment[] = DENSITIES.filter(({ id }) =>
    id === DENSITY.SLOWER
      ? segment.text?.body[id] !== undefined ||
        isChunkable(segment.text?.body.default)
      : segment.text?.body[id] !== undefined,
  ).map(({ id, label }) => ({
    id,
    label,
    state:
      density === id ? "manual" : systemDensity === id ? "system" : "default",
  }));

  const acceptSuggestion = useCallback(() => {
    if (suggested) setModality(suggested);
    setLastSuggestedIndex(index);
    setSuggestionSpent(true);
    // The accept beat is over and the new modality is on screen.
    trackBusy(BUSY_REASON.MODALITY_SWITCH, BUSY_PHASE.END);
  }, [suggested, index, trackBusy]);

  const dismissSuggestion = useCallback(() => {
    setLastSuggestedIndex(index);
    setSuggestionSpent(true);
  }, [index]);

  /*
   * AN ASSESSMENT WITH NO QUESTIONS IS NOT AN ASSESSMENT.
   *
   * These gates asked `lesson.assessment` - truthiness - and `{ questions: [] }`
   * passes it. The player would then enter the assessment phase and hand
   * `AfterLessonAssessment` a list with nothing in it, at the very end of a
   * lesson a child had just finished.
   *
   * `fromContent` will not produce that shape: `assessmentFor` returns
   * undefined when nothing survives `toQuickCheck`. But the TYPE permits it,
   * `assessment: []` is what the contract's own default would deliver, and the
   * fixtures are hand-written - so the consumer checks too rather than trusting
   * every producer to keep getting it right.
   */
  const hasAssessment = (lesson.assessment?.questions.length ?? 0) > 0;

  const requestExit = () => {
    trackEvent(SIGNAL_EVENT_TYPES.EXIT_ATTEMPT, {
      segmentId: segment.id,
      index,
    });
    setLeaveOpen(true);
  };

  // A calculation being co-constructed holds the forward chevron until it's
  // solved (17b: forward disabled until the segment completes).
  const calcBlocking =
    modality === MODALITY.INTERACTIVE &&
    isCalculation(segment) &&
    !solvedCalcs.has(segment.id);

  // Once the last segment is behind us there is nowhere further to chevron to
  // (the assessment brings its own forward path).
  const nextDisabled =
    calcBlocking ||
    (index === total - 1 &&
      !hasAssessment &&
      !(segment.quickCheck && !passedChecks.has(segment.id)));

  // The entry, assessment and completion screens each take over the full
  // screen — their own layout, no player chrome.
  if (phase === "review-entry") {
    return (
      <ReviewEntryScreen
        lessonTitle={lesson.title}
        lastWorkedAt={lastWorkedAt}
        onBegin={() => setPhase("segments")}
      />
    );
  }

  if (phase === "assessment") {
    return (
      <AfterLessonAssessment
        assessment={lesson.assessment!}
        onAnswer={({ questionIndex, selectedId, correct }) => {
          trackEvent(SIGNAL_EVENT_TYPES.COMPREHENSION_RESPONSE, {
            kind: "assessment",
            questionIndex,
            correct,
          });
          // The first answer to each question, for the scheduler. `Map.set` is
          // guarded so a re-answer cannot overwrite what they knew first time.
          if (!firstAnswers.current.has(questionIndex)) {
            firstAnswers.current.set(questionIndex, correct);
          }
          // Record the pick (first per question) for the Review Answers screen.
          reviewAnswers.current = [
            ...reviewAnswers.current.filter(
              (a) => a.questionIndex !== questionIndex,
            ),
            { questionIndex, selectedId },
          ];
          saveReviewAnswers(lesson.id, reviewAnswers.current);
        }}
        onFinish={() => setPhase("complete")}
        onReviewAnswers={() => {
          // The lesson IS finished at this point - reviewing is a way of
          // leaving it, not of abandoning it.
          markComplete();
          router.push(`${LESSONS_HREF}/${lesson.id}/review`);
        }}
      />
    );
  }

  if (phase === "complete") {
    // "Your progress is saved" is the screen's default note, and until the
    // progress write existed it was simply untrue. Now it is a report: when
    // the write did not reach Nevo the child is told, in the same words the
    // daily warm-up uses - the fault is ours and it says so.
    const savedNote = progress.completionFailed
      ? "We couldn’t save that just now — that’s on us, not you. Your work is still yours."
      : undefined;

    // Review sessions close on the strengthened-concept variant (37d) - the
    // standard completion screen with only the message swapped.
    if (review) {
      return (
        <LessonComplete
          onDone={() => router.push(HOME_HREF)}
          heading="You strengthened this concept"
          note={
            savedNote ??
            `${lesson.title} is settling in. We'll bring it back once more before it fully sticks.`
          }
          doneLabel="Done"
        />
      );
    }
    return (
      <LessonComplete
        onDone={() => router.push(HOME_HREF)}
        note={savedNote}
        onSeeSummary={
          lesson.summary
            ? () => router.push(`${LESSONS_HREF}/${lesson.id}/summary`)
            : undefined
        }
      />
    );
  }

  // Break module (frame 18) — a calm full screen over the lesson. Ending it
  // resumes the advance the break interrupted (which may itself land on a
  // module boundary next).
  if (breakActive) {
    return (
      <BreakScreen
        type={breakActive}
        onStart={() =>
          trackEvent(SIGNAL_EVENT_TYPES.BREAK_START, {
            type: breakActive,
            trigger: breakTrigger.current,
            segmentId: segment.id,
          })
        }
        onEnd={(durationMs) =>
          trackEvent(SIGNAL_EVENT_TYPES.BREAK_END, {
            type: breakActive,
            durationMs,
          })
        }
        onFeelings={(feelings) =>
          trackEvent(SIGNAL_EVENT_TYPES.FEELING_CHECKIN, { feelings })
        }
        onDone={() => {
          setBreakActive(null);
          // An offered break returns to the segment it interrupted; a
          // plan-delivered one resumes the advance it intercepted.
          if (breakOrigin.current === "advance") continueAdvance();
        }}
      />
    );
  }

  // Module boundary landing (SCRUM-101) — a full player screen between modules,
  // never a modal. Continue (or break + "I'm ready") completes the move.
  if (boundaryTo !== null) {
    const modules = lessonModules(lesson);
    const nextPos = modulePositionFor(lesson, boundaryTo);
    if (modules && nextPos) {
      return (
        <ModuleBoundaryScreen
          lessonTitle={lesson.title}
          finished={modules[nextPos.moduleIndex - 1]}
          next={nextPos.module}
          nextModuleIndex={nextPos.moduleIndex}
          moduleCount={nextPos.moduleCount}
          lessonProgress={boundaryTo / total}
          showRecap={Boolean(plan?.accommodations?.attention)}
          onReached={() =>
            trackEvent(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_REACHED, {
              moduleId: nextPos.module.id,
            })
          }
          onAction={(action) =>
            trackEvent(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_ACTION, {
              moduleId: nextPos.module.id,
              action,
            })
          }
          onEnterNext={() => {
            setBoundaryTo(null);
            go(boundaryTo);
          }}
        />
      );
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar: exit + title, then the density toggle (present in every modality).
          Frame: 10/14/12 padding, whole bar carries the secondary dim. */}
      <header
        className={cn(
          "flex shrink-0 flex-col gap-2.5 px-3.5 pt-2.5 pb-3",
          secondaryDim(softened, attentionOn),
        )}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Exit lesson"
            onClick={requestExit}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
          {/* 37d: quiet violet marker while a review session runs. */}
          {review && (
            <span className="flex h-[26px] shrink-0 items-center rounded-2xl bg-nevo-cream-elevated px-[11px] text-[11px] font-bold tracking-[0.1em] text-nevo-violet">
              REVIEW
            </span>
          )}
          <h1 className="min-w-0 flex-1 truncate text-base font-medium text-nevo-near-black sm:text-lg">
            {lesson.title}
          </h1>
          {/* 37a: the global scaffold indicator, opposite the exit. 37b:
              boredom pulses it once at the transition. */}
          {/*
            THE CONCEPT'S OWN LEVEL WINS WHERE THERE IS A CONCEPT, and the two
            sources never overlap: the scaffolds engine is keyed per concept
            and only a review session has one, while the plan answers for
            ordinary segments that carry none. Null falls through to the plan,
            because a read that never answered is not evidence about a child.

            It is also the only way the fourth circle is ever reachable - the
            plan's `ScaffoldingLevel` has three values and the frame draws
            four. See `lib/lessons/scaffoldLevel.ts`.
          */}
          <ScaffoldIndicator
            key={`scaf-${segment.id}`}
            level={conceptScaffold ?? segPlan?.scaffold ?? "light"}
            pulse={stepUpOffered}
          />
        </div>
        {/* Frame: the density toggle sits alone on its own right-aligned row.
            Absent entirely when the segment has no reshapes to offer, rather
            than an empty pill rail. */}
        {densitySegments.length > 0 && (
          <div className="flex justify-end">
            <AdaptiveToggleBar
              segments={densitySegments}
              onSelect={pickDensity}
            />
          </div>
        )}
      </header>

      {/* Two-level position line for modular lessons (SCRUM-101.3) - its own
          full-width row directly above the progress bar (frame: 0 16px 7px). */}
      <div
        className={cn(
          "shrink-0 px-4 pb-[7px]",
          secondaryDim(softened, attentionOn),
        )}
      >
        <span className="block min-w-0 truncate font-mono text-[11px] tracking-[0.02em] text-nevo-near-black/50">
          {positionLine(lesson, index)}
        </span>
      </div>

      {/* Progress line — the bar tracks the whole lesson, continuous across
          module boundaries; the text above carries the module breakdown. */}
      <ProgressBar
        value={(index + 1) / total}
        className={cn("shrink-0", secondaryDim(softened, attentionOn))}
        aria-label={positionLine(lesson, index)}
      />

      {/* Calm banner while the device is offline — the cached lesson stays usable */}
      <OfflineBanner />

      {/* Anchor for system offers — one ask at a time, just below the top bar.
          A break offer (B.7) outranks the modality suggestion. */}
      <div className="relative">
        {showBreakOffer ? (
          <BreakOfferPill
            key={`break-offer-${segment.id}`}
            trigger={showOfferedBreak ? "instruction" : "time"}
            onAccept={acceptBreakOffer}
            onDismiss={dismissBreakOffer}
          />
        ) : (
          showSuggestion && (
            <ModalitySuggestionPill
              key={`pill-${segment.id}`}
              modality={suggested}
              onAccept={acceptSuggestion}
              onAcceptStart={() =>
                trackBusy(BUSY_REASON.MODALITY_SWITCH, BUSY_PHASE.START)
              }
              onDismiss={dismissSuggestion}
            />
          )
        )}
      </div>

      {/* Content — centered reading column. 37b: boredom frames it in a soft
          violet border ("more here if you want it"). */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div
          className={cn(
            // The bottom padding clears the Ask Nevo trigger, which is
            // `fixed` and therefore lands ON this scrolling column rather than
            // below it. The arithmetic, on mobile: the chevron nav is
            // pt-2 + size-12 + pb-6 = 80px and `shrink-0`, so this region ends
            // 80px off the bottom; the trigger is `bottom-[82px]` and 52px
            // tall, so it sits between 134px and 82px off the bottom - inside
            // this column, over the last line's right-hand end. 88px of slack
            // means text always stops above it.
            //
            // Not needed from `sm:` up: there the trigger is the 44px pill at
            // `bottom-6`, which ends 68px off the bottom - below this region
            // entirely, in the nav row, and clear of the centred chevrons.
            // `sm:p-8` and `lg:p-10` reset it on their own - measured against
            // the real stylesheet at 375 / 700 / 1280, giving 88 / 32 / 40px -
            // because their media rules come after the base utility.
            "mx-auto w-full max-w-full p-6 pb-[88px] sm:max-w-[620px] sm:p-8 lg:max-w-[680px] lg:p-10",
            stepUpOffered && "rounded-[12px] border-2 border-nevo-violet/45",
          )}
        >
          {feedback && <FeedbackStrip message={feedback} />}
          {stepUpOffered && !spentEscalations.has(segment.id) && (
              <DifficultyOfferPill
                key={`stepup-${segment.id}`}
                onSpent={() => {
                  setSpentEscalations((prev) => new Set(prev).add(segment.id));
                  setFeedback("Noted - we'll step things up.");
                }}
              />
            )}
          {action === ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL &&
            guidedQuestions.length > 0 && (
              <SocraticPanel
                key={`socratic-${segment.id}`}
                prompts={guidedQuestions}
              />
            )}
          <div
            // Remount on either axis so entry motion replays and per-modality
            // state (audio playback, ticked steps) never leaks across segments.
            key={`${segment.id}:${modality}`}
            ref={bodyRef}
            /*
             * FOCUSABLE, BECAUSE THE REMOUNT ABOVE DESTROYS FOCUS.
             *
             * Changing the key throws this subtree away and builds a new one,
             * so anything focused inside it goes with it and the browser drops
             * focus to <body>. A child using a keyboard or switch access was
             * therefore returned to the top of the document on every single
             * advance, and had to tab back down through the whole player to
             * reach the next piece of content. Nothing on screen said so.
             *
             * `role="group"` with the position as its name so that landing here
             * announces "Module 2 of 3 · Segment 1 of 4 in this module" before
             * the content - the orientation a sighted child gets for free from
             * the line above the progress bar.
             */
            tabIndex={-1}
            role="group"
            aria-label={positionLine(lesson, index)}
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-nevo-slide focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-nevo-navy"
          >
            <SegmentBody
              segment={segment}
              modality={modality}
              density={effectiveDensity}
              reading={readingOn}
              attention={attentionOn}
              onReadProgress={noteReadProgress}
              onReplay={() =>
                trackEvent(SIGNAL_EVENT_TYPES.REPLAY, { segmentId: segment.id })
              }
              onAudioBusy={(phase) =>
                trackBusy(BUSY_REASON.MEDIA_PLAYING, phase)
              }
              onCalcSolved={() => {
                setSolvedCalcs((prev) => new Set(prev).add(segment.id));
                // Solving the calculation is the centrepiece interaction of
                // 17b and emitted NOTHING - the local set was the only trace.
                trackEvent(SIGNAL_EVENT_TYPES.CALCULATION_COMPLETE, {
                  segmentId: segment.id,
                });
              }}
              onCalcStep={(correct) =>
                // The ingest enum has a type for this. It was riding
                // `comprehension_response` under a `kind` of our own invention,
                // which obliges the engine to know our convention - and no
                // batch had ever actually landed under it, so switching now
                // costs no history.
                trackEvent(SIGNAL_EVENT_TYPES.CALCULATION_STEP_RESPONSE, {
                  segmentId: segment.id,
                  correct,
                })
              }
              onPiecePlaced={(placed, needed) =>
                trackEvent(SIGNAL_EVENT_TYPES.MANIPULATIVE_PIECE_PLACED, {
                  segmentId: segment.id,
                  placed,
                  needed,
                })
              }
            />
          </div>
          {/* §4 `offer_hint`: the unrequested hint under the content. */}
          {action === ADJUSTMENT_ACTIONS.OFFER_HINT && hintText && (
            <HintOverlay hint={hintText} />
          )}
        </div>
      </div>

      {segment.quickCheck && (
        <QuickCheckSheet
          key={`check-${segment.id}`}
          check={segment.quickCheck}
          open={checkOpen}
          onOpenChange={setCheckOpen}
          onAnswered={(correct) => {
            trackEvent(SIGNAL_EVENT_TYPES.COMPREHENSION_RESPONSE, {
              kind: "quick_check",
              segmentId: segment.id,
              correct,
            });
            if (correct)
              setPassedChecks((prev) => new Set(prev).add(segment.id));
          }}
          onContinue={() => {
            setCheckOpen(false);
            setFeedback("Nice - that's got it. Here's what's next.");
            advancePastSegment();
          }}
        />
      )}

      <LeaveLessonDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onLeave={() => {
          // `exited` is a status the contract defines and nothing ever sent.
          // Leaving deliberately is not the same fact as drifting off mid
          // segment, and the engine is entitled to tell them apart - the
          // position is identical either way, the intent is not.
          // Same reason as the position write above: leaving a REVIEW part way
          // says nothing about the lesson, which was finished before the review
          // began. Writing `exited` here would demote it on the way out.
          if (!review) {
            reportProgress(LESSON_STATUS.EXITED, { segment: index });
          }
          router.push(LESSONS_HREF);
        }}
      />

      {/* Chevron nav — dims under anxiety; frustration guides the forward
          control with three quiet glow cycles (never displaces it). */}
      <nav
        className={cn(
          "flex shrink-0 items-center justify-center gap-8 px-3.5 pt-2 pb-6",
          secondaryDim(softened, attentionOn),
        )}
      >
        <ChevronButton
          dir="prev"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        />
        <ChevronButton
          dir="next"
          disabled={nextDisabled}
          onClick={handleNext}
          className={cn(
            action === ADJUSTMENT_ACTIONS.OFFER_HINT &&
              !nextDisabled &&
              "motion-safe:animate-nevo-glow-guide",
          )}
        />
      </nav>
    </div>
  );
}

/** Renders the segment through the active modality. */
function SegmentBody({
  segment,
  modality,
  density,
  reading,
  attention,
  onReadProgress,
  onReplay,
  onAudioBusy,
  onCalcSolved,
  onCalcStep,
  onPiecePlaced,
}: {
  segment: LessonSegment;
  modality: Modality;
  density: Density | null;
  reading: boolean;
  attention: boolean;
  onReadProgress: (pct: number) => void;
  onReplay: () => void;
  onAudioBusy: (phase: BusyPhase) => void;
  onCalcSolved: () => void;
  onCalcStep: (correct: boolean) => void;
  onPiecePlaced: (placed: number, needed: number) => void;
}) {
  if (modality === MODALITY.TEXT && segment.text)
    return (
      <TextSegment
        content={segment.text}
        density={density}
        reading={reading}
        attention={attention}
        onReadProgress={onReadProgress}
      />
    );
  if (modality === MODALITY.VISUAL && segment.visual)
    return <VisualSegment content={segment.visual} />;
  if (modality === MODALITY.AUDIO && segment.audio)
    return (
      <AudioSegment
        content={segment.audio}
        onReplay={onReplay}
        onBusy={onAudioBusy}
      />
    );
  if (modality === MODALITY.INTERACTIVE) {
    // A calculation segment routes the Interactive modality to the solver (§8).
    if (segment.calculationVariant && segment.calculation)
      return (
        <CalculationSolver
          calculation={segment.calculation}
          onSolved={onCalcSolved}
          onStepAnswered={onCalcStep}
          onReplay={onReplay}
          onPiecePlaced={onPiecePlaced}
        />
      );
    if (segment.interactive)
      return <InteractiveSegment content={segment.interactive} />;
  }
  return <ModalityPlaceholder />;
}

function ChevronButton({
  dir,
  disabled,
  onClick,
  className,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous" : "Next"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-12 items-center justify-center rounded-full transition-colors",
        disabled
          ? "cursor-not-allowed text-nevo-near-black/20"
          : "cursor-pointer text-nevo-navy hover:bg-nevo-navy/6 active:bg-nevo-cream-elevated",
        className,
      )}
    >
      <Icon className="size-6" strokeWidth={2} />
    </button>
  );
}

/** Fallback for content this slice can't render yet (the calculation solver, Slice 6). */
function ModalityPlaceholder() {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-[12px] bg-nevo-cream-elevated">
      <span className="font-mono text-xs tracking-[0.04em] text-nevo-near-black/40">
        This modality is coming next
      </span>
    </div>
  );
}
