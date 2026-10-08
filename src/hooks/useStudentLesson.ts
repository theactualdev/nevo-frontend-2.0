"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { lessonsApi } from "@/lib/api/lessons";
import { getSession, getToken } from "@/lib/auth/session";
import {
  isPartialCopy,
  refreshSavedLesson,
  savedLesson,
} from "@/lib/offline/savedLessons";
import type { AdaptSegment } from "@/lib/api/intelligence";
import type { DashboardProgressRow } from "@/lib/api/students";
import { adaptSegmentsFor } from "@/lib/lessons/adaptation";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import { getMockAdaptation, getMockLesson } from "@/lib/mocks";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { useAccommodationsState } from "./useAccommodations";
import {
  unavailableReason,
  type Unavailable,
} from "@/lib/lessons/availability";
import { useAdaptation } from "./useAdaptation";
import { useHasSession } from "./useHasSession";
import { useHydrated } from "./useHydrated";
import { useStudentDashboard } from "./useStudentDashboard";

/**
 * How long the first frame waits for the engine's opening plan and the child's
 * accommodations before it opens without them. See `openingPending`.
 */
const OPENING_WAIT_MS = 4000;

/**
 * The lesson a student is about to play, live-first.
 *
 * Until now this route resolved MOCK IDS ONLY - a two-entry registry - and
 * called `notFound()` on everything else. That single line is what forced
 * Home to ship its live cards unlinked and left the Lessons tab on fixtures:
 * there was nowhere for a real lesson id to go. So the read comes first here
 * and the mocks become the fallback, not the source.
 *
 * The two authored mock lessons stay reachable by id, because they are the
 * only lessons that exercise the full multi-modal player (visual, audio,
 * interactive, the calculation solver) and the designed walkthrough runs on
 * them. A signed-out visitor gets them directly.
 *
 * `missing` and `failed` are kept apart deliberately. A 404 means the lesson
 * is not there and the child should be told so; anything else means we could
 * not reach it, which is a retry. Rendering one as the other tells a child
 * their lesson was deleted when the network merely blinked.
 *
 * `empty` is its own answer: the lesson exists but carries no segments -
 * still parsing, or a parse that failed. There is nothing to play, and an
 * empty spine is not the way to say that.
 */

/** One lesson's resolved answer, stamped with the id it belongs to. */
interface Resolution {
  id: string | null;
  lesson?: Lesson;
  /**
   * The lesson as the adaptation engine needs to see it, kept from the same
   * response the lesson was built from. The built `Lesson` drops
   * `contentType`, and the engine's segment vocabulary is derived from it -
   * so this cannot be recovered later without re-fetching.
   */
  adaptSegments?: AdaptSegment[];
  missing?: boolean;
  failed?: boolean;
  empty?: boolean;
  /** Built from the child's offline shelf because the read could not be made. */
  fromShelf?: boolean;
  /** That shelf copy lacks what completion needs - see `isPartialCopy`. */
  partial?: boolean;
}

export interface StudentLessonState {
  lesson: Lesson | null;
  /** The lesson came from the backend, so its id is real and writable. */
  live: boolean;
  /**
   * The adaptation overlay - live for a real lesson, authored for a mock.
   *
   * This was mock-only, on the belief that no student-facing plan endpoint
   * existed. `POST /api/intelligence/adapt` is Bearer with no role restriction
   * and answers 200 to a student's own token, checked against the deployed
   * API. Null while it is being fetched, and null if it fails - the player
   * renders its own defaults, which is what it did for every live lesson
   * before this.
   */
  plan: AdaptationPlan | null;
  loading: boolean;
  /** No such lesson. */
  missing: boolean;
  /** It exists as far as we know, but we could not load it. */
  failed: boolean;
  /** It loaded, and there is nothing in it to play. */
  empty: boolean;
  /**
   * The segment to open on, from the student's own saved progress. Null when
   * there is none, or when the lesson is a mock (whose ids nothing records).
   */
  resumeAt: number | null;
  /**
   * The child's newest progress row for this lesson, as the dashboard gave
   * it: where the check was left (B82) and, once completed, the check-in's
   * outcome (B84). Null for a mock, when there is none, and when the
   * dashboard did not answer - never a row made up to stand in for one.
   */
  progressRow: DashboardProgressRow | null;
  /** ISO timestamp of their last activity on this lesson, when we know it. */
  lastWorkedAt: string | null;
  /**
   * The lesson in the adaptation engine's own vocabulary, for the player's
   * mid-lesson `in_lesson` calls. Undefined for a mock, whose ids the engine
   * has never seen.
   */
  adaptSegments: AdaptSegment[] | undefined;
  /**
   * Why this child may not do this lesson right now, or null when they may.
   *
   * A teacher could call a lesson off and the child still opened it, worked
   * through it and had their progress written against it. The assignment row
   * saying so was already in memory - this hook reads the dashboard for the
   * child's saved place - and was simply never consulted.
   *
   * Null for a lesson that was never assigned at all, which is deliberate and
   * is NOT the same as "allowed": it means we have nothing a teacher said
   * about it. See `isOpenToStudent`.
   */
  unavailable: Unavailable | null;
  /** When a `not_yet` lesson opens, for a screen that has to say so. */
  opensAt: string | null;
  /**
   * The dashboard read FAILED, so where this child got to - and whether their
   * teacher has called the lesson off - is not known. Not the same as "no
   * saved place": that is an answer, this is the absence of one.
   *
   * It used to read as the first. The player opened at segment 0 and its very
   * first position write put `in_progress, 0` over the place the child had
   * actually reached, and a cancelled lesson played because nothing said it
   * was cancelled. Only ever true for a live lesson.
   */
  placeUnknown: boolean;
  /** Opened from the child's offline shelf, not from a live read. */
  fromShelf: boolean;
  /**
   * Opened from a shelf copy missing its modules, recap or after-lesson check
   * - a package saved before backend B85 (8 Oct), or one that left any out.
   * The player never records it completed (Lydia, 6 Oct). A package copy that
   * carries all three is not partial, and completes as it would online.
   */
  partial: boolean;
  /**
   * The child has already finished this lesson: their newest progress row
   * says `completed`, or the assignment does (the feed is recent activity, so
   * an old completion may have no row left). The same two facts the Lessons
   * tab reads to file it under Completed.
   *
   * Reopening it played it as new work, and the first frame wrote
   * `in_progress, 0` over the completion - so a child who looked back at a
   * finished lesson found it on Home as unfinished. Design D22, 1 Oct: it
   * opens for review and is never marked unfinished. False for a mock, and
   * whenever the dashboard has not answered.
   */
  finished: boolean;
}

export function useStudentLesson(
  lessonId: string,
  options?: {
    /**
     * Ask the engine to adapt this lesson. Default true.
     *
     * The after-lesson screens read the same lesson but must NOT do this:
     * `useAdaptation` posts `mode: "lesson_load"` to `/api/intelligence/adapt`,
     * and firing it from `/summary` tells the engine the child has just STARTED
     * a lesson they have in fact just finished. That is a fabricated signal
     * about a child's learning, which is the one kind this product must never
     * send.
     *
     * Gating on `live` alone is not enough - a real lesson's summary is live.
     */
    adapt?: boolean;
  },
): StudentLessonState {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  /**
   * THE AUTHORED LESSONS ARE THE SIGNED-OUT WALKTHROUGH, AND NOTHING ELSE.
   *
   * This used to be `getMockLesson(lessonId)` unconditionally, and the flags
   * below read `failed && !mock`. So a SIGNED-IN child whose lesson 404'd or
   * whose read failed was handed the authored photosynthesis lesson of the same
   * id: a rich, multi-modal lesson that does not exist in their school's
   * library, shown at precisely the moment the backend had failed them. The
   * route wrapped it in `SampleRegion`, which is `display: contents` - readable
   * by a test, invisible to the child, their teacher, and anyone watching a
   * demo over their shoulder.
   *
   * A signed-in child gets their school's content or an honest failure. The
   * route already draws both; those branches were simply unreachable while a
   * fixture stood in front of them.
   *
   * Gated on `hydrated` too, because `useHasSession()` is the SERVER's answer
   * (false) until the client runs - so without it a real child would be handed
   * the fixture for one frame on every hard load.
   */
  const mock = hydrated && !signedIn ? getMockLesson(lessonId) : undefined;
  // Where they got to last time. Home already offers this lesson to "Pick up
  // where you left off" off this same row, so the player has to honour it - a
  // Continue button that restarts from the beginning is worse than no Continue
  // button.
  /*
   * `loading` TOO, NOT JUST `data`.
   *
   * A child's saved place lives on the dashboard read, and the lesson read is a
   * SEPARATE request racing it. This used to take only `data`, so whenever the
   * lesson won - which is often, it is the smaller payload - the player mounted
   * with `resumeAt: null`, opened at segment 0, and the position effect
   * immediately wrote `in_progress, segment 0` over the place the child had
   * actually reached.
   *
   * So resuming was a coin toss, and LOSING IT DESTROYED THE EVIDENCE: the
   * saved position was not merely ignored, it was overwritten by the act of
   * ignoring it. A child who stopped at segment seven yesterday could open the
   * lesson today, see segment one, and have their real place gone.
   */
  const {
    data: dashboard,
    loading: dashboardLoading,
    failed: dashboardFailed,
  } = useStudentDashboard();

  // One piece of state, STAMPED WITH THE ID IT DESCRIBES. Resetting four
  // separate flags at the top of the effect would clear them a render late -
  // long enough to show the previous lesson's error under this lesson's
  // title - and is a setState-in-effect besides. Stamping means a stale
  // answer is simply not this lesson's answer, with no reset at all.
  const [resolved, setResolved] = useState<Resolution>({ id: null });
  const state: Resolution = resolved.id === lessonId ? resolved : { id: null };
  const live = state.lesson ?? null;
  const missing = state.missing ?? false;
  const failed = state.failed ?? false;
  const empty = state.empty ?? false;

  useEffect(() => {
    // Signed out there is no token to read with, and the mock is the whole
    // designed experience anyway.
    if (!getToken()) return;
    let cancelled = false;

    // ONE REQUEST. Modules ride the detail response - see
    // `LessonDetailResponse.modules`, checked against the deployed spec. This
    // used to make a second call to a different route for a field the first
    // response already carried, on every lesson open. Absent still means
    // ungrouped, which is exactly what that call's failure meant.
    void lessonsApi
      .detail(lessonId)
      .then((res) => {
        if (cancelled) return;
        // A lesson the child saved for offline is kept as fresh as their last
        // online open. Only ever one they chose to save.
        const owner = getSession()?.userId;
        if (owner) refreshSavedLesson(owner, res);
        const built = lessonFromContent(res, res.modules ?? []);
        setResolved(
          built
            ? {
                id: lessonId,
                lesson: built,
                adaptSegments: adaptSegmentsFor(res.segments),
              }
            : { id: lessonId, empty: true },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 404 IS MISSING, whatever the mock registry holds. This used to
        // check `getMockLesson` and stay silent when one existed, on the
        // reasoning that "the mock answers it" - but this effect only runs for
        // a signed-in child (it returns early without a token), and a signed-in
        // child is exactly who must not be answered with a fixture. Left as it
        // was, the gating above turned the old silent substitution into a
        // permanent loading skeleton, which is a quieter way of never telling
        // them.
        if (err instanceof ApiError && err.status === 404) {
          setResolved({ id: lessonId, missing: true });
          return;
        }
        /*
         * NO CONNECTION, BUT THE CHILD SAVED IT. The lesson they kept when
         * they saved it, through the same builder - so it opens exactly as it
         * would online. Only this child's shelf, and never for a 404: a lesson
         * the school removed stays removed.
         */
        const owner = getSession()?.userId;
        const kept = owner ? savedLesson(owner, lessonId) : null;
        const fromShelf = kept
          ? lessonFromContent(kept.detail, kept.detail.modules ?? [])
          : null;
        if (kept && fromShelf) {
          setResolved({
            id: lessonId,
            lesson: fromShelf,
            adaptSegments: adaptSegmentsFor(kept.detail.segments),
            fromShelf: true,
            partial: isPartialCopy(kept.detail),
          });
        } else {
          setResolved({ id: lessonId, failed: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  // `?? null` because `mock` is now undefined for a signed-in child, and the
  // contract above promises `Lesson | null`.
  const lesson = live ?? mock ?? null;

  // Only for a live lesson: a mock's ids mean nothing to the engine, and its
  // authored plan is richer than anything `lesson_load` returns.
  const adaptation = useAdaptation(
    live && options?.adapt !== false ? lessonId : undefined,
    // `state`, not `resolved`: the id stamp is what keeps a previous lesson's
    // answer from being read as this one's, and the segments must come through
    // the same gate as the lesson they belong to.
    state.adaptSegments,
    live ?? null,
  );

  // Cross-session and slow-moving, so it does not belong on the per-lesson
  // adapt call - and could not ride on it anyway, since that route carries no
  // accommodation field.
  const { active: accommodations, settled: accommodationsSettled } =
    useAccommodationsState();

  /*
   * THE FIRST FRAME WAITS FOR WHAT SHAPES IT.
   *
   * Loading waited for the lesson and the dashboard only. The engine's
   * opening plan and the child's accommodations arrived after the first
   * segment was already showing, so a reading or attention accommodation
   * reshaped a visible screen (rules 6 and 7) - and the first segment's
   * starting modality, read once when the player mounts, was lost for good.
   *
   * CAPPED, because the client has no request timeout and a lesson that never
   * opens is worse than one that adapts a moment late. Whatever has not
   * answered by then is applied when it does.
   */
  const adaptWanted = Boolean(live) && options?.adapt !== false;
  const planSettled =
    !adaptWanted || adaptation.plan !== null || adaptation.error !== null;
  const [waitedOutFor, setWaitedOutFor] = useState<string | null>(null);
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => setWaitedOutFor(lessonId), OPENING_WAIT_MS);
    return () => clearTimeout(t);
  }, [live, lessonId]);
  const openingPending =
    Boolean(live) &&
    !(planSettled && accommodationsSettled) &&
    waitedOutFor !== lessonId;

  // `segmentPosition` is the 0-based index we wrote ourselves, so it round
  // trips - but it is clamped anyway, because a position past the end would
  // open an empty spine, and a lesson re-parsed with fewer segments is exactly
  // how that happens.
  // Newest row for this lesson, whatever its status - recency is about when
  // they last touched it, which a completed row answers just as well.
  const saved = dashboard?.recentProgress
    .filter((r) => r.lessonId === lessonId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  // `exited` resumes too. The status records HOW a child left, not whether
  // they are done, and #217 already made Home show exited lessons on Pick
  // Back Up - so leaving this on `in_progress` alone produced a card reading
  // "About halfway in" that then opened the lesson at segment one. The same
  // half-fix twice: the display was corrected and the resume was not.
  const resumable =
    saved?.status === "in_progress" || saved?.status === "exited";
  const resumeAt =
    live && saved && resumable
      ? Math.max(0, Math.min(saved.segmentPosition, live.segments.length - 1))
      : null;

  /*
   * THE ASSIGNMENT FOR THIS LESSON, WHICH WAS IN MEMORY AND NEVER READ.
   *
   * Only for a LIVE lesson: the two authored walkthrough lessons have invented
   * ids that no assignment can match, and a signed-out visitor has no teacher
   * to have been assigned anything by.
   *
   * A lesson with no matching assignment yields null - not blocked. A child can
   * still open any id their school's library holds, exactly as before; this
   * acts only on what a teacher explicitly said about a lesson they set.
   */
  const assignment = live
    ? // `?.` on the array as well as the object: `assignments` is required on
      // the contract, but a response that arrives without it must not take a
      // child's lesson down with a TypeError. Absent reads as "nothing a
      // teacher said", which is the same as an unassigned lesson.
      dashboard?.assignments?.find((a) => a.lesson.id === lessonId)
    : undefined;
  const unavailable = assignment ? unavailableReason(assignment) : null;
  const finished =
    Boolean(live) &&
    (saved?.status === "completed" || assignment?.status === "completed");

  return {
    finished,
    lesson,
    live: Boolean(live),
    resumeAt,
    progressRow: live ? (saved ?? null) : null,
    lastWorkedAt: saved?.updatedAt ?? null,
    adaptSegments: live ? state.adaptSegments : undefined,
    unavailable,
    opensAt: assignment?.availableFrom ?? null,
    placeUnknown: Boolean(live) && !dashboard && dashboardFailed,
    fromShelf: Boolean(live) && state.fromShelf === true,
    partial:
      Boolean(live) && state.fromShelf === true && state.partial === true,
    // A live lesson gets the engine's plan; a mock keeps its authored one.
    // Never crossed: a mock must not borrow a live plan, and a live lesson
    // must not borrow another lesson's authored one.
    // Never crossed, and never invented: an authored plan belongs to an
    // authored lesson, which only a signed-out visitor now sees.
    //
    // The child's accommodations ride on the LIVE plan only, and only once the
    // read has answered. The adapt route carries no accommodation field, so
    // without this the field was undefined for every signed-in child while the
    // teacher's screen listed the same accommodations as active. A mock keeps
    // the authored flags it was written with - the walkthrough is a designed
    // demonstration, not a claim about anybody.
    plan: live
      ? accommodations
        ? /*
           * NOT DROPPED WHEN THE ADAPT CALL FAILS. They merged only onto a
           * non-null plan, so an engine that did not answer took a delivered
           * accommodation away for the whole lesson - while the teacher's
           * screen showed it active. They come from a different route; the
           * plan they ride on can be empty.
           */
          { ...(adaptation.plan ?? { lessonId, segments: [] }), accommodations }
        : adaptation.plan
      : mock
        ? (getMockAdaptation(lessonId) ?? null)
        : null,
    /*
     * Waiting for the dashboard as well as the lesson. Both feed the first
     * frame the player draws - the lesson is what it shows, the dashboard is
     * WHERE it opens - so rendering on the first of them to arrive is what made
     * the resume a race. The cost is `max(a, b)` rather than the faster of the
     * two; both fire on the same tick, so it is not `a + b`.
     *
     * Only for a live lesson: the authored walkthrough has no saved place to
     * wait for, and a signed-out visitor never reads the dashboard at all.
     */
    loading:
      signedIn &&
      ((!lesson && !missing && !failed && !empty) ||
        (Boolean(live) && dashboardLoading) ||
        openingPending),
    // `!mock` still stands, but it can now only be true for a signed-out
    // visitor - who makes no read at all, so none of these are ever set for
    // them anyway. For a signed-in child these are simply the truth.
    missing: missing && !mock,
    failed: failed && !mock,
    empty: empty && !mock,
  };
}
