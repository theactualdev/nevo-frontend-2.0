"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  AdaptiveToggleBar,
  preloadSettlingCharacter,
  ProgressBar,
  type ToggleSegment,
} from "@/components/shared";
import {
  BUSY_PHASE,
  BUSY_REASON,
  DENSITY,
  MODALITY,
  SIGNAL_EVENT_TYPES,
  type BreakType,
  type BusyPhase,
  type BusyReason,
  type Density,
  type Modality,
  type ScaffoldLevel,
  type SignalEventType,
} from "@/lib/constants";
import { useLesson, useSignals } from "@/hooks";
import { formFactor, type SessionOutcome } from "@/hooks/useSignals";
import {
  useRuntimeAdaptation,
  type AppliedAdaptations,
} from "@/hooks/useRuntimeAdaptation";
import { useLessonExit } from "./LessonExit";
import { useScaffoldLevel } from "@/hooks/useScaffoldLevel";
import { intelligenceApi, type AdaptSegment } from "@/lib/api/intelligence";
import type {
  AdaptationPlan,
  ChosenVersion,
  DensityLevel,
  Lesson,
  LessonSegment,
  SegmentAdaptation,
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
import { atLowerDepth, NOTHING_SIMPLIFIED } from "@/lib/lessons/lowerDepth";
import { asSourceText } from "@/lib/lessons/fromContent";
import { reportCalculationFallback } from "@/lib/api/clientErrors";
import { useAssignmentNote } from "@/hooks/useAssignmentNote";
import { isChunkable } from "@/lib/lessons/chunk";
import {
  LESSON_STATUS,
  lessonsApi,
  type LessonQuestionAttempt,
  type LessonQuestionAttemptWrite,
  type SegmentChoiceWrite,
} from "@/lib/api/lessons";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { paceWrite, withSessionChoices } from "@/lib/lessons/segmentChoice";
import { schedulerApi, type ReviewOutcome } from "@/lib/api/scheduler";
import { answerFor, calculationAttemptFor } from "@/lib/lessons/attempts";
import { holdAnswer, retryable } from "@/lib/lessons/pendingProgress";
import {
  answersBefore,
  checkResumeAt,
  type CheckLeft,
} from "@/lib/lessons/checkResume";
import {
  checkOutcomeFrom,
  rerouteFrom,
  resultStateFrom,
} from "@/lib/lessons/checkOutcome";
import {
  REVIEW_COPY,
  reviewCompletionCopy,
  reviewOutcome,
  type RecallEvidence,
  type ReviewRecord,
} from "@/lib/lessons/reviewOutcome";
import { getSession, getToken } from "@/lib/auth/session";
import { openBusyWindow } from "@/lib/signals/busy";
import { useLessonProgress } from "@/hooks/useLessonProgress";
import { AudioSegment } from "./AudioSegment";
import { BreakOfferPill } from "./BreakOfferPill";
import { BreakScreen } from "./BreakScreen";
import { CalculationBoundary } from "./CalculationBoundary";
import { CalculationSolver, type StepGiven } from "./CalculationSolver";
import { FeedbackStrip } from "./FeedbackStrip";
import { FormatGroup } from "./FormatGroup";
import { InteractiveSegment } from "./InteractiveSegment";
import { LeaveLessonDialog } from "./LeaveLessonDialog";
import { LessonComplete } from "./LessonComplete";
import { LessonMessage } from "./LessonMessage";
import { LessonNotOpened } from "./LessonNotOpened";
import { ModuleBoundaryScreen } from "./ModuleBoundaryScreen";
import { OfflineBanner } from "./OfflineBanner";
import { ONE_MORE_BIT, PressedLine } from "./PressedLine";
import { ScaffoldIndicator } from "./ScaffoldIndicator";
import { QuickCheckSheet } from "./QuickCheckSheet";
import { ReviewEntryScreen } from "./ReviewEntryScreen";
import {
  type ReviewAnswer,
  saveCheckOutcome,
  saveReviewAnswers,
} from "./reviewStore";
import { TeacherNote } from "./TeacherNote";
import { TextSegment, type OnChunkSeen } from "./TextSegment";
import { VisualSegment } from "./VisualSegment";
import type { MediaFailReason } from "./useMediaSource";

// Finishing a lesson goes back to the lessons (frame: "Back to lessons");
// leaving one part way goes Home (IA: "Leave for now" -> Home Dashboard). A
// review's own entry and ending go back to where it was opened from, when
// that was said - see `reviewBack`.
const LESSONS_HREF = "/student/lessons";
const HOME_HREF = "/student/dashboard";

const DENSITIES: { id: Density; label: string }[] = [
  { id: DENSITY.SIMPLIFY, label: "Simplify" },
  { id: DENSITY.EXPAND, label: "Expand" },
  { id: DENSITY.SLOWER, label: "Slower" },
];

/**
 * The pace chips a segment's text can deliver: Simplify and Expand where an
 * authored reshape exists, Slower where one does or the server's reading
 * chunks break the body - see `textChips`.
 */
const densitiesFor = (segment: LessonSegment) =>
  DENSITIES.filter(({ id }) =>
    id === DENSITY.SLOWER
      ? segment.text?.body[id] !== undefined ||
        isChunkable(segment.text?.body.default, segment.text?.readingChunks)
      : segment.text?.body[id] !== undefined,
  );

/** What holds the chip row's height, unseen, on a segment that has none. */
const HELD_CHIPS: ToggleSegment[] = DENSITIES.map(({ id, label }) => ({
  id,
  label,
  state: "default",
}));

// Each density is its own event type in the backend ingest contract.
const DENSITY_TRIGGER: Record<Density, SignalEventType> = {
  [DENSITY.SIMPLIFY]: SIGNAL_EVENT_TYPES.SIMPLIFY_TRIGGER,
  [DENSITY.EXPAND]: SIGNAL_EVENT_TYPES.EXPAND_TRIGGER,
  [DENSITY.SLOWER]: SIGNAL_EVENT_TYPES.SLOWER_TRIGGER,
};

/**
 * Scroll-depth marks (%) that each emit one `scroll` signal per segment. Sent
 * as the catalogue's `depthRatio`, a ratio: 50 goes up as 0.5.
 */
const SCROLL_MILESTONES = [25, 50, 75, 100];

/** How long the transient post-answer feedback note lingers before fading. */
const FEEDBACK_MS = 3500;

/** One object, so the signal session is not told the same ending twice. */
const COMPLETED: SessionOutcome = { completionStatus: "completed" };

/**
 * Every sitting's declined modalities now there is no offer to decline. One
 * array, so the engine's request is not rebuilt for a new empty one.
 */
const NONE_DECLINED: string[] = [];

/**
 * How long a format switch waits on the server before it goes on screen
 * anyway. The client has no request timeout, and a child held on "One
 * moment" by a request that never answers is worse than a choice that only
 * lasts this visit. A wait on the network, not a reading of the child.
 */
const SWITCH_WAIT_MS = 4000;

/**
 * Which refusal a choice write met: the server's 409 code, or null for
 * anything else - a closed sitting included, which is honoured on screen.
 */
function refusalOf(cause: unknown): string | null {
  return cause instanceof ApiError && cause.status === 409
    ? apiErrorCode(cause.detail)
    : null;
}

/**
 * SCRUM-181's nothing-landed screen (design D35), verbatim. ONE ACTION, AND
 * IT GOES FORWARD (Lydia, D155, 13 Oct): "Start again" read as though the
 * work just done had been thrown away, when the child is going into a
 * different explanation. No second action: a way back would be back to the
 * version that just failed them.
 */
const REROUTED = {
  title: "That version didn't work.",
  body: "Nevo is taking you through this lesson again, a simpler way.",
  action: "Let's try it another way",
} as const;

/** Design's ending for a partial offline copy (D142, 8 Oct), verbatim. */
const PARTIAL_ENDING = {
  heading: "That's as far as this one goes for now.",
  note: "We'll pick up the rest when you're back online.",
} as const;

/** Why a calculation whose solver threw is its text - see `failedCalcs`. */
const SOLVER_FAILED = "the solver failed on the device";

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
  /*
   * A CALCULATION IS THE SOLVER AND NOTHING ELSE - opened in it, and never
   * offered as its text or a picture (Lydia, 17 Oct #5; Teslim, 19 Oct: "A
   * valid one advertises interactive only"). Every segment carries its text,
   * so this read `true` for Text on a calculation: a plan row naming Text
   * opened it as plain text, and an offer of Text - the engine's or a
   * lesson's own - put "Want to read this one instead?" over the solver.
   * One this app cannot draw is no calculation by now (`asSourceText`).
   */
  if (isCalculation(segment)) return modality === MODALITY.INTERACTIVE;
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

/**
 * The modality a segment opens in: the child's own choice for it, else the
 * plan's, else the first renderable one.
 *
 * THE CHILD'S CHOICE OUTRANKS THE ENGINE FOR THAT SEGMENT (Lydia, 21 Oct): a
 * plan row naming another format - at load or mid-lesson - does not move a
 * child off the one they picked. Only for that segment: the next opens as
 * the plan says. And with no pick the opening is exactly what it was before
 * the format group - "don't change format selection logic yet, the cold
 * start is a decision I am making separately" (same message).
 */
function openingModality(
  segment: LessonSegment,
  planned: Modality | undefined,
  chosen?: Modality,
): Modality {
  if (chosen && hasContent(segment, chosen)) return chosen;
  if (planned && hasContent(segment, planned) && opensUnpicked(segment, planned))
    return planned;
  return (
    segment.modalities.find((m) => hasContent(segment, m)) ?? MODALITY.TEXT
  );
}

/**
 * Whether a section may open in `modality` with nothing picked: as before the
 * activity reached the player, which is everything but an activity outside the
 * section's `modalities`. A live activity is drawn and offered since 21 Oct
 * (SCRUM-268) but kept out of that list, so a plan naming it opens the
 * section as it always did - the opening is Lydia's to change, not this.
 */
function opensUnpicked(segment: LessonSegment, modality: Modality): boolean {
  return (
    modality !== MODALITY.INTERACTIVE ||
    isCalculation(segment) ||
    segment.modalities.includes(modality)
  );
}

/**
 * The format group's pills for a segment (SCRUM-272), in the server's order:
 * its freshest `availableFormats` - an engine answer's over the lesson's own
 * read - and, for a payload with none and for the authored walkthrough, the
 * segment's `modalities` as before. Only what can be drawn here: a
 * calculation is the solver alone, and a picture that failed its own review
 * is not offered whatever a list says.
 */
function formatsOf(
  segment: LessonSegment,
  row: SegmentAdaptation | undefined,
): Modality[] {
  const listed = row?.formats ?? segment.formats ?? segment.modalities;
  return [...new Set(listed)].filter((m) => hasContent(segment, m));
}

/**
 * The format the server recommends for a segment, from the same read the
 * pills came from - or none. NEVER WORKED OUT HERE (Lydia, 21 Oct: "do not
 * derive it in the player"), and none at all where the pills are the
 * segment's own `modalities`: a payload with no formats list carries no
 * recommendation to go with it.
 */
function recommendationOf(
  segment: LessonSegment,
  row: SegmentAdaptation | undefined,
): Modality | null {
  if (row?.formats) return row.recommendedFormat ?? null;
  if (segment.formats) return segment.recommendedFormat ?? null;
  return null;
}

/**
 * Lesson Player (screen 17) — the immersive reading/learning shell. Slices 1–4:
 * the spine, all four modalities, reading density, the format group, the
 * inline Quick Check, the after-lesson assessment, completion, the leave dialog,
 * and system states. Slice 5 wires signal collection (`useSignals`) across every
 * interaction and publishes the session into `LessonContext`.
 */
export function LessonPlayer({
  lesson: given,
  plan,
  review = false,
  reviewConceptId,
  reviewBack,
  live = false,
  finished: finishedOnOpen = false,
  partial = false,
  assignmentId,
  startAt = 0,
  placeUnknown = false,
  progressRow = null,
  lastWorkedAt = null,
  adaptSegments,
  depth,
  onStartAgain,
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
   *
   * What the dashboard said before the first frame. A review sitting
   * (`reviewMode` on `POST /session`) is the same case - see `finished`.
   */
  finished?: boolean;
  /**
   * A saved copy missing its modules, closing recap or after-lesson check -
   * see `isPartialCopy`. Reaching its end is never written `completed` - see
   * `markComplete`. A package copy carrying all three is not partial.
   */
  partial?: boolean;
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
  /**
   * The child's newest progress row for this lesson, from the dashboard read
   * before the first frame: where the after-lesson check was left, and until
   * when (B82). Null when there is none or it could not be read.
   */
  progressRow?: CheckLeft | null;
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
  /**
   * The Subject Detail page a review session was opened from, already checked
   * by `readReviewBack`. Leaving the review's entry screen and its "Done" go
   * back there (Olayinka, 14 Oct: back returns to where you came from - and
   * no frame names where a review ends). Absent, they go Home as before.
   *
   * Only those two. The in-session "Leave for now" keeps IA 31's Home, as it
   * does in every lesson, and an ordinary lesson never reads this.
   */
  reviewBack?: string;
  /**
   * The depth this session runs at, where it is known before it opens: the
   * server's reroute that "Let's try it another way" follows. Otherwise the
   * session says so itself when it opens - see `lowerDepth`.
   */
  depth?: "standard" | "lower";
  /**
   * SCRUM-181's "Let's try it another way": open the lesson afresh from this
   * zero-based segment, the server's reroute's place, at the reroute's
   * depth. Absent, the screen is not offered.
   */
  onStartAgain?: (
    segmentPosition: number,
    depth: "standard" | "lower",
  ) => void;
}) {
  /*
   * SCRUM-178: A LOWER-DEPTH SESSION READS EACH SEGMENT'S SIMPLER VERSION, and
   * the normal body where there is none (backend, 9 Oct) - see `atLowerDepth`.
   * From the first frame when the reroute already said so (SCRUM-181).
   * When it is the session's own answer, it lands after the first segment is
   * on screen, so it applies from the next segment entered - rewording the
   * text a child has started reading is the snap rule 7 forbids (the same
   * rule as `entryDensity`). Lower stays lower for the rest of the session.
   */
  const [lowerDepth, setLowerDepth] = useState(depth === "lower");
  const { lesson, simplified } = useMemo(
    () =>
      lowerDepth
        ? atLowerDepth(given)
        : { lesson: given, simplified: NOTHING_SIMPLIFIED },
    [given, lowerDepth],
  );
  /*
   * CALCULATIONS WHOSE SOLVER FAILED ON THIS DEVICE, and what it threw. Each
   * is its source text from then on, for the rest of the visit (Teslim, 19
   * Oct: "A renderer failure on the device should use the source body and
   * report the failure") - see `CalculationBoundary`. The segment itself is
   * swapped as it is entered, rather than special-cased on screen, so the
   * held forward chevron, the support dots, the pace chips and what the
   * engine is told the segment offers all follow from the one fact. Not the
   * lesson: a new lesson would rewrite the child's position for nothing.
   */
  const [failedCalcs, setFailedCalcs] = useState<ReadonlyMap<string, unknown>>(
    () => new Map(),
  );
  const asEntered = (s: LessonSegment) =>
    failedCalcs.has(s.id) ? asSourceText(s, SOLVER_FAILED) : s;
  // Every exit from the lesson - see `useLessonExit`.
  const exitTo = useLessonExit();
  // Where a review's entry and ending go - see `reviewBack`.
  const reviewDoneHref = reviewBack || HOME_HREF;
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
  /*
   * A REVIEW SITTING IS A FINISHED LESSON REOPENED (Teslim's review mode,
   * 21 Oct; SCRUM-275 #3 with SCRUM-146). On a completed lesson `POST
   * /session` hands back the COMPLETED sitting with `reviewMode: true`, to
   * be opened "for review, not as a new adaptive sitting", and the lesson
   * stays completed. That is D22's "Look again" - `finished` - and not
   * `review`, which is 37d's spaced retrieval on one concept: its entry
   * screen, REVIEW marker, skipped check and scheduler outcome belong to a
   * due review, and no frame draws them on a finished lesson looked at again.
   *
   * The dashboard normally said so before the first frame - the server
   * decides a review from the same row (`isFinishedRow`) - so the opening
   * is already the top, and the opening is never moved once drawn. The
   * session's word covers what follows it: no in-lesson asks against the
   * ended sitting, nothing written that could demote it, no choices held.
   */
  const finished = finishedOnOpen || progress.opened?.reviewMode === true;
  /*
   * The server's reroute (SCRUM-178), off the completion write's answer: it
   * only ever comes back on a completed row, so the session it closes ended
   * completed - and says so even if the child starts again from the result,
   * before Continue would have said it. See the SCRUM-181 screen below.
   */
  const reroute = live ? rerouteFrom(progress.saved) : null;

  // Signals ride the BACKEND's session id, not the local one above - see
  // `useSignals`. Null until `POST /session` answers, which the hook holds for.
  // How the session ended travels on its envelope; set where it ends.
  const [ending, setEnding] = useState<SessionOutcome | null>(null);
  /*
   * WHAT THE CHILD SAW APPLIED (B42), counted where it reaches the screen:
   * the system's reshape of the text, a hint, and since B74 (8 Oct) a
   * Socratic panel rendered and a density spacing changed mid-session - not
   * the one the lesson opened on. Not offers, not instructions the screen
   * could not show, and not the child's own picks - which since 21 Oct is
   * every change of format: the engine's offer a modality change came from
   * is gone, and its recommendation is only a marker in the format group.
   * The count rides the session envelope and the moment feeds the engine's
   * cooldown - see `AppliedAdaptations`.
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
    ending ?? (reroute ? COMPLETED : null),
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
  // thing, so it ignores the saved position - and so does a finished lesson
  // reopened (D22, D100 "Look again"), which opens at the top.
  const opening =
    !review && !finishedOnOpen && startAt > 0 && startAt < lesson.segments.length
      ? startAt
      : 0;
  const [index, setIndex] = useState(opening);

  /*
   * B82: A CHECK LEFT PART WAY OPENS STRAIGHT BACK INTO IT, on the question it
   * was left at, while the server still says it can be picked up. Read off the
   * dashboard's row, which is in hand before this first frame - so the child
   * is never shown the last segment first, or moved under. Past the server's
   * deadline this is null and the check starts fresh when they reach it. Not
   * for a review, a finished lesson or the walkthrough, which resume no check.
   */
  const [checkOpensAt] = useState<number | null>(() => {
    const count = lesson.assessment?.questions.length ?? 0;
    return live && !review && !finished && count > 0
      ? checkResumeAt(progressRow, count)
      : null;
  });

  const first = lesson.segments[opening];
  const firstPlan = planFor(first.id);

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
  /*
   * WHAT THE CHILD CHOSE FOR EACH SEGMENT, this sitting (SCRUM-272, K4):
   * its format, and its pace for the text.
   *
   * Segment-level and nothing more (rule 1): a choice is about one section
   * of one lesson, and it opens that section in it again - a return visit,
   * or a reload. Lydia, 21 Oct: "A reload keeps the child's chosen version
   * ... scoped to the segment ... held server-side rather than in browser
   * storage." So it is held on the server (`saveSegmentChoice`) and read back
   * from there: from the lesson read, which is in hand BEFORE THIS FIRST
   * FRAME, so a reload opens in it with nothing changing on screen (rules 6
   * and 7) - and then from the sitting itself, below. Never from the device.
   *
   * Only for a live lesson the child is working through. A review, or a
   * finished lesson opened again, is a new sitting on work that ended - the
   * choices read belong to that ending (Lydia, 19 Oct: it "resets when the
   * lesson ends") - and the signed-out walkthrough has no sitting at all.
   * Nor is the lesson read's taken for "Let's try it another way" (`depth`),
   * which opens a new, rerouted sitting: the lesson was read under the old
   * one, and that sitting's own word arrives with it, below.
   */
  const choicesHeld = live && !review && !finished;
  const [chosen, setChosen] = useState<ReadonlyMap<string, ChosenVersion>>(
    () =>
      new Map(
        choicesHeld && depth === undefined
          ? given.segments.flatMap((s) =>
              s.chosen ? [[s.id, s.chosen] as const] : [],
            )
          : [],
      ),
  );
  // Segments the child picked on this visit: newer than either read.
  const [pickedOn, setPickedOn] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [modality, setModality] = useState<Modality>(() =>
    openingModality(
      first,
      firstPlan?.startModality,
      chosen.get(first.id)?.modality,
    ),
  );

  // Segments whose Quick Check has been answered correctly — only a correct
  // answer spends the check (a miss offers Try again).
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
  // Segments whose hint - or guided questions - were on screen, for
  // `after_hint`.
  const hintedSegments = useRef<Set<string>>(new Set());
  const [passedChecks, setPassedChecks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [checkOpen, setCheckOpen] = useState(false);
  /*
   * B94 / SCRUM-241: THE SERVER HANDING A CHILD OFF FROM A QUICK CHECK to the
   * Socratic panel (38a), with the prompts it sent. `run` remounts the panel
   * for each hand-off, so a second one arrives open as the first did.
   * `answeredRight` is read where the reply lands, which state is not: a
   * hand-off for an earlier miss arriving after a right answer is moot.
   * `handedOff` is the checks the server moved the child past - every
   * hand-off moves them past (B128) - never counted as passed.
   */
  const [handoff, setHandoff] = useState<{
    segmentId: string;
    run: number;
    prompts: PanelPrompt[];
  } | null>(null);
  const [handedOff, setHandedOff] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const answeredRight = useRef<Set<string>>(new Set());
  // Segments whose hand-off panel has been counted as applied (B74).
  const handoffsApplied = useRef<Set<string>>(new Set());
  // Segments are the lesson itself; the assessment takes over the screen once
  // the last segment is done (growth framing — never a score), then completion.
  // Review sessions open on their entry screen first (37d).
  const [phase, setPhase] = useState<
    "review-entry" | "segments" | "assessment" | "complete"
  >(
    review
      ? "review-entry"
      : checkOpensAt !== null
        ? "assessment"
        : "segments",
  );
  // Exiting mid-lesson goes through the leave dialog, not straight out.
  const [leaveOpen, setLeaveOpen] = useState(false);
  /*
   * THE ENDING'S PICTURE, FETCHED WHILE THERE IS A CONNECTION. The completion
   * screen and the offline ending both draw it, and either can come after the
   * connection has dropped. Held for the life of the player, which is what
   * keeps it to hand.
   */
  const endingPicture = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    endingPicture.current ??= preloadSettlingCharacter();
  }, []);

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
  /*
   * A PARTIAL COPY IS NEVER COMPLETED (Lydia, 6 Oct): "A lesson played
   * offline without its modules, recap and after-lesson check is not
   * recorded as completed, and it comes back when the child is next online."
   * Booked complete, the engine would teach this child from a check that
   * never happened. Since B85 a package copy carries all three and completes
   * as usual; one that does not, or one saved before 8 Oct, is partial. Its
   * end is written `exited` at the last segment instead -
   * the furthest place, and how they left - so it comes back on Home and
   * opens there online, with its check. The signal session ends the same way
   * (`finishedAs`). A review or a finished lesson reopened writes nothing,
   * as neither ever writes `exited`.
   */
  const completionReported = useRef(false);
  const markComplete = useCallback(() => {
    if (completionReported.current) return;
    completionReported.current = true;
    const last = Math.max(0, lesson.segments.length - 1);
    if (partial) {
      if (review || finished) return;
      const pos = modulePositionFor(lesson, last);
      reportProgress(LESSON_STATUS.EXITED, {
        segment: last,
        ...(pos ? { module: pos.moduleIndex } : {}),
      });
      return;
    }
    reportProgress(LESSON_STATUS.COMPLETED, { segment: last });
  }, [lesson, reportProgress, partial, review, finished]);
  // How the signal session ends when the child reaches the end: completed,
  // or - for a partial copy, above - exited at the last segment.
  const finishedAs = useMemo<SessionOutcome>(
    () =>
      partial
        ? {
            completionStatus: "exited",
            exitPosition: lesson.segments[lesson.segments.length - 1].id,
          }
        : COMPLETED,
    [partial, lesson],
  );

  useEffect(() => {
    if (phase !== "complete") return;
    markComplete();
  }, [phase, markComplete]);

  /*
   * B49: A CHECK LEFT PART WAY REOPENS WHERE IT WAS LEFT, the same day.
   * Decided once: as the lesson opens (B82, `checkOpensAt`), or as the child
   * moves into the check - see `beginCheck`. Nothing about what landed before
   * rides with it: how the check went is the server's `resultState` (B98).
   */
  const [checkResume, setCheckResume] = useState<{ at: number } | null>(() =>
    checkOpensAt === null ? null : { at: checkOpensAt },
  );
  // The answers still on their way, which the completion waits for.
  const attemptWrites = useRef<Promise<unknown>[]>([]);

  /*
   * B26: THE CHECK-IN'S OUTCOME comes back on the completion write, so it is
   * kept here for the summary, which is its own route and reads this copy
   * before the dashboard row's (B84).
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
   * server decides whether it counts as recall. Since d461b60 it decides
   * that for a student from the answers it marked in the named sitting, and
   * answers `recallSuccessful: null`, so the firmer line cannot show (asked).
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
   * DECIDED BY THE MOVE THAT FINISHES THE REVIEW, not by an effect on the
   * phase, because the completion screen waits on the answer (D40): what it
   * may claim is what the scheduler said back. See `reviewCompletionCopy`.
   *
   * SENT ONCE THAT SITTING'S COMPLETION HAS LANDED, AND NAMING IT (Teslim's
   * 19 Oct contract, `RecordReviewRequest.sessionId`). For a student the
   * server reads the answers it marked in a COMPLETED session; sent with no
   * id beside the completion write, it took the latest completed sitting on
   * the concept - an older one - or answered 409 `review_evidence_required`.
   * So it waits for `completionSaved` and sends this sitting's own id. A
   * review that is never written completed - an authored mock, which opens
   * no session, or a partial offline copy (`markComplete`) - has no sitting
   * to name, and sends nothing.
   */
  const reviewRecorded = useRef(false);
  const [reviewRecord, setReviewRecord] = useState<ReviewRecord>({
    state: "unsent",
  });
  /** What the finishing move found to say, until its sitting's completion lands. */
  const [reviewOwed, setReviewOwed] = useState<{
    studentId: string;
    conceptId: string;
    outcome: ReviewOutcome;
  } | null>(null);
  const reviewSent = useRef(false);
  const reviewSitting = progress.sessionId;
  const reviewSittingSaved = progress.completionSaved;
  useEffect(() => {
    if (!reviewOwed || reviewSent.current) return;
    if (!reviewSittingSaved || !reviewSitting) return;
    reviewSent.current = true;
    schedulerApi
      .recordReview({ ...reviewOwed, sessionId: reviewSitting })
      .then((response) => setReviewRecord({ state: "recorded", response }))
      .catch(() => setReviewRecord({ state: "failed" }));
  }, [reviewOwed, reviewSitting, reviewSittingSaved]);
  /*
   * A completion that did not land leaves nothing for the scheduler to read,
   * so the heading is not held for it: it says what is true of everyone who
   * got here. Sent all the same if the completion lands later.
   */
  const reviewShown: ReviewRecord =
    reviewRecord.state === "pending" && progress.completionFailed
      ? { state: "failed" }
      : reviewRecord;
  const recordReview = () => {
    if (!review || !reviewConceptId) return;
    if (!live || partial) return;
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
    setReviewOwed({ studentId, conceptId: reviewConceptId, outcome });
  };
  // SCRUM-101: the segment index the player is about to enter across a module
  // boundary. Non-null takes over the screen with the boundary landing; the
  // student's continue completes the move.
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
  // "offer" returns to the same segment. A module boundary offers none (D91).
  // Trigger travels into `break_start`.
  const breakOrigin = useRef<"advance" | "offer">("advance");
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
  // Hint cards that have come into view, keyed the same way (B131).
  const [seenHints, setSeenHints] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /*
   * WHAT THE ENGINE IS TOLD THE CHILD DID, as counts - see `RuntimeState`.
   * State rather than refs because the request is built from what renders.
   */
  /*
   * NO OFFER IS COUNTED ANY MORE. The declines, the offer shown on this
   * segment and the segments since one was described the engine's separate
   * suggestion pill, which is gone (SCRUM-271 amended, 21 Oct) - so they go up
   * as what is now true of every sitting: nothing declined, nothing shown,
   * none since. A pick in the format group is the child's own and is not a
   * decline of anything, whatever the marker sits on.
   */
  const [observed, setObserved] = useState({
    replays: 0,
    consecutiveErrors: 0,
    breaksTaken: 0,
  });
  const noteAnswer = (correct: boolean) =>
    setObserved((o) => ({
      ...o,
      consecutiveErrors: correct ? 0 : o.consecutiveErrors + 1,
    }));
  // Transient post-answer note that greets the next segment, then fades.
  const [feedback, setFeedback] = useState<string | null>(null);
  // Calculation segments the student has co-constructed to completion — the
  // forward chevron stays gated until the answer assembles (17b §11).
  const [solvedCalcs, setSolvedCalcs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const segment = asEntered(lesson.segments[index]);

  /*
   * THE SITTING'S OWN WORD ON WHAT WAS CHOSEN (K4): `POST /session`'s
   * `deliveryState.segmentChoices`, which answers a moment after the first
   * frame. Where it differs from the lesson read, it wins - but not on the
   * section already on screen, which is never flipped under the child (rule
   * 7), and not on one the child has picked on since. Taken once per answer,
   * as it lands, rather than in an effect, so no frame shows the older read.
   */
  const sittingChoices = choicesHeld
    ? progress.opened?.deliveryState?.segmentChoices
    : undefined;
  const [choicesTaken, setChoicesTaken] = useState<object | null>(null);
  if (sittingChoices && choicesTaken !== sittingChoices) {
    setChoicesTaken(sittingChoices);
    setChosen((prev) =>
      withSessionChoices(
        prev,
        sittingChoices,
        lesson.segments.map((s) => s.id),
        (id) => id === segment.id || pickedOn.has(id),
      ),
    );
  }

  /*
   * A CALCULATION THE CHILD IS GIVEN AS TEXT IS REPORTED, as they meet it:
   * one the server offered that this app refused (`calculationFor`), or one
   * whose solver failed here. Once per segment a page - `clientErrors`.
   */
  const fellBack = segment.calculationRefused;
  const failure = failedCalcs.get(segment.id);
  useEffect(() => {
    if (fellBack === undefined) return;
    reportCalculationFallback({
      lessonId: lesson.id,
      segmentId: segment.id,
      reason: fellBack,
      ...(failure === undefined ? {} : { error: failure }),
    });
  }, [lesson.id, segment.id, fellBack, failure]);

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
    // Not for a visit that opened in the check (B82): the child never sees a
    // segment, and the engine must not be told they arrived on one. Nor for a
    // finished lesson reopened, whose sitting has ended (Teslim, 21 Oct: "use
    // review mode rather than sending in-lesson adaptation calls against that
    // ended sitting") - see `finished`.
    live && !review && !finished && checkOpensAt === null,
    // The BACKEND's sitting, not the local correlation id above: the engine
    // refuses an `in_lesson` read without it - see `useRuntimeAdaptation`.
    progress.sessionId,
    {
      currentSegmentId: segment.id,
      currentModality: modality,
      availableModalities: segment.modalities,
      midpointReached: index >= Math.floor(lesson.segments.length / 2),
      replayCountOnSegment: observed.replays,
      consecutiveErrors: observed.consecutiveErrors,
      // No suggestion pill, so nothing offered or declined - see `observed`.
      declinedModalities: NONE_DECLINED,
      sessionDeclineCount: 0,
      sameSegmentSuggestionShown: false,
      segmentsSinceLastSuggestion: null,
      breaksTaken: observed.breaksTaken,
    },
    lesson,
    applied,
    // An ask after an answer goes once that answer's write has landed, so
    // the engine's count of stored answers includes it (SCRUM-275).
    attemptWrites,
  );

  /*
   * THE ENGINE'S NEWEST WORD ON A SEGMENT, over what it said at load.
   *
   * Merged rather than replaced: an in-lesson row carries the segment's
   * modality, scaffold, formats and recommendation, and nothing about
   * breaks - so the load-time plan's planned and offered breaks survive the
   * engine reconsidering the rest.
   */
  const livePlanFor = (segmentId: string) => {
    const base = planFor(segmentId);
    const fresh = runtime.plan?.segments.find((s) => s.segmentId === segmentId);
    return fresh ? { ...base, ...fresh } : base;
  };

  // ── Signal helpers ──────────────────────────────────────────────────────
  // Which scroll milestones have fired, reset per segment.
  const scrollMarks = useRef<Set<number>>(new Set());
  /** The reading column, measured for `scroll` - see `handleScroll`. */
  const columnRef = useRef<HTMLDivElement | null>(null);
  /** The foot of the screen, under the arrows, where the solver docks its pad. */
  const [padDock, setPadDock] = useState<HTMLDivElement | null>(null);
  /** The row above the arrows, where the Socratic panel opens (SCRUM-275). */
  const [panelDock, setPanelDock] = useState<HTMLDivElement | null>(null);
  /**
   * The segment whose body is CHUNKED, reported by the body itself.
   *
   * The attention accommodation and the child's own Slower deliberately hold
   * most of the body back, so the column's scroll describes one part, not the
   * segment - see `handleScroll`. The body is the only thing that knows it is
   * in parts, so it says.
   *
   * STAMPED WITH THE SEGMENT ID RATHER THAN CLEARED ON SEGMENT CHANGE, and
   * that is deliberate. React runs child effects before parent ones, so a new
   * segment's body reports BEFORE any reset here could run, and a reset would
   * wipe the fresh value rather than the stale one. Comparing ids cannot lose
   * that race because it does not race: a report either belongs to the
   * segment being asked about or it does not.
   */
  const chunkRead = useRef<{ segmentId: string } | null>(null);
  /**
   * HOW FAR DOWN THE SEGMENT THE CHILD SAW, 0 to 1, for `time_on_segment`'s
   * `depthRatio` (B90, 8 Oct). The furthest it has been, never where it is
   * now: scrolling back up unreads nothing. Measured where the column is -
   * see `columnReach` - so a segment that fits on one screen is 1, and a
   * chunked body by the parts it has shown. Stamped like `chunkRead`.
   */
  const deepest = useRef<{ segmentId: string; ratio: number } | null>(null);
  const noteDepth = useCallback((segmentId: string, ratio: number) => {
    const before =
      deepest.current?.segmentId === segmentId ? deepest.current.ratio : 0;
    deepest.current = {
      segmentId,
      ratio: Math.min(1, Math.max(before, ratio)),
    };
  }, []);
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
      chunkRead.current = { segmentId: lesson.segments[index].id };
      setPartsLeftOn(pct < 100 ? lesson.segments[index].id : null);
      // The parts shown so far are how far down it the child has seen.
      noteDepth(lesson.segments[index].id, pct / 100);
    },
    [lesson.segments, index, noteDepth],
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
   * 3. THE SCROLL POSITION RESETS - but not by this. Focusing scrolled its
   *    target into view, which once carried the reset; with the column the
   *    scroller it scrolled the group's top 32-48px under the progress bar
   *    instead. So focus lands without scrolling, and the column is put back
   *    to its top by `columnRef`'s own reset, below.
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
    bodyRef.current?.focus({ preventScroll: true });
  }, [segment.id, modality]);
  /*
   * D148: "SEGMENT 3 OF 10" IS SAID ONCE, WHEN THE SEGMENT OPENS - "not on
   * every interaction inside it" (design, 8 Oct). It is the group's name, so a
   * screen reader says it whenever focus lands on the group or comes back
   * into it. Two things inside a segment did that: a format picked in the
   * format group rebuilds the body and focus lands on it again, and a child who
   * stepped out to the chips or the hint and came back walked into it again.
   * So the name is dropped for the rest of the visit once focus has left the
   * group, and a rebuild for a new modality comes up without it. A new
   * segment - or the same one opened again - is named afresh. The line above
   * the progress bar still shows it throughout.
   */
  const [positionSaidOn, setPositionSaidOn] = useState<string | null>(null);

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
  /** How long the segment has been on screen so far, on the clock above. */
  const shownSoFar = useCallback(() => {
    const clock = segmentClock.current;
    if (!clock) return 0;
    return (
      clock.shownMs +
      (clock.since === null ? 0 : performance.now() - clock.since)
    );
  }, []);
  /**
   * The switch taken on this segment, for `modality_switch_outcome` as it is
   * left: from and to, and how long the segment had been on screen by then.
   */
  const switched = useRef<{
    segmentId: string;
    from: Modality;
    to: Modality;
    atShownMs: number;
  } | null>(null);
  useEffect(() => {
    if (!inSegments) return;
    const clock = { shownMs: 0, since: null as number | null };
    segmentClock.current = clock;
    const segId = lesson.segments[index].id;
    scrollMarks.current = new Set();
    return () => {
      // Monotonic (rule 4): this duration goes to the engine, and a wall
      // clock that jumps - a tablet correcting itself mid-lesson - sends a
      // negative.
      const shownMs =
        clock.shownMs +
        (clock.since === null ? 0 : performance.now() - clock.since);
      // B45: the text version on screen as the child left, stamped with the
      // segment like `chunkRead`. Unknown is left out rather than guessed.
      const depth =
        textShown.current?.segmentId === segId ? textShown.current.depth : null;
      /*
       * HOW FAR DOWN IT THE CHILD SAW, as the catalogue's `depthRatio` (B90,
       * 8 Oct) - see `deepest`. It was a `scrollDepthPct` the catalogue did
       * not declare, and then nothing until it did. A column never laid out
       * measured nothing, and nothing is sent rather than a 0 it did not see.
       */
      const seen =
        deepest.current?.segmentId === segId ? deepest.current.ratio : null;
      trackEvent(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT, {
        segmentId: segId,
        durationMs: Math.max(0, Math.round(shownMs)),
        ...(depth ? { depthShown: depth } : {}),
        ...(seen !== null ? { depthRatio: seen } : {}),
      });
      /*
       * WHAT BECAME OF A SWITCH (B73/B104, 8 Oct): sent once, as the segment
       * shown in the new modality is left or the lesson ends on it. In this
       * player that is the segment the switch was taken on - the next opens
       * in whatever the plan names. Its time is what was measured, in ms
       * (confirmed 9 Oct): the segment on screen from the switch to the way
       * out. No `outcome` and no score - better, worse, comprehension and
       * engagement are judgements of the child (rule 3). The server takes
       * the scores as supplied aggregates and derives none yet; an aggregate
       * worked out here would still be this client judging the child.
       */
      const taken = switched.current;
      if (taken?.segmentId === segId) {
        switched.current = null;
        trackEvent(SIGNAL_EVENT_TYPES.MODALITY_SWITCH_OUTCOME, {
          segmentId: segId,
          from: taken.from,
          to: taken.to,
          timeOnSegment: Math.max(0, Math.round(shownMs - taken.atShownMs)),
        });
      }
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
   * HOW FAR DOWN THE SEGMENT HAS BEEN ON SCREEN, MEASURED ON WHAT SCROLLS.
   *
   * The column is the scroller now: the player is one screen high, with the
   * header and the arrows pinned. It was `min-h-[100dvh]` until 11 Oct, so
   * the column grew with its segment and the PAGE scrolled instead - its own
   * scroll room was always 0, a listener on the column never fired, and no
   * `scroll` mark was ever sent.
   *
   * The page can still carry it - a browser that takes no `dvh`, or a zoom
   * the height is not divided by - so whichever scrolls, this reads it: the
   * column's own room when it has some, and the viewport's reach down the
   * column when the page carries it.
   *
   * Only a scroll of the page or of the column counts. A sheet or a drawer
   * scrolling is not the child scrolling the segment.
   *
   * AND ONLY ONCE THE CHILD HAS GONE FURTHER DOWN THAN THE SEGMENT OPENED
   * SHOWING. The catalogue's `scroll` is "the child scrolls within a
   * segment", and the page also moves when the child did not: the player's
   * own focus move onto a new segment after Next is a scroll event too. So
   * how far down was on screen at the start is taken once the segment is in
   * place, and nothing goes up until the child passes it. A segment that fits
   * on one screen can never be passed, so it sends no `scroll` - a depth for
   * one nobody scrolled would be a scroll that never happened. How much of
   * such a segment was on screen has no declared home now - see
   * `time_on_segment` above.
   */
  const columnReach = useCallback(() => {
    const column = columnRef.current;
    if (!column) return null;
    if (column.scrollHeight - column.clientHeight > 0)
      return {
        reach: column.scrollTop + column.clientHeight,
        height: column.scrollHeight,
      };
    const rect = column.getBoundingClientRect();
    if (rect.height <= 0) return null;
    return {
      reach: Math.max(0, Math.min(window.innerHeight, rect.bottom) - rect.top),
      height: rect.height,
    };
  }, []);
  /** How far down the column was on screen when the segment opened, in px. */
  const reachAtEntry = useRef(0);
  // After the focus move above, so it measures where that move left the page.
  useEffect(() => {
    reachAtEntry.current = columnReach()?.reach ?? 0;
  }, [index, modality, columnReach]);
  /*
   * The solver bringing its step into view above the pad is the system
   * moving the column too, like the focus move - so where that leaves it is
   * taken as where the segment opened, and only the child going further down
   * is their scroll.
   */
  const systemScrolled = useCallback(() => {
    const at = columnReach();
    if (at) reachAtEntry.current = Math.max(reachAtEntry.current, at.reach);
  }, [columnReach]);
  const handleScroll = useCallback(() => {
    // Every mark already sent: nothing to measure, so no layout read per frame.
    if (scrollMarks.current.size === SCROLL_MILESTONES.length) return;
    const at = columnReach();
    if (!at) return;
    /*
     * A milestone describes the SEGMENT, so a chunked body cannot raise one.
     * Scrolling to the foot of Part 1 of 3 is the bottom of a third, and
     * emitting `depthRatio: 1` for it would tell the engine the child had read
     * the whole segment. This stays quiet rather than overstating - and so
     * does `deepest`, which takes a chunked body's own count.
     */
    if (chunkRead.current?.segmentId === segment.id) return;
    noteDepth(segment.id, at.reach / at.height);
    if (at.reach <= reachAtEntry.current) return;
    const seen = at.reach / at.height;
    for (const mark of SCROLL_MILESTONES) {
      if (seen * 100 >= mark && !scrollMarks.current.has(mark)) {
        scrollMarks.current.add(mark);
        trackEvent(SIGNAL_EVENT_TYPES.SCROLL, {
          segmentId: segment.id,
          depthRatio: mark / 100,
        });
      }
    }
  }, [columnReach, segment.id, trackEvent, noteDepth]);
  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target === document || target === window || target === columnRef.current)
        handleScroll();
    };
    // Captured, because an element's scroll does not bubble to the window.
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, [handleScroll]);

  /*
   * B105 (9 Oct): THE PAGE GOING HIDDEN MID-LESSON, AND FOR HOW LONG - two of
   * `engagement_signal`'s indicators, and two the client sees as they are,
   * with no cutoff of its own. `task_switch` (a count, 1) as it goes, and
   * `return_after_pause` (the ms it stayed hidden) as it comes back. Hidden
   * covers another app, another tab and a locked screen alike; which of
   * those it was, and whether it matters, is the engine's to read.
   *
   * Only while the lesson is under way - not before a review begins, and
   * not on the finished screen. A page that opened hidden was not switched
   * away from, so nothing goes up until it has been seen to go.
   *
   * CAPTURED, so this runs before `useSignals`' own listener on the same
   * event, which sends the queue as the page hides: the switch goes in that
   * send rather than waiting for the page to come back.
   */
  const lessonUnderWay = phase === "segments" || phase === "assessment";
  useEffect(() => {
    if (!lessonUnderWay) return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (hiddenAt !== null) return;
        hiddenAt = performance.now();
        trackEvent(SIGNAL_EVENT_TYPES.ENGAGEMENT_SIGNAL, {
          indicator: "task_switch",
          value: 1,
        });
        return;
      }
      if (hiddenAt === null) return;
      const away = performance.now() - hiddenAt;
      hiddenAt = null;
      trackEvent(SIGNAL_EVENT_TYPES.ENGAGEMENT_SIGNAL, {
        indicator: "return_after_pause",
        value: Math.max(0, Math.round(away)),
      });
    };
    document.addEventListener("visibilitychange", onVisibility, true);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility, true);
  }, [lessonUnderWay, trackEvent]);

  // Auto-clear the feedback note.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [feedback]);

  // ── Touch Signal Contract markers (SCRUM-94.8) ──────────────────────────
  /** The `system_busy` windows open now, one per reason. */
  const busyWindows = useRef(new Map<BusyReason, () => void>());
  /**
   * Opens or closes the window the system owns for `reason`. It goes up once,
   * as it closes, with its length - see `openBusyWindow`.
   *
   * One window per reason: a second start while one is open is the same wait,
   * and an end with nothing open has no length anyone measured, so it sends
   * nothing.
   */
  const trackBusy = useCallback(
    (reason: BusyReason, phase: BusyPhase) => {
      const open = busyWindows.current;
      if (phase === BUSY_PHASE.START) {
        if (!open.has(reason)) open.set(reason, openBusyWindow(trackEvent, reason));
        return;
      }
      open.get(reason)?.();
      open.delete(reason);
    },
    [trackEvent],
  );
  // Leaving the player mid-wait ends the wait: what is open goes up as it was.
  useEffect(() => {
    const open = busyWindows.current;
    return () => {
      for (const close of open.values()) close();
      open.clear();
    };
  }, []);

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
  // dismissed something, which is the opposite of blocked. The reason is the
  // busy window the tap fell in, opened just above.
  useEffect(() => {
    if (!checkOpen) return;
    const onScrimTap = () =>
      trackEvent(SIGNAL_EVENT_TYPES.TAP_BLOCKED, {
        target: "scrim",
        reason: BUSY_REASON.BLOCKED_BY_MODAL,
      });
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
   * is the hint a child opens, and sends its own pair - see `onCalcHint`.
   *
   * ON SCREEN IS IN VIEW (B131): "hint_offered fires when the hint becomes
   * visible, not when the engine response arrives." The card under the
   * content counts from when it first comes into view (`HintOverlay`'s
   * `onSeen`), so a card below the fold the child never scrolled to was
   * neither offered nor used.
   *
   * ON A CALCULATION THE HINT IS THE SOLVER'S, in the step's hint place, and
   * only the solver knows when it is drawn: never beside a step's
   * confirmation, which holds the step's place, nor after the solve. So the
   * solver reports it as it shows (B131, `offerHint`), and its use as the
   * child submits a step with it on screen (B130) - not here.
   */
  const solverShowing = modality === MODALITY.INTERACTIVE && isCalculation(segment);
  /*
   * WHILE THE CHECK IS OPEN THE HINT IS IN IT, with its question (Lydia,
   * SCRUM-275, 21 Oct) - never under the segment behind the sheet, and never
   * held for the sheet to close. Where it goes is all this decides: whether
   * there is a hint at all, after however many misses, is the engine's
   * (`hintHere`), and nothing here counts them. Closed, it is where it was.
   */
  const hintInSheet = checkOpen && Boolean(segment.quickCheck);
  const hintOnScreen =
    segmentShowing &&
    hintHere &&
    Boolean(hintText) &&
    (hintInSheet || !solverShowing) &&
    seenHints.has(hintKey);
  const offeredHints = useRef<Set<string>>(new Set());
  const usedHints = useRef<Set<string>>(new Set());
  /** The engine's hint went on screen: once per hint per segment. */
  const offerHint = useCallback(
    (segmentId: string, key: string) => {
      if (offeredHints.current.has(key)) return;
      offeredHints.current.add(key);
      trackEvent(SIGNAL_EVENT_TYPES.HINT_OFFERED, { segmentId });
      // An unrequested hint on screen is an adaptation applied (B42).
      noteApplied();
      // A right answer to this segment's check is `after_hint` now (B28).
      hintedSegments.current.add(segmentId);
    },
    [trackEvent, noteApplied],
  );
  useEffect(() => {
    if (hintOnScreen) offerHint(segment.id, hintKey);
  }, [hintOnScreen, hintKey, segment.id, offerHint]);

  /*
   * B74 (8 Oct): A RENDERED SOCRATIC PANEL IS AN ADAPTATION APPLIED, counted
   * as the engine's panel goes on screen under the segment - the same
   * condition that draws it below - and not again as the child opens it,
   * which is theirs. Once per segment, like a hint: a return visit or a
   * re-render is not the engine applying it again.
   */
  const panelOnScreen =
    segmentShowing &&
    contentHere &&
    action === ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL &&
    guidedPrompts.length > 0;
  const countedPanels = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!panelOnScreen || countedPanels.current.has(segment.id)) return;
    countedPanels.current.add(segment.id);
    noteApplied();
  }, [panelOnScreen, segment.id, noteApplied]);

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
  // `offerHint` marks it as the hint is offered; the solver's own, as shown.

  // Break OFFERS (B.7): the plan names a break type to OFFER on this segment,
  // or the engine suggests one mid-lesson. The only ask the player puts on
  // screen now the modality suggestion is gone (21 Oct).
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
   * THE FORMAT GROUP (SCRUM-272; Nevo Lesson Player Frame, 51b9e2a), where
   * the engine's separate suggestion pill used to be. The pill is gone, and
   * its accept-and-decline flow with it (SCRUM-271 amended, 21 Oct): the
   * section's formats, the one on screen, and the server's recommendation -
   * read, never worked out - which the group marks only where it differs
   * from the one on screen. A single-format section has no group and no
   * marker. The newest read of either wins: an engine answer over the
   * lesson's own (`livePlanFor`).
   */
  /*
   * Formats the server refused for a segment this visit (409
   * `format_unavailable`): it says they are not there, so they leave that
   * segment's group, with no message.
   */
  const [refusedFormats, setRefusedFormats] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const formatsHere = formatsOf(segment, segPlan).filter(
    (f) => !refusedFormats.has(`${segment.id}:${f}`),
  );
  const recommendedHere = recommendationOf(segment, segPlan);
  const showFormats = formatsHere.length >= 2;
  /*
   * A FORMAT SWITCH ON ITS WAY TO THE SERVER - the frame's mid-switch state,
   * "the target reads selected, content holds position, a quiet in-place cue
   * (no takeover)": the pill picked reads selected, "One moment" sits above
   * the content, and the content dims where it is. `pendingSwitch` is the
   * one still on screen; leaving the segment ends the wait.
   */
  const [switching, setSwitching] = useState<{
    segmentId: string;
    to: Modality;
  } | null>(null);
  const pendingSwitch = useRef<number | null>(null);
  const switchTickets = useRef(0);
  const switchingHere =
    switching?.segmentId === segment.id ? switching.to : null;
  /** Ends the wait for a switch, as it lands or as the child leaves it. */
  const endSwitchWait = () => {
    pendingSwitch.current = null;
    setSwitching(null);
    // The system-owned wait closes with it (SCRUM-94.9).
    trackBusy(BUSY_REASON.MODALITY_SWITCH, BUSY_PHASE.END);
  };
  /*
   * THE FORMAT ROW'S HEIGHT IS THE LESSON'S, as the chip row's is (below): a
   * section with one format has no group, and taking the row away there
   * would lift the position line and the progress between one section and
   * the next. Held, unseen, wherever the lesson has a group anywhere - but
   * not on the solver, which draws no row and needs the room.
   */
  const formatsInLesson = useMemo(
    () => lesson.segments.some((s) => formatsOf(s, undefined).length >= 2),
    [lesson],
  );

  const go = (next: number) => {
    if (next < 0 || next >= total) return;
    // A switch still on its way stays with the segment it was made on: the
    // write goes on, and what it lands as is kept for a return visit.
    if (pendingSwitch.current !== null) endSwitchWait();
    setObserved((o) => ({ ...o, replays: 0 }));
    const nextSegment = asEntered(lesson.segments[next]);
    const nextPlan = livePlanFor(nextSegment.id);
    setIndex(next);
    // Opening a segment names it, a return visit included (D148).
    setPositionSaidOn(null);
    // A session that opened lower reads lower from here on (SCRUM-178). Only
    // ever with a move, so the text changes as a segment opens, never under
    // one being read.
    if (progress.opened?.depth === "lower") setLowerDepth(true);
    setEntryDensity({
      segmentId: nextSegment.id,
      level: nextPlan?.densityLevel ?? null,
    });
    /*
     * THE CHILD'S PACE PICK STAYS ON ITS OWN SECTION (Lydia, 21 Oct), as
     * their format pick always has. Nothing about pace is set here: the
     * section being opened shows its own stored or picked pace, else the
     * standard text - see `manualDensity`.
     */
    setModality(
      openingModality(
        nextSegment,
        nextPlan?.startModality,
        chosen.get(nextSegment.id)?.modality,
      ),
    );
    /*
     * A PLAN'S DENSITY IS NOT A TRIGGER. This sent the authored per-segment
     * density as `simplify_trigger` / `expand_trigger` / `slower_trigger` with
     * `source: "system"`, and the catalogue's trigger for all three is the
     * child asking. Only the demo lessons carry a per-segment density, so no
     * engine reading is lost; the child's own chip is the one trigger left.
     */
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
    if (!assess) setEnding(finishedAs);
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
    trackEvent(SIGNAL_EVENT_TYPES.BREAK_TAKEN, {
      breakType: breakOffered,
      trigger: offerTrigger,
    });
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
    trackEvent(SIGNAL_EVENT_TYPES.BREAK_DECLINED, {
      breakType: breakOffered,
      trigger: offerTrigger,
    });
  };

  /** Next chevron — an unpassed Quick Check intercepts the advance. */
  const handleNext = () => {
    // Next past a hand-off is Keep going by another way: the panel goes
    // with the segment, as it does there.
    if (handoffHere) {
      keepGoingAfterHandoff();
      return;
    }
    if (
      segment.quickCheck &&
      !passedChecks.has(segment.id) &&
      !handedOff.has(segment.id)
    ) {
      setCheckOpen(true);
      return;
    }
    advancePastSegment();
  };

  /*
   * B94: THE SERVER SAID HAND OFF. The answer to a quick check came back with
   * `handoffTo: "socratic_panel"` - after three misses the server marked, not
   * any count kept here - so the check gives way to the panel (38a): the sheet
   * closes, and the panel arrives open with the server's prompts and nothing
   * to accept or decline. Prompts with no id or no words are not drawn; a
   * hand-off with none left draws nothing (rule 5), and the check stays.
   *
   * B128 (13 Oct): "advanceAfterHandoff is true whenever a Socratic handoff
   * exists. False means there is no handoff." So a reply without it is no
   * hand-off at all, whatever else it carries: no panel, and the check stays
   * the way on. There is no panel that ends nowhere.
   */
  const handOffFrom = (segmentId: string, stored: LessonQuestionAttempt) => {
    if (stored.handoffTo !== "socratic_panel") return;
    if (stored.advanceAfterHandoff !== true) return;
    if (answeredRight.current.has(segmentId)) return;
    const prompts = (stored.guidedPrompts ?? []).flatMap((p) =>
      p?.id && p.prompt?.trim() ? [{ id: p.id, prompt: p.prompt }] : [],
    );
    if (prompts.length === 0) return;
    setCheckOpen(false);
    /*
     * "FORWARD, NEVER BACK TO THE QUESTION" (38a §2) holds from the moment the
     * hand-off arrives, not only once Keep going is pressed: a child who
     * closes the panel and taps Next goes forward too, never into the check
     * and its old wrong pick. Still not passed, and the misses still stand.
     */
    setHandedOff((prev) => new Set(prev).add(segmentId));
    setHandoff((prev) => ({
      segmentId,
      run: (prev?.run ?? 0) + 1,
      prompts,
    }));
  };

  /*
   * 38a's return: "forward, never back to the question". Moving on is not
   * passing: the check is never marked passed, its misses stand for the
   * review, and the panel on screen already made a right answer later
   * `after_hint` - so nothing records this as known first time.
   */
  const keepGoingAfterHandoff = () => {
    setHandedOff((prev) => new Set(prev).add(segment.id));
    setHandoff(null);
    advancePastSegment();
  };
  // The hand-off on this segment, if one arrived for it.
  const handoffHere = handoff?.segmentId === segment.id ? handoff : null;

  /*
   * Previous chevron. B105 (9 Oct): BACK TO AN EARLIER SEGMENT IS THE ONE
   * NON-LINEAR MOVE THIS PLAYER HAS - Next goes on by one, and the check has
   * no way back - so each is one `navigation_fragmentation`. Whether the
   * moves add up to fragmentation is the engine's reading, not this one's.
   */
  const handlePrev = () => {
    if (index === 0) return;
    trackEvent(SIGNAL_EVENT_TYPES.ENGAGEMENT_SIGNAL, {
      indicator: "navigation_fragmentation",
      value: 1,
    });
    go(index - 1);
  };

  /** Keeps a pick with the segment it was made on, for this visit. */
  const keepChoice = (segmentId: string, patch: ChosenVersion) => {
    setPickedOn((prev) =>
      prev.has(segmentId) ? prev : new Set(prev).add(segmentId),
    );
    setChosen((prev) =>
      new Map(prev).set(segmentId, { ...prev.get(segmentId), ...patch }),
    );
  };

  /*
   * A CHOICE GOES TO THE SERVER, WHERE IT IS HELD (K4, Lydia 21 Oct) - for
   * the backend's sitting and the segment's own id. Only where there is one
   * to hold it under: no sitting yet is no write, and nothing is queued for
   * later - the pick still shows, and lasts this visit. Never for a review, a
   * finished lesson opened again or the walkthrough (`choicesHeld`), and
   * never to browser storage.
   *
   * Called a beat later, so a failure of any kind arrives as one, never as a
   * throw in the middle of a tap.
   */
  const choiceWrite = (
    segmentId: string,
    body: SegmentChoiceWrite,
  ): Promise<unknown> | null => {
    const sitting = progress.sessionId;
    if (!choicesHeld || !sitting || !getToken()) return null;
    return Promise.resolve().then(() =>
      lessonsApi.saveSegmentChoice(lesson.id, sitting, segmentId, body),
    );
  };

  /*
   * THE CHILD'S MANUAL PACE ON THIS SEGMENT (the navy chip): the segment's
   * own choice - stored on the server, or picked here this visit - and
   * otherwise none, the standard text. Separate from the system's density -
   * the engine's instruction or the segment plan's, and NOTHING when neither
   * gave one (D23, below) - which renders as the violet chip and supplies the
   * view until the child overrides it. Both can show at once.
   *
   * A PICK STAYS ON ITS OWN SECTION (Lydia, 21 Oct, her newest written rule:
   * the choice "is scoped to the segment, so a choice on one segment does not
   * carry to the next"). That is what the server stores, too - per section,
   * per sitting - so a reload changes nothing the child sees: moving on opens
   * the next section exactly as a reload would, in its own stored or picked
   * pace or else the standard text, and coming back opens a section in the
   * pick made on it. Formats never carried.
   *
   * This replaces the carry through the lesson, which "holds for the current
   * lesson and resets after" (design 18 Sep; Lydia's 21 Sep rule, restated
   * 17 Oct): carried in component state, it showed a child a pace on the
   * next section that a reload then took away. The hub has asked Lydia to
   * confirm the 21 Oct rule over the 17 Oct one; the demo does not hold on
   * it. What the engine learns is still only that the child asked, from the
   * trigger the chip sends.
   */
  const manualDensity: Density | null = chosen.get(segment.id)?.density ?? null;
  /** Which pick on a segment is the newest, for a refusal that lands late. */
  const paceTickets = useRef(new Map<string, number>());

  const pickDensity = (id: string) => {
    const d = id as Density;
    const segmentId = segment.id;
    const next = manualDensity === d ? null : d;
    const before = chosen.get(segmentId)?.density;
    keepChoice(segmentId, { density: next });
    // A tap that sets (not clears) a density is the child asking - the only
    // thing these triggers mean, so no `source` rides with it.
    if (next) {
      trackEvent(DENSITY_TRIGGER[next], { segmentId });
    }
    /*
     * HELD ON THE SERVER for this segment: only what changed, and the
     * standard text as a clear (`paceWrite`). The chips switch at once, as
     * they always have; the write follows. Refused as `depth_unavailable` -
     * a rewrite the server does not hold as cleared - the segment goes back
     * to the pace it had, with no message. Any other failure is honoured on
     * screen and simply not kept past this visit.
     */
    const write = paceWrite(before, next);
    if (!write) return;
    const ticket = (paceTickets.current.get(segmentId) ?? 0) + 1;
    paceTickets.current.set(segmentId, ticket);
    void choiceWrite(segmentId, write)?.catch((cause: unknown) => {
      if (refusalOf(cause) !== "depth_unavailable") return;
      if (paceTickets.current.get(segmentId) !== ticket) return;
      setChosen((prev) => {
        const back = new Map(prev);
        const restored: ChosenVersion = { ...back.get(segmentId) };
        if (before === undefined) delete restored.density;
        else restored.density = before;
        if (Object.keys(restored).length > 0) back.set(segmentId, restored);
        else back.delete(segmentId);
        return back;
      });
    });
  };

  // Frame contract: the manual pick is navy; the system's standing density is
  // violet and KEEPS showing beside a different manual pick. No glow and no
  // sparkle on it since D144 - see `AdaptiveToggleBar`.
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
  const effectiveDensity: Density | null = manualDensity ?? systemDensity;
  /*
   * A NEW SEGMENT, VERSION OR PACE OPENS AT ITS TOP. The column is what
   * scrolls, and it is the same element from one segment to the next, so it
   * kept its place: Next from the foot of one long segment opened the next
   * part-way down with its heading out of sight, and a change of pace opened
   * the new text where the old had been left. Before the paint, so the old
   * position is never seen, and before `reachAtEntry` is taken.
   */
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (column) column.scrollTop = 0;
  }, [segment.id, modality, effectiveDensity]);
  /*
   * Only the densities this segment can actually deliver.
   *
   * An offered density that re-renders identical prose is the player telling a
   * child it adapted when it did not, so Simplify and Expand still require an
   * authored reshape to switch to - parsed content has one body and neither.
   *
   * SLOWER IS DIFFERENT, as of 17 Sep, because it is not a rewording. Design:
   * "Slower is about how much arrives at once, which is segmentation and
   * pacing rather than wording." It takes the body in the server's reading
   * chunks, so it is available on live content, and the gate is whether
   * that would change anything - a body sent as one chunk, or none, offers
   * nothing rather than a control that does nothing. Nothing is split here
   * to make parts (B114).
   *
   * AND ONLY WHILE THE TEXT IS WHAT IS ON SCREEN. Each of the three reshapes
   * the text and nothing else, so a lone "Slower" over a picture, a recording
   * or the calculation solver changed nothing a child could see - and still
   * told the engine they had asked (`slower_trigger`). 17a draws no density
   * pill on the calculation player.
   */
  const textChips: ToggleSegment[] = densitiesFor(segment).map(
    ({ id, label }) => ({
      id,
      label,
      state:
        manualDensity === id
          ? "manual"
          : systemDensity === id
            ? "system"
            : "default",
    }),
  );
  const densitySegments = modality === MODALITY.TEXT ? textChips : [];
  /*
   * THE CHIP ROW'S HEIGHT IS THE LESSON'S, NOT THE SEGMENT'S. Whether a
   * segment offers a chip is down to its own content - since B114, whether
   * the server broke its body into chunks - so taking the row away on a
   * segment with none lifted the position line, the progress and the column
   * 62px from one segment to the next. A lesson with a chip anywhere holds
   * the row on every segment; a lesson with none has no row at all.
   */
  const chipsInLesson = useMemo(
    () => lesson.segments.some((s) => densitiesFor(s).length > 0),
    [lesson],
  );

  /*
   * B45: KEPT AS THE SCREEN CHANGES, READ AS THE CHILD LEAVES. React runs a
   * commit's effect cleanups before its setups, so the time-on-segment
   * cleanup reads the segment being left before the next one's version
   * lands here - and the segment id it is stamped with says so either way.
   */
  const depthNow = depthShown(
    segment,
    modality,
    effectiveDensity,
    simplified.has(segment.id),
  );
  useEffect(() => {
    textShown.current = { segmentId: segment.id, depth: depthNow };
  }, [segment.id, depthNow]);

  /*
   * B90: WHAT WAS ON SCREEN AS THE SEGMENT OPENED, OR AS ITS TEXT CHANGED, IS
   * SEEN - all of a segment that fits, without a scroll. A chunked body
   * reports its own parts instead, so its column, one part, is not measured.
   * After the focus move, so it measures where that move left the page; and
   * again as anything covering the segment lifts.
   */
  useEffect(() => {
    if (!segmentShowing || chunkRead.current?.segmentId === segment.id) return;
    const at = columnReach();
    if (at) noteDepth(segment.id, at.reach / at.height);
  }, [
    segmentShowing,
    segment.id,
    modality,
    effectiveDensity,
    columnReach,
    noteDepth,
  ]);

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
    manualDensity === null &&
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

  /*
   * B74 (8 Oct): THE ENGINE'S DENSITY SPACING, COUNTED WHEN IT CHANGES ON
   * SCREEN MID-SESSION. The spacing the lesson opened on is not an adaptation
   * applied; a different one reaching a later segment is. Compared as the
   * spacing drawn, so a medium level after none - the segment as it has
   * always been drawn, both - changes nothing a child could see.
   */
  const spacingOnScreen = segmentShowing
    ? densitySpacing(
        entryDensity.segmentId === segment.id ? entryDensity.level : null,
      )
    : null;
  const spacingShown = useRef<string | null>(null);
  useEffect(() => {
    if (spacingOnScreen === null) return;
    const before = spacingShown.current;
    if (before !== null && before !== spacingOnScreen) noteApplied();
    spacingShown.current = spacingOnScreen;
  }, [spacingOnScreen, noteApplied]);

  /**
   * The child picks a format in the group (SCRUM-272).
   *
   * THEIR OWN CHOICE, NOT AN ADAPTATION APPLIED: nothing here counts it with
   * the system's (B42), and no client event names it - the server writes
   * `modality_manual_switch` for a choice it stores (Teslim, 21 Oct). What
   * became of the switch still goes up as the segment is left (B73/B104).
   *
   * It is the format for this segment from now on: kept with the segment, so
   * a return visit opens in it, and outranking any plan row for it - see
   * `openingModality`. No copy, no animation and no correction, whether or not
   * it is the one the marker sits on.
   *
   * HELD ON THE SERVER, so a reload opens in it (K4). While the write is on
   * its way the frame's "One moment" shows - see `switching`. Then:
   *  - stored: it goes on screen;
   *  - refused, `format_unavailable`: the segment stays as it is, and the
   *    format leaves its group - the server says it is not there. No message;
   *  - anything else - a closed sitting, no connection, a server fault, or no
   *    answer within `SWITCH_WAIT_MS`: it goes on screen all the same, the
   *    child's action honoured now. It only does not survive a reload, and
   *    nothing is said about that either.
   * With no sitting to hold it under there is no write and no wait.
   */
  const pickFormat = (to: Modality) => {
    if (switching) return;
    if (to === modality || !formatsHere.includes(to)) return;
    const segmentId = segment.id;
    const from = modality;
    const write = choiceWrite(segmentId, { modality: to });
    if (!write) {
      keepChoice(segmentId, { modality: to });
      showFormat(segmentId, from, to);
      return;
    }
    const ticket = ++switchTickets.current;
    pendingSwitch.current = ticket;
    setSwitching({ segmentId, to });
    trackBusy(BUSY_REASON.MODALITY_SWITCH, BUSY_PHASE.START);
    let settled = false;
    const settle = (refused: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(cap);
      const onScreen = pendingSwitch.current === ticket;
      if (onScreen) endSwitchWait();
      if (refused) {
        setRefusedFormats((prev) => new Set(prev).add(`${segmentId}:${to}`));
        return;
      }
      keepChoice(segmentId, { modality: to });
      if (onScreen) showFormat(segmentId, from, to);
    };
    // Read by `settle` only once it has a value: both callers come later.
    const cap = setTimeout(() => settle(false), SWITCH_WAIT_MS);
    void write.then(
      () => settle(false),
      (cause: unknown) => settle(refusalOf(cause) === "format_unavailable"),
    );
  };

  /** Puts a picked format on screen, on the segment it was picked on. */
  const showFormat = (segmentId: string, from: Modality, to: Modality) => {
    // The body comes back in the new format without its position (D148).
    setPositionSaidOn(segmentId);
    // Its outcome goes up as this segment is left (B73/B104).
    switched.current = {
      segmentId,
      from,
      to,
      atShownMs: shownSoFar(),
    };
    setModality(to);
  };

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
   * Never in the child's way: a write that fails costs them nothing in the
   * check. Not for the authored mocks, whose question ids are not real.
   *
   * HELD ON THE DEVICE WHEN IT CANNOT GO NOW (Lydia, 6 Oct) - no session yet,
   * or a failure worth retrying, such as no connection - under this visit, so
   * its completion waits for it (`pendingProgress`). One the server refused
   * is not held, as before. `clientAttemptId` is the answer's own, kept with
   * it, so one whose reply was lost is not filed twice when it is sent again.
   *
   * `onStored` hears the server's answer to it - the stored row, marked -
   * which is where a hand-off arrives (B94). An answer held for later has no
   * answer yet, and none is waited for.
   */
  const saveAttempt = (
    answer: Omit<LessonQuestionAttemptWrite, "sessionId"> | null,
    onStored?: (stored: LessonQuestionAttempt) => void,
  ) => {
    if (!live || !answer) return;
    const body = { ...answer, clientAttemptId: randomId() };
    const id = progress.sessionId;
    // Taken now: a 401 clears the session before its failure arrives.
    const owner = getSession()?.userId ?? null;
    if (!id) {
      holdAnswer(
        lesson.id,
        { sessionId: null, localId: progress.localId, body },
        owner,
      );
      return;
    }
    attemptWrites.current.push(
      lessonsApi.saveAttempt(lesson.id, { sessionId: id, ...body }).then(
        // Beside the failure, not before it: what the answer leads to is no
        // reason to hold the answer again.
        (stored) => onStored?.(stored),
        (cause: unknown) => {
          if (retryable(cause)) {
            holdAnswer(lesson.id, { sessionId: id, body }, owner);
          }
        },
      ),
    );
  };

  /*
   * The answers given before the exit, read back from the account for Review
   * Answers. Read for the picks only: whether anything landed is the
   * server's verdict (B98), not a count made here.
   */
  const readAnswersBefore = useCallback(
    (at: number, asked: string) => {
      const questions = lesson.assessment?.questions ?? [];
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
        })
        // Unread, Review Answers simply has fewer picks to show.
        .catch(() => {});
    },
    [lesson],
  );

  /*
   * B49: INTO THE CHECK, OR BACK INTO IT, for a child who reaches it from the
   * last segment - one the lesson did not open into (`checkOpensAt`).
   *
   * Where it was left comes off the newest read of it this visit has: the
   * answer to the newest progress write, else the session's own (B82). So a
   * child who moves on before either answers starts the check fresh, as every
   * check started before this. Decided here, once, and never moved under a
   * child who is already answering.
   */
  const beginCheck = () => {
    // A new run of the check; the last run's outcome is not this one's.
    saveCheckOutcome(lesson.id, null);
    const questions = lesson.assessment?.questions ?? [];
    const at = live
      ? checkResumeAt(progress.saved ?? progress.opened, questions.length)
      : null;
    if (at === null) return;
    const asked = progress.sessionId;
    setCheckResume({ at });
    if (at >= questions.length) finishCheck();
    if (asked) readAnswersBefore(at, asked);
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

  /*
   * B82: A LESSON OPENED STRAIGHT INTO ITS CHECK starts that run of it as
   * `beginCheck` would: the last run's outcome cleared, and - left with every
   * question answered and its result unseen - the lesson completed, as the
   * result appears. Nothing is waiting to be stored this early. Once.
   */
  const checkOpened = useRef(false);
  useEffect(() => {
    if (checkOpensAt === null || checkOpened.current) return;
    checkOpened.current = true;
    saveCheckOutcome(lesson.id, null);
    if (checkOpensAt >= (lesson.assessment?.questions.length ?? 0)) {
      markComplete();
    }
  }, [checkOpensAt, lesson, markComplete]);

  /*
   * And its answers from before are read back once there is a session to
   * read them under - which this early there seldom is yet.
   */
  const answersAsked = useRef(false);
  const checkSession = progress.sessionId;
  useEffect(() => {
    if (checkOpensAt === null || answersAsked.current || !checkSession) return;
    answersAsked.current = true;
    readAnswersBefore(checkOpensAt, checkSession);
  }, [checkOpensAt, checkSession, readAnswersBefore]);

  /*
   * B98: HOW THE CHECK WENT IS THE SERVER'S VERDICT, and it comes back on the
   * completion write. Until that write answers the result keeps its place
   * unseen; if it fails - or no session ever opens - there is no verdict, and
   * the result claims none. The walkthrough has no server to give one.
   */
  const verdictPending =
    live && !progress.completionSaved && !progress.completionFailed;
  /*
   * D183: AND THEN THE RESULT CANNOT BE READ, and says so in Lydia's words.
   * Try again sends the completion again (`resend`), and while that is on its
   * way the screen stays as it is rather than flicking back to a blank result.
   */
  const [rereadAsked, setRereadAsked] = useState(false);
  const resultUnread =
    live &&
    resultStateFrom(progress.saved) === null &&
    (progress.completionFailed || (rereadAsked && verdictPending));

  const requestExit = () => {
    trackEvent(SIGNAL_EVENT_TYPES.EXIT_ATTEMPT, { segmentId: segment.id });
    setLeaveOpen(true);
  };

  // A calculation being co-constructed holds the forward chevron until it's
  // solved (17b: forward disabled until the segment completes).
  const calcShowing =
    modality === MODALITY.INTERACTIVE && isCalculation(segment);
  const calcBlocking = calcShowing && !solvedCalcs.has(segment.id);
  // The control column's two rows, drawn or held - see the header.
  const formatRow = showFormats || (formatsInLesson && !calcShowing);
  const densityRow =
    densitySegments.length > 0 || (chipsInLesson && !calcShowing);
  /*
   * THE SUPPORT LEVEL, ONE VALUE FOR THE DOTS AND THE SOLVER (B116). The
   * engine config's starting level is "client-applied ... Support dots only
   * reflect this state", so the solver draws to exactly what the dots show -
   * see the indicator below for the order the sources are read in.
   */
  const supportLevel =
    conceptScaffold ??
    segPlan?.scaffold ??
    (calcShowing ? plan?.initialScaffold : undefined) ??
    null;

  /*
   * ONLY AN UNSOLVED CALCULATION HOLDS THE FORWARD CHEVRON.
   *
   * It was also disabled on the last segment of a lesson with no
   * end-of-lesson questions - and forward is the only thing that reaches the
   * completion screen, so that lesson could not be finished at all. On the
   * last segment forward goes to the assessment when there is one and to
   * completion when there is not; `continueAdvance` already knew both.
   *
   * AND IT HOLDS IT PRESSABLE (Lydia, D211, 13 Oct). Greyed, it read as
   * broken; pressed, it now says why in place, in her line - until the child
   * next acts on the step, when it has done its job: on a short phone at a
   * large text size its row put the step's field out of view.
   */
  const [heldNextOn, setHeldNextOn] = useState<string | null>(null);
  const nextHeld = calcBlocking && heldNextOn === segment.id;

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

  /*
   * A COMPLETED LESSON WHOSE SITTING CANNOT BE FOUND (409
   * `completed_session_unavailable`, Teslim 21 Oct). The server keeps the
   * lesson completed and has nothing to open it under, so there is nothing
   * to play: frame 28's D90 screen, the nothing-state the route draws for a
   * lesson nothing resolved, with its one way back and no retry.
   */
  if (progress.unavailable) {
    return <LessonNotOpened onBack={() => exitTo(LESSONS_HREF)} />;
  }

  /*
   * SCRUM-181: "THAT VERSION DIDN'T WORK." - when the completion write comes
   * back saying nothing landed and the server has rerouted the lesson (B98,
   * SCRUM-178). It replaces the check's result, or the completion screen if
   * the child moved on before the write answered. Design's words verbatim,
   * and no score, count or percentage. Its one action follows the server's
   * reroute: the lesson opens again from its `segmentPosition`, at its
   * `depth`, and its session is the one `POST /session` then hands back -
   * the same rerouted session (backend, 9 Oct). See `LessonRoute`.
   * A lesson nobody attempted is never sent here; it resumes from Home.
   */
  if (
    reroute &&
    onStartAgain &&
    (phase === "assessment" || phase === "complete")
  ) {
    return (
      <LessonMessage
        title={REROUTED.title}
        body={REROUTED.body}
        actionLabel={REROUTED.action}
        onAction={() => onStartAgain(reroute.segmentPosition, reroute.depth)}
      />
    );
  }

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
          // alone as every review leaves it. Back to where the review was
          // opened from (Olayinka, 14 Oct), Home when that was not said.
          setEnding({ completionStatus: "exited", exitPosition: first.id });
          exitTo(reviewDoneHref);
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
        result={live ? resultStateFrom(progress.saved) : undefined}
        resultPending={verdictPending}
        resultUnread={resultUnread}
        onReread={() => {
          setRereadAsked(true);
          progress.resend();
        }}
        onBackToLessons={() => {
          // The check is finished either way: the completion is held and
          // goes when it can (`useLessonProgress`).
          setEnding(finishedAs);
          exitTo(LESSONS_HREF);
        }}
        outcome={live ? checkOutcomeFrom(progress.saved) : null}
        onComplete={finishCheck}
        onLeave={(checkPosition) => {
          /*
           * D36: LEAVING THE CHECK IS NOT FINISHING IT, AND NOT FAILING IT.
           *
           * `exited` at the last segment, the same record the leave dialog
           * makes - so the lesson stays unfinished and comes back on Home to
           * pick up. No `resultState`, on this write or any: it is the
           * server's to derive from its own marks since B98, and the write's
           * field is deprecated. The answers already given were stored one by
           * one as they were confirmed.
           *
           * B49: and WHERE in the check, so it reopens there the same day.
           * None from the intro - a check not begun has no place to keep.
           *
           * NOTHING FOR A FINISHED LESSON REOPENED (D22), as the leave dialog
           * writes nothing for one: `exited` here demoted a lesson the child
           * had completed back to unfinished work on Home.
           */
          const last = total - 1;
          const pos = modulePositionFor(lesson, last);
          if (!review && !finished) {
            reportProgress(LESSON_STATUS.EXITED, {
              segment: last,
              ...(pos ? { module: pos.moduleIndex } : {}),
              ...(checkPosition !== undefined ? { check: checkPosition } : {}),
            });
          }
          setEnding({
            completionStatus: "exited",
            exitPosition: lesson.segments[last].id,
          });
          exitTo(HOME_HREF);
        }}
        onAnswer={({ questionIndex, selectedId, correct, responseTimeMs }) => {
          // The pick goes up on the attempt, where the server marks it - with
          // the time it took, as the check measured it (Lydia, 17 Oct). No
          // hint is ever shown on the after-lesson check, so none is sent.
          const checkpointId = lesson.assessment?.questions[questionIndex]?.id;
          saveAttempt(
            answerFor({
              questionId: checkpointId,
              source: "assessment",
              choice: lesson.assessment?.questions[questionIndex]?.options.find(
                (o) => o.id === selectedId,
              ),
              responseTimeMs,
            }),
          );
          /*
           * THE CATALOGUE'S KEYS, `segmentId` and `questionId`, and nothing it
           * does not declare: correctness is decided on the server against the
           * stored answer, so `correct` - and the pick and its timing beside it
           * - are not sent here; the pick and its timing ride the attempt
           * above. NO `segmentId`: an after-lesson question
           * belongs to the lesson, not to any one segment, and naming the last
           * one would put the answer on a segment it was never about - and
           * the catalogue makes it optional for exactly this (9 Oct).
           * `source` says it is the after-lesson check's (B90/B92, 8 Oct).
           */
          trackEvent(SIGNAL_EVENT_TYPES.COMPREHENSION_RESPONSE, {
            ...(checkpointId ? { questionId: checkpointId } : {}),
            source: "assessment",
          });
          // The first answer to each question, for the scheduler. `Map.set` is
          // guarded so a re-answer cannot overwrite what they knew first time.
          /*
           * NO SCAFFOLD ATTEMPT RIDES BESIDE IT ANY MORE. `POST
           * /api/intelligence/scaffolds/attempt` refuses every student write
           * without persisted server evidence (422
           * `server_marked_attempt_required`), and the answer above already
           * moves support: "Review/scaffold compatibility writes require
           * persisted server evidence; normal lesson completion/answers
           * already update these mechanisms" (Teslim's 19 Oct contract,
           * d461b60). It also sent a device verdict the server no longer
           * takes from a student.
           */
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
        onFinish={() => {
          setPhase("complete");
          setEnding(finishedAs);
        }}
        onReviewAnswers={() => {
          // The lesson IS finished at this point - reviewing is a way of
          // leaving it, not of abandoning it.
          markComplete();
          setEnding(finishedAs);
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
      ? "We couldn't save that just now - that's on us, not you. Your work is still yours."
      : progress.completionSaved
        ? "Your progress is saved."
        : undefined;

    // Review sessions close on their own variant (37d) - the standard
    // completion screen with only the message swapped, and the message is
    // only what the scheduler confirmed (D40). The frame's "is settling in"
    // and "once more before it fully sticks" go with it: the first claims the
    // movement the heading now waits for, the second a count nothing carries.
    if (review) {
      const copy = reviewCompletionCopy(reviewShown);
      return (
        <LessonComplete
          // Back to where the review was opened from (Olayinka, 14 Oct).
          onDone={() => exitTo(reviewDoneHref)}
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
    /*
     * D142: A PARTIAL COPY'S END IS NOT THE LESSON DONE. It stopped short of
     * its modules, recap and check and is written `exited`, not completed (see
     * `markComplete`), so "That's the lesson done." was untrue. Design's words,
     * 8 Oct, and nothing else: no saved line, since nothing here was completed
     * to save, and no summary, which is the recap this copy lacks.
     */
    if (partial) {
      return (
        <LessonComplete
          onDone={() => exitTo(LESSONS_HREF)}
          heading={PARTIAL_ENDING.heading}
          note={PARTIAL_ENDING.note}
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
        // The catalogue's keys and no others: the break's type (B89, 8 Oct),
        // `trigger`, and how long it lasted. The segment is not among them.
        onStart={() =>
          trackEvent(SIGNAL_EVENT_TYPES.BREAK_START, {
            breakType: breakActive,
            trigger: breakTrigger.current,
          })
        }
        onEnd={(durationMs) =>
          trackEvent(SIGNAL_EVENT_TYPES.BREAK_END, {
            breakType: breakActive,
            trigger: breakTrigger.current,
            durationMs,
          })
        }
        onFeelings={(feelings) =>
          // `response` is the catalogue's key for what the child picked.
          trackEvent(SIGNAL_EVENT_TYPES.FEELING_CHECKIN, { response: feelings })
        }
        onDone={() => {
          setBreakActive(null);
          setObserved((o) => ({ ...o, breaksTaken: o.breaksTaken + 1 }));
          // An offered break returns to the segment it interrupted; a
          // plan-delivered one resumes the advance it intercepted.
          if (breakOrigin.current === "advance") continueAdvance();
        }}
      />
    );
  }

  // Module boundary landing (SCRUM-101) — a full player screen between modules,
  // never a modal. Its one action, Continue, completes the move (D91).
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

  /*
   * §4 `offer_hint`: the unrequested hint, drawn in one place at a time - in
   * the open check with its question (`hintInSheet`), or under the content,
   * or, on the solver, in its step's hint place (17a), passed in.
   */
  const hintCard =
    hintHere && hintText ? (
      <HintOverlay
        hint={hintText}
        onClose={() => setClosedHints((prev) => new Set(prev).add(hintKey))}
        onSeen={() =>
          setSeenHints((prev) =>
            prev.has(hintKey) ? prev : new Set(prev).add(hintKey),
          )
        }
      />
    ) : null;

  return (
    /*
     * ONE SCREEN HIGH, AND ONLY THE COLUMN SCROLLS - the player frame's
     * `flex:1 1 auto;min-height:0;overflow-y:auto` between a pinned top and a
     * pinned arrow row (17c pins it on a chunk longer than the screen). The
     * page scrolled before, so the header went off the top and Next sat below
     * the fold on the first segment. Divided by the text-size zoom, which
     * scales `dvh` too - see globals.css.
     */
    <div className="flex h-[calc(100dvh/var(--nevo-text-zoom,1))] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar: exit + title, then the density toggle (while the text shows).
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

            THE STARTING LEVEL, LAST, AND ONLY ON THE SOLVER (B103, 9 Oct).
            `initialScaffold` is the engine config's "starting level for
            calculation scaffolds", which the client applies - so it shows
            while a calculation is being worked and nothing more specific has
            been said for the segment, and on no other screen. The solver
            draws to the same level (`supportLevel`).
          */}
          <ScaffoldIndicator key={`scaf-${segment.id}`} level={supportLevel} />
        </div>
        {/* THE CONTROL COLUMN (Nevo Lesson Player Frame, 51b9e2a): right
            aligned under the title row, 8px apart - the format group, then
            the depth chips. The dots stay in the row above, beside the title,
            untouched: a different shape in a different place doing a
            different job from the format marker. */}
        {(formatRow || densityRow) && (
          <div className="flex flex-col items-end gap-2">
            {/* The format group, only for a section with two formats or more.
                HELD, UNSEEN, on a section with fewer in a lesson that has a
                group anywhere (`formatsInLesson`), as the chip row is held
                below - not on the solver. Its height is one pill row. */}
            {formatRow && (
              <div
                className={cn("flex justify-end", !showFormats && "invisible")}
                aria-hidden={!showFormats || undefined}
                inert={!showFormats}
              >
                {showFormats ? (
                  <FormatGroup
                    formats={formatsHere}
                    // Mid-switch the pill picked reads selected (frame).
                    current={switchingHere ?? modality}
                    recommended={recommendedHere}
                    onPick={pickFormat}
                    busy={switchingHere !== null}
                  />
                ) : (
                  <div className="h-[52px]" />
                )}
              </div>
            )}
            {/* Frame: the density toggle sits on its own right-aligned row,
                below the formats and only on the text - it reshapes text.
                Absent entirely when the segment has no reshapes to offer,
                rather than an empty pill rail.

                HELD, UNSEEN, WHERE THIS SCREEN HAS NO CHIPS IN A LESSON THAT
                HAS THEM - over a picture or a recording, or on a segment whose
                text offers none (`chipsInLesson`): taking the row away lifted
                the position line and the progress 62px between one segment
                and the next - a change of version is felt, not seen (rule 7).
                Not on the solver: 17a draws no row there, and it needs the
                room. */}
            {densityRow && (
              <div
                className={cn(
                  "flex justify-end",
                  densitySegments.length === 0 && "invisible",
                )}
                aria-hidden={densitySegments.length === 0 || undefined}
                inert={densitySegments.length === 0}
              >
                <AdaptiveToggleBar
                  segments={
                    densitySegments.length > 0
                      ? densitySegments
                      : textChips.length > 0
                        ? textChips
                        : HELD_CHIPS
                  }
                  onSelect={pickDensity}
                />
              </div>
            )}
          </div>
        )}
      </header>

      {/* Two-level position line for modular lessons (SCRUM-101.3) - its own
          full-width row directly above the progress bar (frame: 0 16px 7px).
          It wraps rather than cutting off: at a larger text size a phone
          has no room for "Module 2 of 3 · Segment 1 of 4 in this module",
          and "…in this modu…" told the child nothing.

          THE ROW IS THE FRAME'S LINE BOX (d6b9fbc, measured in its source
          on the 22 Oct on-screen check): the 11px text runs inline in a row
          of the player's own type, every line at `normal` - so the row is
          the 16px line, 27px with its padding, the text sits on its
          baseline, and the bar starts 3px lower than when the text was a
          block of its own on the inherited 1.5. */}
      <div
        className={cn(
          "shrink-0 px-4 pb-[7px] leading-[normal] text-pretty",
          secondaryDim(attentionOn),
        )}
      >
        <span className="font-mono text-[11px] leading-[normal] tracking-[0.02em] text-nevo-near-black/50">
          {positionLine(lesson, index)}
        </span>
      </div>

      {/* Progress line — the bar tracks the whole lesson, continuous across
          module boundaries; the text above carries the module breakdown. */}
      <ProgressBar
        lesson
        value={(index + 1) / total}
        className={cn("shrink-0", secondaryDim(attentionOn))}
        aria-label={positionLine(lesson, index)}
      />

      {/* Calm banner while the device is offline — the cached lesson stays usable */}
      <OfflineBanner />

      {/* Content — centered reading column. Its violet frame went with the
          step-up offer it accompanied (D28). */}
      <div ref={columnRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            // The 88px bottom padding on mobile was sized to clear the Ask Nevo
            // trigger, which is `fixed` and would land on this column. Ask Nevo
            // is no longer mounted over lesson content (IA 31, see
            // `LessonAskNevo`), so it clears nothing now; the last line simply
            // stops well above the chevrons. `sm:p-8` and `lg:p-10` reset it
            // on their own, because their media rules come after the base
            // utility.
            //
            // THE FRAME'S COLUMN IS 620px (tablet) AND 680px (desktop) INSIDE
            // ITS 32px AND 40px SIDE PADDING, not including it (d6b9fbc,
            // measured in its source on the 22 Oct on-screen check): the
            // padding is on the scroll area and the max width on the column
            // in it. So this box is the column plus its padding, 684px and
            // 760px - at 820 wide the text is 620 at x100, at 1280 it is 680
            // at x300 - and below those widths it is the screen less the
            // padding, as the frame's is.
            "mx-auto w-full max-w-full p-6 pb-[88px] sm:max-w-[684px] sm:p-8 lg:max-w-[760px] lg:p-10",
          )}
        >
          {/* The frame's mid-switch cue (51b9e2a): a quiet ring and "One
              moment" above the content, while a format the child picked is
              on its way to the server - the content dims where it is, and
              nothing replaces it. */}
          {switchingHere && (
            <div
              role="status"
              className="mb-[18px] flex items-center justify-center gap-2.5 motion-safe:animate-in motion-safe:fade-in-0"
            >
              <span
                aria-hidden="true"
                className="block size-[18px] rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-[spin_900ms_linear_infinite]"
              />
              <span className="text-sm text-nevo-near-black/60">
                One moment
              </span>
            </div>
          )}
          <div
            className={cn(
              "motion-safe:transition-opacity motion-safe:duration-200",
              switchingHere && "opacity-45",
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
                reading={readingOn}
              />
            )}
            {feedback && <FeedbackStrip message={feedback} />}
            {(handoffHere ||
              (contentHere &&
                action === ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL &&
                guidedPrompts.length > 0)) && (
                <SocraticPanel
                  key={
                    handoffHere
                      ? `handoff-${segment.id}-${handoffHere.run}`
                      : `socratic-${segment.id}`
                  }
                  prompts={handoffHere ? handoffHere.prompts : guidedPrompts}
                  /*
                   * SCRUM-241: TWO WAYS IN, AND THE PANEL IS TOLD WHICH. The
                   * server's hand-off (B94, `handOffFrom`) arrives open and ends
                   * on Keep going, on into the next segment. Otherwise it is
                   * the engine's `show_socratic_panel`, opened by the child from
                   * the confusion prompt, and ends on the way back to the
                   * question - the check, while it is still to pass. One panel
                   * at a time: a hand-off is the one on screen.
                   */
                  entry={handoffHere ? "handoff" : "self"}
                  onTryAgain={
                    !handoffHere &&
                    segment.quickCheck &&
                    !passedChecks.has(segment.id)
                      ? () => setCheckOpen(true)
                      : undefined
                  }
                  /*
                   * Keep going is on the panel from the moment it opens
                   * (SCRUM-275). After a hand-off it goes on, as Next does
                   * there; on a panel the child opened it only closes it.
                   */
                  onKeepGoing={handoffHere ? keepGoingAfterHandoff : undefined}
                  dock={panelDock}
                  onShown={(promptIds) => {
                    // Reached through the panel is not reached first time: a
                    // check answered after it reports as after help (B28).
                    hintedSegments.current.add(segment.id);
                    for (const promptId of promptIds)
                      trackEvent(SIGNAL_EVENT_TYPES.GUIDED_QUESTION_SHOWN, {
                        segmentId: segment.id,
                        promptId,
                      });
                    /*
                     * B74: A RENDERED SOCRATIC PANEL IS AN ADAPTATION APPLIED.
                     * The hand-off's is counted here, once per segment - a
                     * second hand-off on the same segment is the same panel
                     * arriving again. The engine's own panel is counted with
                     * the other applied adaptations, not here.
                     */
                    if (handoffHere && !handoffsApplied.current.has(segment.id)) {
                      handoffsApplied.current.add(segment.id);
                      noteApplied();
                    }
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
               * the line above the progress bar. Once per opening (D148): see
               * `positionSaidOn`.
               */
              tabIndex={-1}
              role="group"
              aria-label={
                positionSaidOn === segment.id
                  ? undefined
                  : positionLine(lesson, index)
              }
              onBlur={(e) => {
                // Focus leaving the group, not moving inside it.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setPositionSaidOn(segment.id);
              }}
              className={cn(
                // The ring is drawn inside the group: the column scrolls now,
                // and clips anything drawn outside what it holds.
                "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-nevo-slide focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nevo-navy",
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
                padDock={padDock}
                supportLevel={supportLevel}
                onSystemScroll={systemScrolled}
                engineHint={
                  hintHere && hintText && !hintInSheet ? hintText : undefined
                }
                onEngineHintClosed={() =>
                  setClosedHints((prev) => new Set(prev).add(hintKey))
                }
                density={effectiveDensity}
                reading={readingOn}
                attention={attentionOn}
                onReadProgress={noteReadProgress}
                onChunkSeen={(chunkId, action) =>
                  trackEvent(SIGNAL_EVENT_TYPES.READING_CHUNK_VIEWED, {
                    segmentId: segment.id,
                    chunkId,
                    action,
                    formFactor: formFactor(),
                  })
                }
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
                onCalcSolved={(solved) => {
                  setSolvedCalcs((prev) => new Set(prev).add(segment.id));
                  // Solving the calculation is the centrepiece interaction of
                  // 17b and emitted NOTHING - the local set was the only trace.
                  trackEvent(SIGNAL_EVENT_TYPES.CALCULATION_COMPLETE, {
                    segmentId: segment.id,
                  });
                  /*
                   * THE SOLVED CALCULATION IS AN ANSWER OF ITS OWN, keyed on the
                   * segment: the one calculation answer support fades on, judged
                   * by the server from the steps' answers beside it - so it goes
                   * after them, once the last step's has landed or been held.
                   */
                  const completion = calculationAttemptFor({
                    segmentId: segment.id,
                    problemId: segment.id,
                    answer: segment.calculation?.answer,
                    responseTimeMs: solved.responseTimeMs,
                  });
                  if (!live || !completion) return;
                  void Promise.allSettled(attemptWrites.current).then(() =>
                    saveAttempt(completion),
                  );
                }}
                onCalcGiven={(given) =>
                  /*
                   * EVERY STEP THE CHILD COMMITS IS WRITTEN, each wrong try its
                   * own answer, for the server to mark: the engine's error
                   * streak - what offers a hint and opens the Socratic panel -
                   * is read from marked answers alone, so a calculation got
                   * wrong could never make support rise (Lydia, 17 Oct). In
                   * addition to the step's signal below, never in the child's
                   * way, and nothing the server says back changes the solver.
                   */
                  saveAttempt(
                    calculationAttemptFor({
                      segmentId: segment.id,
                      problemId: given.stepId,
                      answer: given.answer,
                      responseTimeMs: given.responseTimeMs,
                      hinted: given.hinted,
                    }),
                  )
                }
                onCalcStep={(stepId, correct) => {
                  // The catalogue's keys, exactly: which step, never whether it
                  // was right. Correctness is the server's, on the answer
                  // written above (`onCalcGiven`), and the error streak the
                  // engine reads is taken from those marked answers.
                  trackEvent(SIGNAL_EVENT_TYPES.CALCULATION_STEP_RESPONSE, {
                    segmentId: segment.id,
                    stepId,
                  });
                  noteAnswer(correct);
                }}
                onPiecePlaced={(stepId) =>
                  trackEvent(SIGNAL_EVENT_TYPES.MANIPULATIVE_PIECE_PLACED, {
                    segmentId: segment.id,
                    stepId,
                  })
                }
                // D211's line has done its job once the child acts on the
                // step, and the column wants its room back for the step.
                onCalcAct={() => setHeldNextOn(null)}
                onCalcFailed={(error) => {
                  // Its text from here on, and reported - see `failedCalcs`.
                  // Forward is no longer held for a solve that cannot happen.
                  setFailedCalcs((prev) => new Map(prev).set(segment.id, error));
                  setModality(MODALITY.TEXT);
                  setHeldNextOn(null);
                }}
                onCalcHint={() => {
                  /*
                   * THE HINT A CHILD OPENS WAS SILENT (audit 44). Opening it is
                   * both halves of the catalogue's pair: a hint shown "whether
                   * or not the child asked for one", and one "they had to open"
                   * acted on. The concept rides along where the payload names
                   * one; no hint index, which nothing defines.
                   */
                  const conceptId = segment.calculation?.conceptId;
                  trackEvent(SIGNAL_EVENT_TYPES.HINT_OFFERED, {
                    segmentId: segment.id,
                    ...(conceptId ? { conceptId } : {}),
                  });
                  trackEvent(SIGNAL_EVENT_TYPES.HINT_USED, {
                    segmentId: segment.id,
                    ...(conceptId ? { conceptId } : {}),
                  });
                  // A right answer to this segment's check is `after_hint` now.
                  hintedSegments.current.add(segment.id);
                }}
                onCalcHintShown={(from) => {
                  // B131: as it is drawn. The engine's, once per hint.
                  if (from === "engine") {
                    offerHint(segment.id, hintKey);
                    return;
                  }
                  // A strong level's own hint, shown without being asked for.
                  const conceptId = segment.calculation?.conceptId;
                  trackEvent(SIGNAL_EVENT_TYPES.HINT_OFFERED, {
                    segmentId: segment.id,
                    ...(conceptId ? { conceptId } : {}),
                  });
                  hintedSegments.current.add(segment.id);
                }}
                onCalcHintUsed={(from) => {
                  // B130: the step submitted with it on screen, once a step.
                  const conceptId =
                    from === "step" ? segment.calculation?.conceptId : undefined;
                  trackEvent(SIGNAL_EVENT_TYPES.HINT_USED, {
                    segmentId: segment.id,
                    ...(conceptId ? { conceptId } : {}),
                  });
                }}
              />
            </div>
            {/* §4 `offer_hint`: under the content, while no check is open. */}
            {!calcShowing && !hintInSheet && hintCard}
          </div>
        </div>
      </div>

      {segment.quickCheck && (
        <QuickCheckSheet
          key={`check-${segment.id}`}
          check={segment.quickCheck}
          open={checkOpen}
          onOpenChange={setCheckOpen}
          // The engine's hint for this segment, with its question - see
          // `hintInSheet`.
          hint={hintInSheet ? hintCard : null}
          reading={readingOn}
          onAudioBusy={(phase) => trackBusy(BUSY_REASON.MEDIA_PLAYING, phase)}
          onAnswered={(correct, answered) => {
            const checkpointId = segment.quickCheck?.id;
            // The catalogue's keys, `source` naming a quick check's answer
            // from the after-lesson check's; the pick goes up on the attempt
            // below, where the server marks it - with the time it took as the
            // sheet measured it, and whether a hint was on screen for it (B28),
            // so two instant right taps do not count as learned (Lydia, 17
            // Oct).
            trackEvent(SIGNAL_EVENT_TYPES.COMPREHENSION_RESPONSE, {
              segmentId: segment.id,
              ...(checkpointId ? { questionId: checkpointId } : {}),
              source: "checkpoint",
            });
            saveAttempt(
              answerFor({
                questionId: checkpointId,
                segmentId: segment.id,
                source: "checkpoint",
                choice: segment.quickCheck?.options.find(
                  (o) => o.id === answered.selectedId,
                ),
                responseTimeMs: answered.responseTimeMs,
                hinted: hintedSegments.current.has(segment.id),
              }),
              // B94: the server's answer may hand this child off.
              (stored) => handOffFrom(segment.id, stored),
            );
            if (correct) answeredRight.current.add(segment.id);
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
            // Lydia's words (D185, 13 Oct): about the work, not the child.
            setFeedback("That's it. Here's what's next.");
            advancePastSegment();
          }}
        />
      )}

      <LeaveLessonDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        resumable={live && !review && !finished}
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
          chevrons (frame 38 §3): a row of its own, below the column that
          scrolls, so a long segment still shows it. */}
      {showBreakOffer && (
        <BreakOfferPill
          key={`break-offer-${segment.id}`}
          onShown={() =>
            trackEvent(SIGNAL_EVENT_TYPES.BREAK_SUGGESTED, {
              breakType: breakOffered,
              trigger: offerTrigger,
            })
          }
          onAccept={acceptBreakOffer}
          onDismiss={dismissBreakOffer}
        />
      )}

      {/* Chevron nav — dims under the attention accommodation. Nothing on it
          reacts to a hint: the forward control's glow went with design's
          D124 (6 Oct), "Anything that reacts visibly to a child's difficulty
          tells them they are being watched." */}
      {/* In line with the step above it: the reading column's box, then
          the solver's narrower one. */}
      {nextHeld && (
        <div className="mx-auto w-full max-w-full shrink-0 px-6 pt-2 sm:max-w-[684px] sm:px-8 lg:max-w-[760px] lg:px-10">
          <PressedLine
            reading={readingOn}
            className="mx-auto text-center sm:max-w-[560px] lg:max-w-[600px]"
          >
            {ONE_MORE_BIT}
          </PressedLine>
        </div>
      )}
      {/*
        THE SOCRATIC PANEL OPENS HERE, ABOVE BACK AND NEXT AND NEVER OVER THEM
        (Lydia, SCRUM-275, over the frames' sheet at the foot). A row of this
        column like the pad's dock below: empty, and no height, until the
        panel opens into it. It may shrink and the reading column above it
        has no height of its own to keep, so the panel takes its room from the
        reading - up to its own cap, then scrolling inside - and the arrow row
        stays on screen at every width.
      */}
      <div ref={setPanelDock} data-panel-dock className="flex min-h-0 flex-col" />
      <nav
        aria-hidden={partsLeft || undefined}
        inert={partsLeft}
        className={cn(
          "flex shrink-0 items-center justify-center gap-8 px-3.5 pt-2 pb-6",
          // Over the docked pad the row is not at the screen's foot, so it
          // keeps the arrows and gives its padding to the column above: on
          // a short screen that is the question staying in view.
          "[&:has(+[data-pad-dock]:not(:empty))]:py-0",
          secondaryDim(attentionOn),
          partsLeft && "invisible",
        )}
      >
        <ChevronButton
          dir="prev"
          disabled={index === 0}
          onClick={handlePrev}
        />
        <ChevronButton
          dir="next"
          disabled={false}
          onClick={
            calcBlocking ? () => setHeldNextOn(segment.id) : handleNext
          }
        />
      </nav>

      {/* D150: the calculation pad's tray, last and on the bottom edge, under
          17a's arrows - the column shrinks above it, so nothing hides under
          it. Empty, and no height, whenever no step is typing a number. */}
      <div ref={setPadDock} data-pad-dock className="shrink-0" />
    </div>
  );
}

/** Renders the segment through the active modality. */
function SegmentBody({
  segment,
  modality,
  padDock,
  supportLevel,
  engineHint,
  onEngineHintClosed,
  onSystemScroll,
  density,
  reading,
  attention,
  onReadProgress,
  onChunkSeen,
  onReplay,
  onNarrationPlayed,
  onAudioBusy,
  onMediaFailed,
  onCalcSolved,
  onCalcStep,
  onCalcGiven,
  onPiecePlaced,
  onCalcHint,
  onCalcHintShown,
  onCalcHintUsed,
  onCalcAct,
  onCalcFailed,
}: {
  segment: LessonSegment;
  modality: Modality;
  /** Where the solver docks its number pad - see `CalculationSolver`. */
  padDock: HTMLElement | null;
  /** The level the support dots show, which the solver draws to (B116). */
  supportLevel: ScaffoldLevel | null;
  /** The engine's `offer_hint` text, which the solver shows as its own. */
  engineHint?: string;
  onEngineHintClosed: () => void;
  /** The solver moved the column itself - see `systemScrolled`. */
  onSystemScroll: () => void;
  density: Density | null;
  reading: boolean;
  attention: boolean;
  onReadProgress: (pct: number) => void;
  onChunkSeen: OnChunkSeen;
  onReplay: () => void;
  onNarrationPlayed: () => void;
  onAudioBusy: (phase: BusyPhase) => void;
  /** A picture or recording would not load (B12). */
  onMediaFailed: (channel: "image" | "audio", reason: MediaFailReason) => void;
  onCalcSolved: (solved: { responseTimeMs?: number }) => void;
  onCalcStep: (stepId: string, correct: boolean) => void;
  /** What the child gave on a committed step, for the server to mark. */
  onCalcGiven: (given: StepGiven) => void;
  onPiecePlaced: (stepId: string) => void;
  /** The child opened a calculation step's hint themselves. */
  onCalcHint: () => void;
  /** A hint the child did not ask for came on screen in the solver (B131). */
  onCalcHintShown: (from: "step" | "engine") => void;
  /** A step was submitted with that hint on screen (B130). */
  onCalcHintUsed: (from: "step" | "engine") => void;
  /** The child did something in a calculation step - see `CalculationSolver`. */
  onCalcAct: () => void;
  /** The solver threw while it drew - see `CalculationBoundary`. */
  onCalcFailed: (error: unknown) => void;
}) {
  const text = segment.text ? (
    <TextSegment
      content={segment.text}
      density={density}
      reading={reading}
      attention={attention}
      onReadProgress={onReadProgress}
      onChunkSeen={onChunkSeen}
    />
  ) : null;
  if (modality === MODALITY.TEXT && text) return text;
  if (modality === MODALITY.VISUAL && segment.visual)
    return (
      <VisualSegment
        content={segment.visual}
        reading={reading}
        onMediaFailed={(reason) => onMediaFailed("image", reason)}
      />
    );
  if (modality === MODALITY.AUDIO && segment.audio)
    return (
      <AudioSegment
        content={segment.audio}
        reading={reading}
        onReplay={onReplay}
        onPlayed={onNarrationPlayed}
        onBusy={onAudioBusy}
        onMediaFailed={(reason) => onMediaFailed("audio", reason)}
      />
    );
  if (modality === MODALITY.INTERACTIVE) {
    // A calculation segment routes the Interactive modality to the solver (§8),
    // fenced, so a solver that throws leaves the segment's text, never a
    // blank section or the lesson's error screen (Teslim, 19 Oct).
    if (segment.calculationVariant && segment.calculation)
      return (
        <CalculationBoundary
          key={segment.id}
          fallback={text}
          onFailed={onCalcFailed}
        >
          <CalculationSolver
            calculation={segment.calculation}
            padDock={padDock}
            level={supportLevel}
            engineHint={engineHint}
            onEngineHintClosed={onEngineHintClosed}
            onSystemScroll={onSystemScroll}
            // D30: the same accommodation the text segment and the checks take.
            reading={reading}
            onSolved={onCalcSolved}
            onStepAnswered={onCalcStep}
            onStepGiven={onCalcGiven}
            onPiecePlaced={onPiecePlaced}
            onHintOpened={onCalcHint}
            onHintShown={onCalcHintShown}
            onHintUsed={onCalcHintUsed}
            onAct={onCalcAct}
            // A step's narration is the segment's narration: the same four
            // signals the audio card sends, from the same handlers.
            onReplay={onReplay}
            onNarrationPlayed={onNarrationPlayed}
            onAudioBusy={onAudioBusy}
            onNarrationFailed={(reason) => onMediaFailed("audio", reason)}
          />
        </CalculationBoundary>
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
