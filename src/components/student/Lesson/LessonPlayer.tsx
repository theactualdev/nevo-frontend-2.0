"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { useLesson, useSignals } from "@/hooks";
import type { SessionOutcome } from "@/hooks/useSignals";
import {
  useRuntimeAdaptation,
  type AppliedAdaptations,
} from "@/hooks/useRuntimeAdaptation";
import { useLessonExit } from "./LessonExit";
import { useScaffoldLevel } from "@/hooks/useScaffoldLevel";
import { intelligenceApi, type AdaptSegment } from "@/lib/api/intelligence";
import type {
  AdaptationPlan,
  DensityLevel,
  Lesson,
  LessonSegment,
} from "@/lib/types";
import { cn, randomId } from "@/lib/utils";
import {
  lessonModules,
  modulePositionFor,
  opensLaterModule,
  positionLine,
} from "@/lib/utils/modules";
import {
  secondaryDim,
  HintOverlay,
  SocraticPanel,
  type GuidedAnswerOutcome,
  type GuidedReply,
  type PanelPrompt,
} from "./AffectiveLayer";
import { AfterLessonAssessment } from "./AfterLessonAssessment";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants/affect";
import { densityForAction } from "@/lib/lessons/densityForAction";
import { densitySpacing } from "@/lib/lessons/densitySpacing";
import { depthShown, type DepthShown } from "@/lib/lessons/depthShown";
import { scaffoldAttemptFor } from "@/lib/lessons/scaffoldAttempt";
import { scaffoldsApi } from "@/lib/api/scaffolds";
import { useAssignmentNote } from "@/hooks/useAssignmentNote";
import { isChunkable } from "@/lib/lessons/chunk";
import {
  LESSON_STATUS,
  lessonsApi,
  type LessonQuestionAttemptWrite,
} from "@/lib/api/lessons";
import { schedulerApi } from "@/lib/api/scheduler";
import { attemptFor } from "@/lib/lessons/attempts";
import { answersBefore, checkResumeAt } from "@/lib/lessons/checkResume";
import { checkOutcomeFrom } from "@/lib/lessons/checkOutcome";
import {
  REVIEW_COPY,
  reviewCompletionCopy,
  reviewOutcome,
  type RecallEvidence,
  type ReviewRecord,
} from "@/lib/lessons/reviewOutcome";
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
import {
  type ReviewAnswer,
  saveCheckOutcome,
  saveReviewAnswers,
} from "./reviewStore";
import { TeacherNote } from "./TeacherNote";
import { TextSegment } from "./TextSegment";
import { VisualSegment } from "./VisualSegment";
import type { MediaFailReason } from "./useMediaSource";

// Finishing a lesson goes back to the lessons (frame: "Back to lessons");
// leaving one part way goes Home (IA: "Leave for now" -> Home Dashboard).
const LESSONS_HREF = "/student/lessons";
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

/** One object, so the signal session is not told the same ending twice. */
const COMPLETED: SessionOutcome = { completionStatus: "completed" };

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
  finished = false,
  assignmentId,
  startAt = 0,
  placeUnknown = false,
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
   * The child already finished this lesson, and is opening it again to look
   * back over it (design D22, 1 Oct). Writes no `in_progress` or `exited`, for
   * the same reason a review writes neither: a finished lesson reopened is
   * never marked unfinished. Finishing it again still reports completion.
   */
  finished?: boolean;
  /**
   * Segment to open on, from saved progress. Clamped by the caller; a review
   * session always opens at the top regardless.
   */
  startAt?: number;
  /**
   * Where the child got to could not be read, so `startAt` is a default and
   * not their place. The opening segment is then not written until they move.
   */
  placeUnknown?: boolean;
  /** Passed to the review entry screen so its recency line is a fact. */
  lastWorkedAt?: string | null;
  /**
   * Review session (37d): the same player as a spaced-retrieval variant. Adds
   * only an entry screen, the REVIEW pill during, and its own completion
   * message (D40); the after-lesson assessment is skipped (the quick checks
   * are the recall).
   */
  review?: boolean;
  /** The concept a review session is for; absent on an ordinary lesson. */
  reviewConceptId?: string;
}) {
  // Every exit from the lesson - see `useLessonExit`.
  const exitTo = useLessonExit();
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
  // How the session ended travels on its envelope; set where it ends.
  const [ending, setEnding] = useState<SessionOutcome | null>(null);
  /*
   * WHAT THE CHILD SAW APPLIED (B42), counted where it reaches the screen:
   * the system's reshape of the text, a modality change from an offer taken,
   * a hint. Not offers, not instructions the screen could not show, and not
   * the child's own picks. The count rides the session envelope and the
   * moment feeds the engine's cooldown - see `AppliedAdaptations`.
   */
  const applied = useRef<AppliedAdaptations>({ count: 0, lastAt: null });
  const noteApplied = useCallback(() => {
    applied.current.count += 1;
    applied.current.lastAt = performance.now();
  }, []);
  const { trackEvent } = useSignals(
    progress.sessionId,
    lesson.id,
    "lesson",
    ending,
    applied,
  );
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
  // density - the engine's instruction or the segment plan's, and NOTHING
  // when neither gave one (D23, below) - which renders as the violet chip and
  // supplies the view until the student overrides. Both can show at once.
  const [density, setDensity] = useState<Density | null>(null);
  /*
   * THE ENGINE'S DENSITY LEVEL, READ ON THE WAY INTO A SEGMENT (D25), and held
   * for that visit.
   *
   * Rendered only as spacing - see `densitySpacing`. Read at the boundary
   * rather than live because the mid-lesson read is asked as a child arrives,
   * so its answer lands a moment after the segment has drawn: applied live,
   * the gaps would visibly shift under a child who had just started reading,
   * which is the snap rule 7 forbids. A newer answer reaches the next segment
   * entered. Keyed by segment, like `chunkRead`, so it cannot outlive one.
   */
  const [entryDensity, setEntryDensity] = useState<{
    segmentId: string;
    level: DensityLevel | null;
  }>(() => ({ segmentId: first.id, level: firstPlan?.densityLevel ?? null }));
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
  /*
   * The inline checks, by segment: how many picks it took and whether a hint
   * was showing first - what B28's `outcome` reports. A review skips the
   * after-lesson questions, so these are the only answers it ever has.
   */
  const checkRecall = useRef<Map<string, RecallEvidence & { picks: number }>>(
    new Map(),
  );
  // Segments whose hint was on screen, for `after_hint`.
  const hintedSegments = useRef<Set<string>>(new Set());
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
   * the lesson stayed demoted, came back on Home as unfinished work to pick
   * up, and the child was invited to redo work they had done. The record of
   * having completed it was simply gone.
   *
   * The review's own outcome belongs to the scheduler
   * (`POST /api/scheduler/record-review`, sent at the end - see below), not to
   * the lesson's progress, so a review leaves that progress alone rather than
   * overwrite it with something false.
   */
  // An unknown place opens at the top, and the top is not a position: it is
  // written once the child moves, never over the place they really reached.
  const unplacedAt = useRef<number | null>(placeUnknown ? opening : null);
  useEffect(() => {
    // A finished lesson reopened is the same case - see `finished`.
    if (review || finished) return;
    if (unplacedAt.current === index) return;
    unplacedAt.current = null;
    const pos = modulePositionFor(lesson, index);
    reportProgress(LESSON_STATUS.IN_PROGRESS, {
      segment: index,
      ...(pos ? { module: pos.moduleIndex } : {}),
    });
  }, [lesson, index, review, finished, reportProgress]);

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
   * B49: A CHECK LEFT PART WAY REOPENS WHERE IT WAS LEFT, the same day.
   * Decided once, as the child moves into the check - see `beginCheck`.
   * `landed` is how many of the answers from before landed, once read back;
   * `reading` while that read is out.
   */
  const [checkResume, setCheckResume] = useState<{
    at: number;
    landed: number | null;
    reading: boolean;
  } | null>(null);
  // The answers still on their way, which the completion waits for.
  const attemptWrites = useRef<Promise<unknown>[]>([]);

  /*
   * B26: THE CHECK-IN'S OUTCOME comes back on the completion write and on no
   * read, so it is kept here for the summary, which is its own route.
   */
  const savedRow = progress.saved;
  useEffect(() => {
    if (!live) return;
    const outcome = checkOutcomeFrom(savedRow);
    if (outcome) saveCheckOutcome(lesson.id, outcome);
  }, [live, lesson.id, savedRow]);

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
   * sent at all, because there is no evidence either way and a cheerful
   * outcome for reaching the end is exactly what Zero-Tag exists to stop.
   *
   * What is sent is B28's `outcome` - what happened, not a mark - and the
   * server decides whether it counts as recall.
   *
   * A failure is not announced. The scheduler missing one outcome costs a
   * slightly wrong interval; telling a child their review did not count would
   * be worse and is not true - they did the work. The completion screen simply
   * claims nothing the scheduler did not confirm.
   */
  /*
   * 37a's indicator, sourced from the scaffolds engine where a concept exists.
   * Null on an ordinary lesson, and null on a read that did not answer.
   */
  const conceptScaffold = useScaffoldLevel(reviewConceptId);

  /*
   * What a teacher wrote when they set this lesson. Null for a lesson opened
   * from the library, which has no assignment to carry one.
   */
  const teacherNote = useAssignmentNote(assignmentId);

  /*
   * SENT FROM THE MOVE THAT FINISHES THE REVIEW, not from an effect on the
   * phase, because the completion screen now waits on the answer (D40): what
   * it may claim is what the scheduler said back. See `reviewCompletionCopy`.
   */
  const reviewRecorded = useRef(false);
  const [reviewRecord, setReviewRecord] = useState<ReviewRecord>({
    state: "unsent",
  });
  const recordReview = () => {
    if (!review || !reviewConceptId) return;
    if (reviewRecorded.current) return;
    const studentId = getSession()?.userId;
    if (!studentId) return;

    const questions = lesson.assessment?.questions ?? [];
    /*
     * THE INLINE CHECKS COUNT TOO, and in a review they are all there is.
     * This read only the after-lesson questions - which a review skips by
     * design - so `onThisConcept` was always empty and the outcome was never
     * sent, however the child did.
     *
     * An after-lesson question has no second try - a miss moves on - so its
     * first answer is the whole of the evidence.
     */
    const onThisConcept: RecallEvidence[] = [
      ...questions.map((q, i) => {
        const first = firstAnswers.current.get(i);
        return {
          conceptId: q.conceptId,
          evidence:
            first === undefined
              ? undefined
              : { rightOnPick: first ? 1 : null, hinted: false },
        };
      }),
      ...lesson.segments.map((s) => ({
        conceptId: s.quickCheck?.conceptId,
        evidence: checkRecall.current.get(s.id),
      })),
    ].flatMap((q) =>
      q.conceptId === reviewConceptId && q.evidence ? [q.evidence] : [],
    );
    const outcome = reviewOutcome(onThisConcept);
    if (!outcome) return;

    reviewRecorded.current = true;
    setReviewRecord({ state: "pending" });
    schedulerApi
      .recordReview({ studentId, conceptId: reviewConceptId, outcome })
      .then((response) => setReviewRecord({ state: "recorded", response }))
      .catch(() => setReviewRecord({ state: "failed" }));
  };
  // SCRUM-101: the segment index the player is about to enter across a module
  // boundary. Non-null takes over the screen with the boundary landing; the
  // student's continue (or break + "I'm ready") completes the move.
  const [boundaryTo, setBoundaryTo] = useState<number | null>(null);
  /*
   * ARRIVING AT A BOUNDARY IS ARRIVING IN THE NEXT MODULE.
   *
   * The position effect above watches `index`, which does not move until the
   * child leaves this screen - so a child who closed the app here resumed on
   * the last segment of the module they had just finished, and met the same
   * boundary again. The place written is the one the boundary opens onto.
   */
  useEffect(() => {
    if (review || finished || boundaryTo === null) return;
    const pos = modulePositionFor(lesson, boundaryTo);
    reportProgress(LESSON_STATUS.IN_PROGRESS, {
      segment: boundaryTo,
      ...(pos ? { module: pos.moduleIndex } : {}),
    });
  }, [lesson, boundaryTo, review, finished, reportProgress]);
  // Break module (frame 18): a plan-delivered break takes over the screen on
  // the way out of its segment; finishing it resumes the interrupted advance.
  // One break per segment - taken breaks never re-trigger on a back-and-forth.
  const [breakActive, setBreakActive] = useState<BreakType | null>(null);
  const breaksTaken = useRef<Set<string>>(new Set());
  // Where the active break came from: "advance" resumes the interrupted move,
  // "offer" returns to the same segment, "boundary" enters the next module.
  // Trigger travels into `break_start`.
  const breakOrigin = useRef<"advance" | "offer" | "boundary">("advance");
  const breakTrigger = useRef<string>("adaptation_plan");
  // Break OFFERS (B.7/§4): spent per segment, whoever made them. Declining
  // spends; the same segment never re-asks.
  /*
   * THERE IS NO CLIENT TIMER ANY MORE. A 20-minute clock here offered breaks
   * the engine had not decided - when it said no, when the read failed, and
   * in reviews - and frontend §5b is plain that the timing is never ours. It
   * was also spent once per lesson, so after one offer every break the ENGINE
   * suggested was dropped for the rest of it. Absent an engine offer, nothing
   * is offered (rule 5).
   */
  const [spentBreakOffers, setSpentBreakOffers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Hints the child closed, by segment and hint - see `hintHere`.
  const [closedHints, setClosedHints] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /*
   * WHAT THE ENGINE IS TOLD THE CHILD DID, as counts - see `RuntimeState`.
   * State rather than refs because the request is built from what renders.
   */
  const [observed, setObserved] = useState({
    replays: 0,
    consecutiveErrors: 0,
    declined: [] as Modality[],
    declines: 0,
    shownHere: false,
    sinceShown: null as number | null,
    breaksTaken: 0,
  });
  const noteAnswer = (correct: boolean) =>
    setObserved((o) => ({
      ...o,
      consecutiveErrors: correct ? 0 : o.consecutiveErrors + 1,
    }));
  // The engine answer whose modality offer has been spent - see `suggested`.
  const [spentSuggestionOf, setSpentSuggestionOf] =
    useState<AdaptationPlan | null>(null);
  // The offer on screen right now, for `ignored` when the child moves on.
  const shownSuggestion = useRef<{ segmentId: string; suggested: Modality } | null>(
    null,
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
   * The engine's mid-lesson read, asked at each segment boundary and when the
   * child does something it reports.
   *
   * The engine decides whether a break is warranted and WHICH; nothing on
   * this side primes or times one.
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
      replayCountOnSegment: observed.replays,
      consecutiveErrors: observed.consecutiveErrors,
      declinedModalities: observed.declined,
      sessionDeclineCount: observed.declines,
      sameSegmentSuggestionShown: observed.shownHere,
      segmentsSinceLastSuggestion: observed.sinceShown,
      breaksTaken: observed.breaksTaken,
    },
    lesson,
    applied,
  );

  /*
   * THE ENGINE'S NEWEST WORD ON A SEGMENT, over what it said at load.
   *
   * Merged rather than replaced: an in-lesson row carries the segment's
   * modality, scaffold and suggestion, and nothing about breaks - so the
   * load-time plan's planned and offered breaks survive the engine
   * reconsidering the rest.
   */
  const livePlanFor = (segmentId: string) => {
    const base = planFor(segmentId);
    const fresh = runtime.plan?.segments.find((s) => s.segmentId === segmentId);
    return fresh ? { ...base, ...fresh } : base;
  };

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
  /** The text version on screen, for `time_on_segment` - see `depthShown`. */
  const textShown = useRef<{ segmentId: string; depth: DepthShown } | null>(
    null,
  );
  /*
   * The segment whose chunked body still has parts to show, for the chevrons
   * (37c, below). State rather than the ref above because the screen changes
   * with it; stamped with the id for the same reason the ref is.
   */
  const [partsLeftOn, setPartsLeftOn] = useState<string | null>(null);
  const noteReadProgress = useCallback(
    (pct: number) => {
      chunkRead.current = { segmentId: lesson.segments[index].id, pct };
      setPartsLeftOn(pct < 100 ? lesson.segments[index].id : null);
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
  // change, or the segments phase ending) or on unmount. Keyed on `index` so
  // within-segment modality/density changes don't split the timing.
  /*
   * ONLY THE TIME THE SEGMENT WAS ON SCREEN. This was keyed on the index
   * alone, so the review entry screen, a break, a module boundary rest and
   * the whole after-lesson check all counted as time on the segment beneath
   * them - a child resting or answering reported as dwelling, which is the
   * reading the engine takes as struggle. The clock now runs only while the
   * segment is showing and pauses under anything that covers it.
   */
  const inSegments = phase === "segments";
  const segmentShowing =
    inSegments && breakActive === null && boundaryTo === null;
  const segmentClock = useRef<{ shownMs: number; since: number | null } | null>(
    null,
  );
  useEffect(() => {
    if (!inSegments) return;
    const clock = { shownMs: 0, since: null as number | null };
    segmentClock.current = clock;
    const segId = lesson.segments[index].id;
    scrollDepth.current = 0;
    scrollMarks.current = new Set();
    return () => {
      // Monotonic (rule 4): this duration goes to the engine, and a wall
      // clock that jumps - a tablet correcting itself mid-lesson - sends a
      // negative.
      const shownMs =
        clock.shownMs +
        (clock.since === null ? 0 : performance.now() - clock.since);
      // An offer still on screen as the child moves on was neither taken nor
      // turned down.
      const offer = shownSuggestion.current;
      if (offer?.segmentId === segId) {
        shownSuggestion.current = null;
        trackEvent(SIGNAL_EVENT_TYPES.MODALITY_SUGGESTION_IGNORED, {
          segmentId: segId,
          suggested: offer.suggested,
        });
      }
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
      // B45: the text version on screen as the child left, stamped with the
      // segment like `chunkRead`. Unknown is left out rather than guessed.
      const depth =
        textShown.current?.segmentId === segId ? textShown.current.depth : null;
      trackEvent(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT, {
        segmentId: segId,
        durationMs: Math.max(0, Math.round(shownMs)),
        ...(depth ? { depthShown: depth } : {}),
        scrollDepthPct: chunked ?? Math.round(scrollDepth.current),
      });
    };
  }, [index, inSegments, lesson.segments, trackEvent]);

  // Runs the clock above while the segment is on screen. Declared AFTER it,
  // so on a segment change this starts the new clock rather than the old one.
  useEffect(() => {
    const clock = segmentClock.current;
    if (!segmentShowing || !clock) return;
    clock.since = performance.now();
    return () => {
      if (clock.since !== null) clock.shownMs += performance.now() - clock.since;
      clock.since = null;
    };
  }, [segmentShowing, index]);

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
  // ONLY WHILE THE QUICK CHECK IS UP, the one sheet whose scrim really blocks.
  // Every sheet broadcasts, so this recorded `tap_blocked` for scrim taps that
  // dismissed something, which is the opposite of blocked.
  useEffect(() => {
    if (!checkOpen) return;
    const onScrimTap = () =>
      trackEvent(SIGNAL_EVENT_TYPES.TAP_BLOCKED, { target: "scrim" });
    window.addEventListener("nevo-scrim-tap", onScrimTap);
    return () => window.removeEventListener("nevo-scrim-tap", onScrimTap);
  }, [checkOpen, trackEvent]);

  // ── The engine's instruction (§4) ───────────────────────────────────────
  const segPlan = livePlanFor(segment.id);
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
  /*
   * The engine's NEWEST answer wins, and its silence counts: once it has
   * answered mid-lesson, an absent instruction means none now (rule 5), not
   * "keep whatever it said at load".
   */
  const engine = runtime.plan ?? plan;
  const action = engine?.adjustment ?? segPlan?.adjustment ?? null;
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
   *
   * AND ONLY ON THE SEGMENT IT WAS GIVEN FOR. The engine's instruction is
   * lesson-level on the wire, but a hint or a guided question is about the
   * content in front of the child when it was asked for: the segment a
   * mid-lesson read was made on, or the one the lesson opened on for the
   * load-time plan. Without this the same hint sat under every later segment,
   * and a failed read kept it there indefinitely. The authored per-segment
   * seam is already per segment.
   */
  const engineOn = runtime.plan ? runtime.forSegmentId : first.id;
  const contentHere = !engine?.adjustment || engineOn === segment.id;
  const hintText = engine?.hint ?? segPlan?.hint ?? null;
  /*
   * The panel's rows, read the way the questions always were. Where the
   * engine sent answerable prompts they are shown INSTEAD of its bare
   * questions, not as well: both describe the same panel, and only a prompt
   * has an id a reply can be sent against (B19).
   */
  const guidedPrompts: PanelPrompt[] = engine?.guidedPrompts?.length
    ? engine.guidedPrompts
    : (engine?.guidedQuestions?.length
        ? engine.guidedQuestions
        : (segPlan?.socraticPrompts ?? [])
      ).map((prompt) => ({ prompt }));
  /*
   * A hint the child closed stays closed for that segment (D29). Keyed by the
   * hint as well, so a different hint the engine sends later still shows.
   */
  const hintKey = `${segment.id}:${hintText ?? ""}`;
  const hintHere =
    contentHere &&
    action === ADJUSTMENT_ACTIONS.OFFER_HINT &&
    !closedHints.has(hintKey);
  /*
   * `hint_offered` (B20): the hint card went on screen. Once per hint per
   * segment - a return visit or a re-render is not the engine offering it
   * again. `hint_used` (B41) is sent as the child moves on with this hint
   * still on screen - see `advancePastSegment`. The solver's "Need a hint?"
   * is the hint a child opens, and it is frozen.
   */
  const hintOnScreen = segmentShowing && hintHere && Boolean(hintText);
  const offeredHints = useRef<Set<string>>(new Set());
  const usedHints = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hintOnScreen || offeredHints.current.has(hintKey)) return;
    offeredHints.current.add(hintKey);
    trackEvent(SIGNAL_EVENT_TYPES.HINT_OFFERED, { segmentId: segment.id });
    // An unrequested hint on screen is an adaptation applied (B42).
    noteApplied();
  }, [hintOnScreen, hintKey, segment.id, trackEvent, noteApplied]);

  /*
   * A REPLY TO A GUIDED PROMPT (B19) goes to its own route, which puts it on
   * the signal stream as `guided_question_answered` itself - so it is not
   * also emitted here, or the engine would read one reply as two. Never the
   * child's words: the option they picked, how much they wrote, or that they
   * left it (6 Oct, frame 38).
   *
   * Live lessons and a signed-in child only; a demo's prompt ids mean nothing
   * to the engine. Fire and forget, like the scaffold attempt: a reply that
   * did not land costs one reading, and telling a child their thinking did
   * not count would be worse and untrue.
   */
  const answerGuided = (
    promptId: string,
    outcome: GuidedAnswerOutcome | "abandoned",
    reply?: GuidedReply,
  ) => {
    const studentId = getSession()?.userId;
    if (!live || !studentId) return;
    void intelligenceApi
      .answerGuidedQuestion({
        studentId,
        sessionId: progress.sessionId ?? null,
        promptId,
        ...reply,
        outcome,
      })
      .catch(() => {});
  };
  // UDL accommodations (37c) - cross-session delivery themes from the plan.
  const readingOn = Boolean(plan?.accommodations?.reading);
  const attentionOn = Boolean(plan?.accommodations?.attention);
  // A hint seen before the check is answered makes a right answer `after_hint`
  // rather than `first_time` (B28) - only the first lengthens the interval.
  useEffect(() => {
    if (segmentShowing && hintHere && hintText)
      hintedSegments.current.add(segment.id);
  }, [segmentShowing, hintHere, hintText, segment.id]);

  // Break OFFERS (B.7): the plan names a break type to OFFER on this segment,
  // or the engine suggests one mid-lesson. One ask on screen at a time - an
  // offered break outranks (and suppresses) the modality suggestion.
  //
  // `offerBreak` BEING PRESENT IS THE INSTRUCTION now. It used to be gated on
  // the frustration state as well, so the plan could name a break and be
  // ignored because the frontend disagreed about why - rule 5 read backwards.
  const offeredBreakType = segPlan?.offerBreak ?? null;
  const showOfferedBreak =
    offeredBreakType !== null && !spentBreakOffers.has(segment.id);
  // The engine's own call, for the segment it was asked about - its answer
  // about the segment just left is not an offer for this one.
  const engineBreak =
    runtime.forSegmentId === segment.id ? (runtime.offeredBreak ?? null) : null;
  const breakOffered = showOfferedBreak
    ? offeredBreakType
    : engineBreak !== null && !spentBreakOffers.has(segment.id)
      ? engineBreak
      : null;
  const showBreakOffer = breakOffered !== null;
  // Who asked, as every offer event and the break it leads to say it: the
  // catalogue's one key. NOT RENAMED, deliberately - these are wire values in
  // the set backend closed (with `adaptation_plan` and `module_boundary`), so
  // they are not ours to tidy.
  const offerTrigger = showOfferedBreak ? "affect_offer" : "engine_offer";

  /*
   * THE ENGINE'S SUGGESTION IS ONE OFFER PER ANSWER. It is lesson-level (see
   * `toAdaptationPlan`), so a mid-lesson answer is offered on the segment it
   * was asked about, and the load-time one wherever it can first be drawn -
   * once, and spent by being taken, turned down or left on screen. The
   * per-segment `suggestModality` is the authored seam and keeps its own
   * per-segment rule.
   */
  const engineSuggests = runtime.plan
    ? runtime.forSegmentId === segment.id
      ? (runtime.plan.suggestModality ?? null)
      : null
    : (plan?.suggestModality ?? null);
  const authoredSuggests = segPlan?.suggestModality ?? null;
  const suggestionFromEngine =
    authoredSuggests === null && engineSuggests !== null && engine !== spentSuggestionOf;

  // Offer the plan's suggestion only while it's renderable and not already
  // showing. Rate-limits: never on consecutive segments, never on the first
  // segment after a module boundary (SCRUM-101 - the student just made a
  // transition decision; don't stack an adaptation offer on top of it), and
  // never alongside a break offer.
  const suggested = authoredSuggests ?? (suggestionFromEngine ? engineSuggests : null);
  const offerable =
    !suggestionSpent &&
    suggested !== null &&
    suggested !== modality &&
    hasContent(segment, suggested);
  const consecutive = lastSuggestedIndex === index - 1;
  const afterBoundary = opensLaterModule(lesson, index);
  const showSuggestion =
    offerable && !showBreakOffer && !consecutive && !afterBoundary;

  /*
   * AN OFFER THE PLAYER'S OWN RULES HOLD BACK IS NOT REPORTED FROM HERE.
   * `adaptation_suppressed` is server-written (backend, 5 Oct, B37): this
   * player sent it too, from #623 until 6 Oct, which doubled every
   * suppression the engine counted. See `SERVER_WRITTEN_EVENT_TYPES`.
   */

  const go = (next: number) => {
    if (next < 0 || next >= total) return;
    // Leaving a segment that had a live offer counts as that segment having
    // suggested — the next segment must stay quiet (never consecutive).
    if (showSuggestion) setLastSuggestedIndex(index);
    // An engine offer left on screen is spent with the segment it was on.
    if (suggestionFromEngine && shownSuggestion.current?.segmentId === segment.id)
      setSpentSuggestionOf(engine);
    setObserved((o) => ({
      ...o,
      replays: 0,
      shownHere: false,
      sinceShown: o.sinceShown === null ? null : o.sinceShown + 1,
    }));
    const nextSegment = lesson.segments[next];
    const nextPlan = livePlanFor(nextSegment.id);
    setIndex(next);
    setEntryDensity({
      segmentId: nextSegment.id,
      level: nextPlan?.densityLevel ?? null,
    });
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
    // Review sessions end on their own completion - the quick checks were the
    // retrieval, so no second assessment (37d).
    const assess = hasAssessment && !review;
    if (assess) beginCheck();
    setPhase(assess ? "assessment" : "complete");
    if (!assess) setEnding(COMPLETED);
    if (!assess) recordReview();
  };

  /**
   * Leave the current segment forward. A plan-delivered break (frame 18)
   * intercepts once on the way out; finishing it resumes this same advance.
   */
  const advancePastSegment = () => {
    // B41: moving on with the whole hint still on screen is acting on it. A
    // hint the child closed is not on screen, and stays `hint_offered` alone.
    if (hintOnScreen && !usedHints.current.has(hintKey)) {
      usedHints.current.add(hintKey);
      trackEvent(SIGNAL_EVENT_TYPES.HINT_USED, { segmentId: segment.id });
    }
    const plannedBreak = livePlanFor(segment.id)?.breakAfter ?? null;
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
    if (!breakOffered) return;
    setSpentBreakOffers((prev) => new Set(prev).add(segment.id));
    trackEvent(SIGNAL_EVENT_TYPES.BREAK_TAKEN, { trigger: offerTrigger });
    breakTrigger.current = offerTrigger;
    breakOrigin.current = "offer";
    // The type is whoever asked's: nothing here picks one.
    setBreakActive(breakOffered);
  };

  /*
   * "NOT NOW" IS AN ANSWER, and the catalogue has a type for it now. Without
   * `break_declined` the engine could not tell a child who turned the offer
   * down from one who never answered it, and may offer again a minute later.
   * Moving on with the pill still up stays no answer at all.
   */
  const dismissBreakOffer = () => {
    if (!breakOffered) return;
    setSpentBreakOffers((prev) => new Set(prev).add(segment.id));
    trackEvent(SIGNAL_EVENT_TYPES.BREAK_DECLINED, { trigger: offerTrigger });
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
   *
   * **NO INSTRUCTION IS THE STANDARD TEXT** (design, 1 Oct, D23). This fell
   * back to Simplify - the frame's `adaptive ?? "Simplify"` - so every segment
   * with a simpler version opened on it, under a pulsing violet chip claiming
   * a system action nobody had taken. Standard is the lesson as the teacher
   * wrote it, and "the front end does not choose a teaching treatment the
   * engine did not ask for." With no instruction there is no system density,
   * so no chip lights.
   *
   * The engine is told which version was on screen: `depthShown` on every
   * `time_on_segment` (B45, 5 Oct), so it can tell a child who read the
   * simpler text from one who read the standard.
   */
  const systemDensity: Density | null =
    densityForAction(action) ?? segPlan?.density ?? null;
  const effectiveDensity: Density | null = density ?? systemDensity;
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

  /*
   * B45: KEPT AS THE SCREEN CHANGES, READ AS THE CHILD LEAVES. React runs a
   * commit's effect cleanups before its setups, so the time-on-segment
   * cleanup reads the segment being left before the next one's version
   * lands here - and the segment id it is stamped with says so either way.
   */
  const depthNow = depthShown(segment, modality, effectiveDensity);
  useEffect(() => {
    textShown.current = { segmentId: segment.id, depth: depthNow };
  }, [segment.id, depthNow]);

  /*
   * B42: THE SYSTEM'S RESHAPE, APPLIED. Its density on a text segment that
   * can deliver it, with no pick of the child's over it - the violet chip in
   * force. Counted once per instruction: a standing Simplify carried on to
   * the next segment is the same adaptation, not another, while a new or
   * withdrawn instruction starts over. The child's own picks are not counted.
   */
  const systemReshapeShown =
    segmentShowing &&
    modality === MODALITY.TEXT &&
    density === null &&
    densitySegments.some((d) => d.state === "system")
      ? systemDensity
      : null;
  const reshapeCounted = useRef<Density | null>(null);
  useEffect(() => {
    if (reshapeCounted.current !== systemDensity) reshapeCounted.current = null;
    if (!systemReshapeShown || reshapeCounted.current === systemReshapeShown)
      return;
    reshapeCounted.current = systemReshapeShown;
    noteApplied();
  }, [systemDensity, systemReshapeShown, noteApplied]);

  /** What became of the offer: said to the engine, and the offer spent. */
  const settleSuggestion = useCallback(
    (outcome: SignalEventType) => {
      shownSuggestion.current = null;
      if (suggestionFromEngine) setSpentSuggestionOf(engine);
      trackEvent(outcome, { segmentId: segment.id, suggested });
    },
    [suggestionFromEngine, engine, trackEvent, segment.id, suggested],
  );

  const acceptSuggestion = useCallback(() => {
    if (suggested) setModality(suggested);
    setLastSuggestedIndex(index);
    setSuggestionSpent(true);
    settleSuggestion(SIGNAL_EVENT_TYPES.MODALITY_SUGGESTION_ACCEPTED);
    // The accept beat is over and the new modality is on screen.
    trackBusy(BUSY_REASON.MODALITY_SWITCH, BUSY_PHASE.END);
    // A modality change, applied (B42).
    if (suggested) noteApplied();
  }, [suggested, index, trackBusy, settleSuggestion, noteApplied]);

  const dismissSuggestion = useCallback(() => {
    setLastSuggestedIndex(index);
    setSuggestionSpent(true);
    settleSuggestion(SIGNAL_EVENT_TYPES.MODALITY_SUGGESTION_DECLINED);
    if (suggested)
      setObserved((o) => ({
        ...o,
        declines: o.declines + 1,
        declined: o.declined.includes(suggested)
          ? o.declined
          : [...o.declined, suggested],
      }));
  }, [index, settleSuggestion, suggested]);

  const suggestionShown = useCallback(() => {
    if (!suggested) return;
    shownSuggestion.current = { segmentId: segment.id, suggested };
    setObserved((o) => ({ ...o, shownHere: true, sinceShown: 0 }));
    trackEvent(SIGNAL_EVENT_TYPES.MODALITY_SUGGESTION_SHOWN, {
      segmentId: segment.id,
      suggested,
    });
  }, [segment.id, suggested, trackEvent]);

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

  /*
   * D36: EVERY ANSWER TO A CHECK IS STORED ON THE ACCOUNT AS IT IS GIVEN, so a
   * check left part way keeps the answers already given. Marked server-side.
   * Fire and forget: a failed write costs the record of one answer, never the
   * child's place in the check. Not for the authored mocks, whose question ids
   * are not real.
   */
  const saveAttempt = (body: LessonQuestionAttemptWrite | null) => {
    if (!live || !body) return;
    attemptWrites.current.push(
      lessonsApi.saveAttempt(lesson.id, body).catch(() => {}),
    );
  };

  /*
   * B49: INTO THE CHECK, OR BACK INTO IT.
   *
   * Where it was left comes off the progress row - the answer to the write
   * this visit opened with, which is the only read of that row the contract
   * has. So a child who moves on before that write answers starts the check
   * fresh, as every check started before this. Decided here, once, and never
   * moved under a child who is already answering.
   *
   * The answers given before the exit are read back from the account, for
   * Review Answers and so the result knows what landed before.
   */
  const beginCheck = () => {
    // A new run of the check; the last run's outcome is not this one's.
    saveCheckOutcome(lesson.id, null);
    const questions = lesson.assessment?.questions ?? [];
    const at = live ? checkResumeAt(progress.saved, questions.length) : null;
    if (at === null) return;
    const asked = progress.sessionId;
    setCheckResume({ at, landed: null, reading: Boolean(asked) });
    if (at >= questions.length) finishCheck();
    if (!asked) return;
    lessonsApi
      .attempts(lesson.id, asked)
      .then((rows) => {
        const before = answersBefore(rows, questions, at);
        reviewAnswers.current = [
          ...before.picks.filter(
            (p) =>
              !reviewAnswers.current.some(
                (a) => a.questionIndex === p.questionIndex,
              ),
          ),
          ...reviewAnswers.current,
        ];
        saveReviewAnswers(lesson.id, reviewAnswers.current);
        setCheckResume({ at, landed: before.landed, reading: false });
      })
      // Unread, what landed before stays unknown and the result claims
      // nothing about it.
      .catch(() => setCheckResume({ at, landed: null, reading: false }));
  };

  /*
   * THE CHECK IS DONE WHEN ITS LAST QUESTION IS ANSWERED, and that is when
   * the lesson is written complete - not on the tap after the result, which a
   * child who closes the tab there never makes. It is also the write that
   * brings the check-in's outcome back (B26), and the server reads that from
   * the answers it has stored - the last of which went a moment ago - so it
   * waits for the answers still on their way. Continue and Review answers
   * still complete at once; `markComplete` sends it once either way.
   */
  const finishCheck = () => {
    void Promise.allSettled(attemptWrites.current).then(() => markComplete());
  };

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

  /*
   * ONLY AN UNSOLVED CALCULATION HOLDS THE FORWARD CHEVRON.
   *
   * It was also disabled on the last segment of a lesson with no
   * end-of-lesson questions - and forward is the only thing that reaches the
   * completion screen, so that lesson could not be finished at all. On the
   * last segment forward goes to the assessment when there is one and to
   * completion when there is not; `continueAdvance` already knew both.
   */
  const nextDisabled = calcBlocking;

  /*
   * 37c: UNDER THE ATTENTION ACCOMMODATION, "TAP TO CONTINUE" IS THE WAY ON.
   * The frame draws no chevron row while a chunked body has parts left, and
   * the row here was only dimmed - so Next skipped Parts 2 and 3 unread. It
   * is held out of sight (and out of reach) rather than removed, so nothing
   * jumps when the last part brings it back; the last part has no continue of
   * its own. The child's own Slower chunks too, and keeps its chevrons: that
   * pace is theirs to leave.
   */
  const partsLeft =
    attentionOn && modality === MODALITY.TEXT && partsLeftOn === segment.id;

  // The entry, assessment and completion screens each take over the full
  // screen — their own layout, no player chrome.
  if (phase === "review-entry") {
    return (
      <ReviewEntryScreen
        lessonTitle={lesson.title}
        lastWorkedAt={lastWorkedAt}
        onBegin={() => setPhase("segments")}
        onLeave={() => {
          // D36. Not started is not completed: nothing goes to the scheduler,
          // so the concept stays due, and the lesson's own progress is left
          // alone as every review leaves it.
          setEnding({ completionStatus: "exited", exitPosition: first.id });
          exitTo(HOME_HREF);
        }}
      />
    );
  }

  if (phase === "assessment") {
    return (
      <AfterLessonAssessment
        assessment={lesson.assessment!}
        reading={readingOn}
        onAudioBusy={(phase) => trackBusy(BUSY_REASON.MEDIA_PLAYING, phase)}
        resumeAt={checkResume?.at}
        landedBefore={checkResume ? checkResume.landed : 0}
        landedPending={checkResume?.reading ?? false}
        outcome={live ? checkOutcomeFrom(progress.saved) : null}
        onComplete={finishCheck}
        onLeave={(checkPosition) => {
          /*
           * D36: LEAVING THE CHECK IS NOT FINISHING IT, AND NOT FAILING IT.
           *
           * `exited` at the last segment, the same record the leave dialog
           * makes - so the lesson stays unfinished and comes back on Home to
           * pick up. No `resultState`: its `not_attempted` and
           * `nothing_landed` send the child down a depth, which is a verdict,
           * and an unfinished check has none to give. The answers already
           * given were stored one by one as they were confirmed.
           *
           * B49: and WHERE in the check, so it reopens there the same day.
           * None from the intro - a check not begun has no place to keep.
           */
          const last = total - 1;
          const pos = modulePositionFor(lesson, last);
          reportProgress(LESSON_STATUS.EXITED, {
            segment: last,
            ...(pos ? { module: pos.moduleIndex } : {}),
            ...(checkPosition !== undefined ? { check: checkPosition } : {}),
          });
          setEnding({
            completionStatus: "exited",
            exitPosition: lesson.segments[last].id,
          });
          exitTo(HOME_HREF);
        }}
        onAnswer={({ questionIndex, selectedId, correct, responseTimeMs }) => {
          // What was picked, which checkpoint it answered and how long it took
          // - the response data frontend §2 says every event carries.
          const checkpointId = lesson.assessment?.questions[questionIndex]?.id;
          saveAttempt(
            attemptFor({
              sessionId: progress.sessionId,
              questionId: checkpointId,
              source: "assessment",
              choice: lesson.assessment?.questions[questionIndex]?.options.find(
                (o) => o.id === selectedId,
              ),
            }),
          );
          trackEvent(SIGNAL_EVENT_TYPES.COMPREHENSION_RESPONSE, {
            kind: "assessment",
            questionIndex,
            ...(checkpointId ? { checkpointId } : {}),
            selectedId,
            correct,
            responseTimeMs,
          });
          // The first answer to each question, for the scheduler. `Map.set` is
          // guarded so a re-answer cannot overwrite what they knew first time.
          if (!firstAnswers.current.has(questionIndex)) {
            firstAnswers.current.set(questionIndex, correct);
            /*
             * THE SCAFFOLD ATTEMPT, AND IT RIDES THE SAME FIRST-ANSWER GUARD.
             *
             * Inside the `if` deliberately: the engine decides how much support
             * a child gets on a concept from how they answered, and a child who
             * changes their mind has not attempted the problem twice. Posting
             * on every tap would let one question move a support level as often
             * as it was tapped.
             *
             * Fire and forget, and the response is deliberately ignored. The
             * decision is the server's, the only surface a level appears on is
             * the indicator, and the indicator is not on screen during the
             * after-lesson assessment - so there is nothing here to apply it
             * to. Design ruled that a change of support announces itself
             * nowhere, so inventing a surface for `nextIntensity` would be the
             * one thing that ruling forbids.
             *
             * Failure is swallowed for the same reason the scheduler write
             * swallows its own: missing one attempt costs a slightly stale
             * intensity, and telling a child their answer did not count would
             * be worse and is not true.
             */
            const attempt = scaffoldAttemptFor({
              question: lesson.assessment?.questions[questionIndex] ?? {},
              correct,
              studentId: getSession()?.userId,
              responseTimeMs,
              // B27: the pick itself, and the lesson it came from.
              choice: lesson.assessment?.questions[questionIndex]?.options.find(
                (o) => o.id === selectedId,
              ),
              lessonId: lesson.id,
            });
            if (attempt) void scaffoldsApi.attempt(attempt).catch(() => {});
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
        onFinish={() => {
          setPhase("complete");
          setEnding(COMPLETED);
        }}
        onReviewAnswers={() => {
          // The lesson IS finished at this point - reviewing is a way of
          // leaving it, not of abandoning it.
          markComplete();
          setEnding(COMPLETED);
          exitTo(`${LESSONS_HREF}/${lesson.id}/review`);
        }}
      />
    );
  }

  if (phase === "complete") {
    // "Your progress is saved" is a REPORT, so it appears once the completion
    // write has landed and not before - not while it is in flight, not while
    // it waits on a session, and never for a lesson nothing writes. It was the
    // screen's default and showed in all of those. When the write did not
    // reach Nevo the child is told, in the same words the daily warm-up uses.
    const savedNote = progress.completionFailed
      ? "We couldn’t save that just now - that’s on us, not you. Your work is still yours."
      : progress.completionSaved
        ? "Your progress is saved."
        : undefined;

    // Review sessions close on their own variant (37d) - the standard
    // completion screen with only the message swapped, and the message is
    // only what the scheduler confirmed (D40). The frame's "is settling in"
    // and "once more before it fully sticks" go with it: the first claims the
    // movement the heading now waits for, the second a count nothing carries.
    if (review) {
      const copy = reviewCompletionCopy(reviewRecord);
      return (
        <LessonComplete
          onDone={() => exitTo(HOME_HREF)}
          heading={copy.heading}
          headingHeld={copy.held}
          note={
            copy.bringBack && !progress.completionFailed
              ? REVIEW_COPY.later
              : savedNote
          }
          doneLabel="Done"
        />
      );
    }
    return (
      <LessonComplete
        onDone={() => exitTo(LESSONS_HREF)}
        note={savedNote}
        onSeeSummary={
          lesson.summary
            ? () => exitTo(`${LESSONS_HREF}/${lesson.id}/summary`)
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
        // The catalogue's keys and no others: `trigger`, and how long it
        // lasted. The type and the segment are not among them.
        onStart={() =>
          trackEvent(SIGNAL_EVENT_TYPES.BREAK_START, {
            trigger: breakTrigger.current,
          })
        }
        onEnd={(durationMs) =>
          trackEvent(SIGNAL_EVENT_TYPES.BREAK_END, {
            trigger: breakTrigger.current,
            durationMs,
          })
        }
        onFeelings={(feelings) =>
          trackEvent(SIGNAL_EVENT_TYPES.FEELING_CHECKIN, { feelings })
        }
        onDone={() => {
          setBreakActive(null);
          setObserved((o) => ({ ...o, breaksTaken: o.breaksTaken + 1 }));
          // An offered break returns to the segment it interrupted; a
          // plan-delivered one resumes the advance it intercepted; one taken
          // at a module boundary lands on the next module's first segment.
          if (breakOrigin.current === "advance") continueAdvance();
          if (breakOrigin.current === "boundary" && boundaryTo !== null) {
            setBoundaryTo(null);
            go(boundaryTo);
          }
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
          onTakeBreak={() => {
            /*
             * SCRUM-101, answered: "Take a break first" routes to the break
             * module and returns to the next module's first segment. It
             * rested in place instead, which emitted no break at all.
             *
             * The full break, because it is the one the child ends: they
             * chose to stop, so nothing times them back in.
             */
            breakOrigin.current = "boundary";
            breakTrigger.current = "module_boundary";
            setBreakActive(BREAK_TYPES.FULL);
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
          secondaryDim(attentionOn),
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
          {/* 37a: the global scaffold indicator, opposite the exit. It does
              not pulse: the step-up that pulsed it is retired (D28), and the
              dots change quietly (D27). */}
          {/*
            THE CONCEPT'S OWN LEVEL WINS WHERE THERE IS A CONCEPT, and the two
            sources never overlap: the scaffolds engine is keyed per concept
            and only a review session has one, while the plan answers for
            ordinary segments that carry none. Null falls through to the plan,
            because a read that never answered is not evidence about a child.

            It is also the only way one filled circle is ever reachable - the
            plan's `ScaffoldingLevel` runs none, light, standard, strong, and
            has no minimal. See `lib/lessons/scaffoldLevel.ts`.

            NO LEVEL IS THE NOTHING-STATE, NOT "LIGHT" (rule 5). With no plan,
            or a value we do not know, this drew two circles and "Nevo sets it
            for you" about support nobody had set, then changed when a plan
            landed.
          */}
          <ScaffoldIndicator
            key={`scaf-${segment.id}`}
            level={conceptScaffold ?? segPlan?.scaffold ?? null}
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
          secondaryDim(attentionOn),
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
        className={cn("shrink-0", secondaryDim(attentionOn))}
        aria-label={positionLine(lesson, index)}
      />

      {/* Calm banner while the device is offline — the cached lesson stays usable */}
      <OfflineBanner />

      {/* Anchor for the modality suggestion, just below the top bar. One ask
          at a time: a break offer (B.7) outranks it, and is asked at the foot
          of the lesson instead (frame 38 §3) - see below. */}
      <div className="relative">
        {showBreakOffer ? null : (
          showSuggestion && (
            <ModalitySuggestionPill
              key={`pill-${segment.id}`}
              modality={suggested}
              onAccept={acceptSuggestion}
              onAcceptStart={() =>
                trackBusy(BUSY_REASON.MODALITY_SWITCH, BUSY_PHASE.START)
              }
              onShown={suggestionShown}
              onDismiss={dismissSuggestion}
            />
          )
        )}
      </div>

      {/* Content — centered reading column. Its violet frame went with the
          step-up offer it accompanied (D28). */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div
          className={cn(
            // The 88px bottom padding on mobile was sized to clear the Ask Nevo
            // trigger, which is `fixed` and would land on this column. Ask Nevo
            // is no longer mounted over lesson content (IA 31, see
            // `LessonAskNevo`), so it clears nothing now; the last line simply
            // stops well above the chevrons. `sm:p-8` and `lg:p-10` reset it
            // on their own, because their media rules come after the base
            // utility.
            "mx-auto w-full max-w-full p-6 pb-[88px] sm:max-w-[620px] sm:p-8 lg:max-w-[680px] lg:p-10",
          )}
        >
          {/*
            ON THE FIRST SEGMENT ONLY. A note is about the work as a whole,
            and repeating it above every segment would turn a person's message
            into chrome - read once, then ignored. It sits at the top of the
            reading column rather than in the fixed header so it scrolls away
            like the thing it is: something to read before starting, not a
            banner about the lesson.

            It is deliberately NOT inside the density path - see TeacherNote.
          */}
          {index === 0 && teacherNote && (
            <TeacherNote
              note={teacherNote.text}
              author={teacherNote.author}
            />
          )}
          {feedback && <FeedbackStrip message={feedback} />}
          {contentHere &&
            action === ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL &&
            guidedPrompts.length > 0 && (
              <SocraticPanel
                key={`socratic-${segment.id}`}
                prompts={guidedPrompts}
                onShown={(promptIds) => {
                  for (const promptId of promptIds)
                    trackEvent(SIGNAL_EVENT_TYPES.GUIDED_QUESTION_SHOWN, {
                      segmentId: segment.id,
                      promptId,
                    });
                }}
                onAnswer={(promptId, reply, outcome) =>
                  answerGuided(promptId, outcome, reply)
                }
                onAbandon={(promptId) => answerGuided(promptId, "abandoned")}
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
            className={cn(
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-nevo-slide focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-nevo-navy",
              // D25: the engine's density, as spacing and nothing else.
              densitySpacing(
                entryDensity.segmentId === segment.id
                  ? entryDensity.level
                  : null,
              ),
            )}
          >
            <SegmentBody
              segment={segment}
              modality={modality}
              density={effectiveDensity}
              reading={readingOn}
              attention={attentionOn}
              onReadProgress={noteReadProgress}
              onReplay={() => {
                trackEvent(SIGNAL_EVENT_TYPES.REPLAY, { segmentId: segment.id });
                setObserved((o) => ({ ...o, replays: o.replays + 1 }));
              }}
              onNarrationPlayed={() =>
                trackEvent(SIGNAL_EVENT_TYPES.NARRATION_PLAYED, {
                  segmentId: segment.id,
                })
              }
              onAudioBusy={(phase) =>
                trackBusy(BUSY_REASON.MEDIA_PLAYING, phase)
              }
              onMediaFailed={(channel, reason) =>
                trackEvent(SIGNAL_EVENT_TYPES.MEDIA_LOAD_FAILED, {
                  segmentId: segment.id,
                  channel,
                  reason,
                })
              }
              onCalcSolved={() => {
                setSolvedCalcs((prev) => new Set(prev).add(segment.id));
                // Solving the calculation is the centrepiece interaction of
                // 17b and emitted NOTHING - the local set was the only trace.
                trackEvent(SIGNAL_EVENT_TYPES.CALCULATION_COMPLETE, {
                  segmentId: segment.id,
                });
              }}
              onCalcStep={(correct) => {
                // The ingest enum has a type for this. It was riding
                // `comprehension_response` under a `kind` of our own invention,
                // which obliges the engine to know our convention - and no
                // batch had ever actually landed under it, so switching now
                // costs no history.
                // The step and the child's answer are not added: the solver is
                // frozen pending its backend payload (SCRUM-181/177).
                trackEvent(SIGNAL_EVENT_TYPES.CALCULATION_STEP_RESPONSE, {
                  segmentId: segment.id,
                  correct,
                });
                noteAnswer(correct);
              }}
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
          {hintHere && hintText && (
            <HintOverlay
              hint={hintText}
              onClose={() =>
                setClosedHints((prev) => new Set(prev).add(hintKey))
              }
            />
          )}
        </div>
      </div>

      {segment.quickCheck && (
        <QuickCheckSheet
          key={`check-${segment.id}`}
          check={segment.quickCheck}
          open={checkOpen}
          onOpenChange={setCheckOpen}
          reading={readingOn}
          onAudioBusy={(phase) => trackBusy(BUSY_REASON.MEDIA_PLAYING, phase)}
          onAnswered={(correct, answered) => {
            const checkpointId = segment.quickCheck?.id;
            trackEvent(SIGNAL_EVENT_TYPES.COMPREHENSION_RESPONSE, {
              kind: "quick_check",
              segmentId: segment.id,
              ...(checkpointId ? { checkpointId } : {}),
              correct,
              ...answered,
            });
            saveAttempt(
              attemptFor({
                sessionId: progress.sessionId,
                questionId: checkpointId,
                segmentId: segment.id,
                source: "checkpoint",
                choice: segment.quickCheck?.options.find(
                  (o) => o.id === answered.selectedId,
                ),
              }),
            );
            noteAnswer(correct);
            // Which pick first got it, for the scheduler - a miss re-opens the
            // check until it is passed, so "passed" is true of everyone.
            const seen = checkRecall.current.get(segment.id);
            const picks = (seen?.picks ?? 0) + 1;
            checkRecall.current.set(segment.id, {
              picks,
              rightOnPick: seen?.rightOnPick ?? (correct ? picks : null),
              hinted: seen?.hinted ?? hintedSegments.current.has(segment.id),
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
        saved={progress.positionSaved}
        onLeave={() => {
          // `exited` is a status the contract defines and nothing ever sent.
          // Leaving deliberately is not the same fact as drifting off mid
          // segment, and the engine is entitled to tell them apart - the
          // position is identical either way, the intent is not.
          // Same reason as the position write above: leaving a REVIEW part way
          // says nothing about the lesson, which was finished before the review
          // began. Writing `exited` here would demote it on the way out.
          if (!review && !finished) {
            reportProgress(LESSON_STATUS.EXITED, { segment: index });
          }
          setEnding({ completionStatus: "exited", exitPosition: segment.id });
          exitTo(HOME_HREF);
        }}
      />

      {/* The break offer (B.7), at the foot of the lesson and above the
          chevrons (frame 38 §3). Sticky, so a long segment still shows it. */}
      {showBreakOffer && (
        <BreakOfferPill
          key={`break-offer-${segment.id}`}
          onShown={() =>
            trackEvent(SIGNAL_EVENT_TYPES.BREAK_SUGGESTED, {
              trigger: offerTrigger,
            })
          }
          onAccept={acceptBreakOffer}
          onDismiss={dismissBreakOffer}
        />
      )}

      {/* Chevron nav — dims under the attention accommodation; `offer_hint`
          guides the forward control with three quiet glow cycles (never
          displaces it). */}
      <nav
        aria-hidden={partsLeft || undefined}
        inert={partsLeft}
        className={cn(
          "flex shrink-0 items-center justify-center gap-8 px-3.5 pt-2 pb-6",
          secondaryDim(attentionOn),
          partsLeft && "invisible",
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
            hintHere &&
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
  onNarrationPlayed,
  onAudioBusy,
  onMediaFailed,
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
  onNarrationPlayed: () => void;
  onAudioBusy: (phase: BusyPhase) => void;
  /** A picture or recording would not load (B12). */
  onMediaFailed: (channel: "image" | "audio", reason: MediaFailReason) => void;
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
    return (
      <VisualSegment
        content={segment.visual}
        onMediaFailed={(reason) => onMediaFailed("image", reason)}
      />
    );
  if (modality === MODALITY.AUDIO && segment.audio)
    return (
      <AudioSegment
        content={segment.audio}
        onReplay={onReplay}
        onPlayed={onNarrationPlayed}
        onBusy={onAudioBusy}
        onMediaFailed={(reason) => onMediaFailed("audio", reason)}
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
