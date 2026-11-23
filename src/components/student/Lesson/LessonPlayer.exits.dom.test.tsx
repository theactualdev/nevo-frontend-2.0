import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { GIVES_WAY_AFTER_MS } from "./QuickCheckSheet";
import { LESSON_STATUS } from "@/lib/api/lessons";
import { SAVING_LESSON_LINE, SLOW_MARK_MS } from "@/lib/lessons/verdict";
import { clearSession, setSession } from "@/lib/auth/session";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * How a child leaves a lesson, and what they are told on the way out.
 *
 * Each of these was a small lie or a wrong door: "Leave for now" went to
 * Lessons where the IA sends a child Home; the leave dialog and the
 * completion screen said "Your progress is saved" whether or not anything had
 * landed; the completion button had become "Back to home" where the frame
 * says "Back to lessons"; a child who stopped at a module boundary resumed in
 * the module they had finished; an unknown place was written over the real
 * one; and a review's outcome never reached the scheduler.
 *
 * Since 6 Oct: the leave dialog never says the latest place is saved, only
 * that the child picks up from the last point that was (D88); a module
 * boundary offers no break (D91); and a lesson played from a saved copy
 * missing its modules, recap or check is never written completed (Lydia).
 */

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  sessionId: null as string | null,
  completionSaved: false,
  completionFailed: false,
}));
/** The review's own sitting, once the server has opened one. */
const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progress }),
}));

const { push, trackEvent, recordReview, signals } = vi.hoisted(() => ({
  push: vi.fn(),
  trackEvent: vi.fn(),
  recordReview: vi.fn(),
  /** How the player last told the signal session it ended. */
  signals: { ending: null as unknown },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    signals.ending = args[3];
    return { trackEvent };
  },
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({
  useAssignmentNote: () => null,
}));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: (...a: unknown[]) => recordReview(...a) },
}));
// A live review's answers go up as it is played; nothing here reads them.
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: { ...actual.lessonsApi, saveAttempt: vi.fn().mockResolvedValue({}) },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const segment = (id: string, heading: string, extra = {}) => ({
  id,
  modalities: ["text"] as const,
  text: { heading, body: { default: `Body of ${heading}.` } },
  ...extra,
});

const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [
    segment("seg-1", "Numerators"),
    segment("seg-2", "Denominators"),
    segment("seg-3", "Equivalence"),
  ],
} as unknown as Lesson;

/** Two modules: the boundary sits between seg-2 and seg-3. */
const MODULAR = {
  ...LESSON,
  modules: [
    { id: "m-1", title: "Introduction", segmentIds: ["seg-1", "seg-2"] },
    { id: "m-2", title: "Practice", segmentIds: ["seg-3"] },
  ],
} as unknown as Lesson;

/**
 * Asked again as a child is now (26 Oct): the miss holds a beat and the
 * sheet gives way, then Next opens the check afresh. No Try again any more.
 */
const askAgain = async () => {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
    timeout: GIVES_WAY_AFTER_MS + 2000,
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const writes = () => progress.report.mock.calls;

beforeEach(() => {
  progress.report.mockReset();
  progress.sessionId = null;
  progress.completionSaved = false;
  progress.completionFailed = false;
  push.mockReset();
  trackEvent.mockReset();
  recordReview.mockReset().mockResolvedValue({});
  signals.ending = null;
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("leaving part way", () => {
  it("goes Home, where the IA sends 'Leave for now'", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });

  const LAST_SAVED = "You'll pick up from the last point that was saved.";

  it("never says the latest place is saved (D88)", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(screen.queryByText(/progress is saved/i)).toBeNull();
    expect(screen.queryByText(/pick up where you left off/i)).toBeNull();
    // Nor the frame's "right where you are" (7 Nov), which is the same claim.
    expect(screen.queryByText(/right where you are/i)).toBeNull();
    // The frame's heading, and what is true whatever has landed: the last
    // point that did is where they come back to.
    expect(
      screen.getByRole("heading", { name: "Leaving for now?" }),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      `${LAST_SAVED} Stepping away and coming back later is a good thing to do.`,
    );
    // And the frame's three choices, in its order (17d S7).
    expect(
      screen
        .getAllByRole("button")
        .filter((b) => b.closest("[role='dialog']"))
        .map((b) => b.textContent),
    ).toEqual(["Keep learning", "Take a break", "Leave for now"]);
  });

  it("takes the child's own break from the dialog, and comes back to the same part (17d S7)", async () => {
    vi.useFakeTimers();
    try {
      render(<LessonPlayer lesson={LESSON} plan={null} live />);
      next();
      expect(screen.getByText("Body of Denominators.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

      fireEvent.click(screen.getByRole("button", { name: "Take a break" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("Take a breath")).toBeTruthy();
      expect(trackEvent).toHaveBeenCalledWith(
        "break_start",
        expect.objectContaining({ breakType: "micro", trigger: "student_request" }),
      );
      // Not a leave: nothing written as exited, nobody sent anywhere.
      expect(push).not.toHaveBeenCalled();
      expect(writes().map(([s]) => s)).not.toContain(LESSON_STATUS.EXITED);

      await act(async () => {
        vi.advanceTimersByTime(8_100);
      });

      expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["the signed-out walkthrough", {}],
    ["a review", { live: true, review: true }],
    ["a finished lesson reopened", { live: true, finished: true }],
  ])("says nothing about a saved place on %s, which writes none", (_, over) => {
    render(<LessonPlayer lesson={LESSON} plan={null} {...over} />);
    if ("review" in over)
      fireEvent.click(screen.getByRole("button", { name: /begin|start|ready/i }));

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(screen.queryByText(new RegExp(LAST_SAVED))).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Leaving for now?" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave for now" })).toBeTruthy();
  });
});

describe("finishing", () => {
  const finish = () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    next();
    next();
    next();
  };

  it("offers 'Back to lessons', as the frame draws it, and goes there", () => {
    finish();

    fireEvent.click(screen.getByRole("button", { name: "Back to lessons" }));

    expect(push).toHaveBeenCalledWith("/student/lessons");
    expect(screen.queryByRole("button", { name: /back to home/i })).toBeNull();
  });

  it("does not say progress is saved while the completion is in flight", () => {
    finish();

    expect(screen.queryByText(/progress is saved/i)).toBeNull();
  });

  it("says it once the completion has landed", () => {
    progress.completionSaved = true;
    finish();

    expect(screen.getByText("Your progress is saved.")).toBeTruthy();
  });

  /*
   * LYDIA'S END-OF-LESSON WAIT (10 and 11 Nov): a live lesson whose
   * completion write is still on its way says so past about two seconds -
   * and a lesson that writes nothing never does.
   */
  describe("while the completion is on its way", () => {
    afterEach(() => vi.useRealTimers());
    const waitOut = () =>
      act(() => {
        vi.advanceTimersByTime(SLOW_MARK_MS);
      });

    it("says her line past two seconds, for a live lesson", () => {
      vi.useFakeTimers();
      render(<LessonPlayer lesson={LESSON} plan={null} live />);
      next();
      next();
      next();
      expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();

      waitOut();

      expect(screen.getByText(SAVING_LESSON_LINE)).toBeTruthy();
      expect(screen.queryByText(/progress is saved/i)).toBeNull();
    });

    it("never says it for the walkthrough, which writes nothing", () => {
      vi.useFakeTimers();
      finish();

      waitOut();

      expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();
    });

    it("never says it for a partial copy, which writes no completion", () => {
      vi.useFakeTimers();
      render(<LessonPlayer lesson={LESSON} plan={null} live partial />);
      next();
      next();
      next();

      waitOut();

      expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();
    });

    it("says the save failed, not that it is saving, when the write did not reach Nevo", () => {
      vi.useFakeTimers();
      progress.completionFailed = true;
      render(<LessonPlayer lesson={LESSON} plan={null} live />);
      next();
      next();
      next();

      waitOut();

      expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();
      expect(screen.getByText(/We couldn.t save that just now/)).toBeTruthy();
    });
  });
});

describe("a review opened from Subject Detail", () => {
  /*
   * Olayinka, 14 Oct: back returns to where you came from, and in the student
   * console that applies ONLY to the review session - no frame names where it
   * ends. Ordinary lessons keep IA 31's destinations, and so does the review's
   * own in-session "Leave for now".
   */
  const FROM = "/student/progress/maths";
  const begin = () =>
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
  const toDone = () => {
    begin();
    next();
    next();
    next();
  };

  it("goes back there when it is left before it begins", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={null} live review reviewBack={FROM} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

    expect(push).toHaveBeenCalledWith(FROM);
    expect(push).toHaveBeenCalledTimes(1);
    // What leaving the entry already recorded, unchanged: left at the top, and
    // nothing written against the lesson.
    expect(signals.ending).toEqual({
      completionStatus: "exited",
      exitPosition: "seg-1",
    });
    expect(writes()).toEqual([]);
  });

  it("goes back there when it is done", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={null} live review reviewBack={FROM} />,
    );
    toDone();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(push).toHaveBeenCalledWith(FROM);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("goes Home from both when it was not said where it was opened from", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live review />);
    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));
    expect(push).toHaveBeenLastCalledWith("/student/dashboard");
    cleanup();

    render(<LessonPlayer lesson={LESSON} plan={null} live review />);
    toDone();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(push).toHaveBeenLastCalledWith("/student/dashboard");
  });

  it("still goes Home from 'Leave for now' part way, as IA 31 sends every lesson", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={null} live review reviewBack={FROM} />,
    );
    begin();

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(push).toHaveBeenCalledWith("/student/dashboard");
    expect(push).not.toHaveBeenCalledWith(FROM);
  });

  it("is not where an ordinary lesson goes, even if it were handed one", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} reviewBack={FROM} />);
    next();
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: "Back to lessons" }));

    expect(push).toHaveBeenCalledWith("/student/lessons");
    expect(push).not.toHaveBeenCalledWith(FROM);
  });
});

describe("a lesson played from a partial saved copy", () => {
  /*
   * Lydia, 6 Oct: a lesson played without its modules, recap and after-lesson
   * check "is not recorded as completed, and it comes back when the child is
   * next online". A copy saved before B85 (8 Oct) carries none of the three.
   */
  const playThrough = (over: Record<string, unknown> = {}) => {
    render(<LessonPlayer lesson={LESSON} plan={null} live {...over} />);
    next();
    next();
    next();
  };

  it("is never written completed, and ends exited at its furthest place", () => {
    playThrough({ partial: true });

    expect(writes().map(([status]) => status)).not.toContain(
      LESSON_STATUS.COMPLETED,
    );
    expect(writes().at(-1)).toEqual([LESSON_STATUS.EXITED, { segment: 2 }]);
  });

  it("tells the signal session it was left there, not completed", () => {
    playThrough({ partial: true });

    expect(signals.ending).toEqual({
      completionStatus: "exited",
      exitPosition: "seg-3",
    });
  });

  it("does not say the lesson is done (D142)", () => {
    // Nor that anything was saved, whatever the hook reports: nothing was
    // completed to save.
    progress.completionSaved = true;
    playThrough({ partial: true });

    expect(
      screen.getByRole("heading", {
        name: "That's as far as this one goes for now.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("We'll pick up the rest when you're back online."),
    ).toBeTruthy();
    expect(screen.queryByText(/lesson done/i)).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
  });

  it("still says the whole lesson is done", () => {
    // Without this, a screen that never said "done" passes the above.
    playThrough();

    expect(
      screen.getByRole("heading", { name: "That's the lesson done." }),
    ).toBeTruthy();
    expect(screen.queryByText(/as far as this one goes/)).toBeNull();
  });

  it("writes nothing at all for a finished lesson reopened from it", () => {
    // Finished stays finished; a partial copy cannot complete it again either.
    playThrough({ partial: true, finished: true });

    expect(writes()).toEqual([]);
  });

  it("is still written completed when it is the whole lesson", () => {
    // Without this, a player that never wrote completion passes the above.
    playThrough();

    expect(writes().at(-1)).toEqual([LESSON_STATUS.COMPLETED, { segment: 2 }]);
    expect(signals.ending).toEqual({ completionStatus: "completed" });
  });
});

describe("a place that could not be read", () => {
  it("is not written over by the segment the lesson opened on", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} placeUnknown />);

    expect(writes()).toEqual([]);
  });

  it("is written once the child actually moves", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} placeUnknown />);

    next();

    expect(writes().at(-1)).toEqual([
      LESSON_STATUS.IN_PROGRESS,
      { segment: 1 },
    ]);
  });

  it("is still written on open when it was known", () => {
    // Without this, a guard that wrote nothing at all would pass both above.
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(writes()[0]?.[0]).toBe(LESSON_STATUS.IN_PROGRESS);
  });
});

describe("a module boundary", () => {
  const toBoundary = () => {
    render(<LessonPlayer lesson={MODULAR} plan={null} />);
    next();
    next();
    expect(screen.getByText("Stage 1 of 2 done")).toBeTruthy();
  };

  it("writes the place it opens onto, so leaving here resumes in the next module", () => {
    toBoundary();

    expect(writes().at(-1)).toEqual([
      LESSON_STATUS.IN_PROGRESS,
      { segment: 2, module: 1 },
    ]);
  });

  it("offers no break on top of the boundary (D91), and continues into the next module", () => {
    toBoundary();

    expect(screen.queryByRole("button", { name: /break/i })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Yes, continue" }));

    expect(trackEvent).not.toHaveBeenCalledWith(
      "break_start",
      expect.anything(),
    );
    // One count over the whole lesson (Lydia, 11 Nov addendum).
    expect(screen.getByRole("group", { name: "Part 3 of 3" })).toBeTruthy();
    expect(screen.getByText("Equivalence")).toBeTruthy();
  });
});

describe("a review session's outcome", () => {
  const REVIEW = {
    ...LESSON,
    segments: [
      segment("seg-1", "Numerators", {
        quickCheck: {
          question: "Which number is on top?",
          options: [
            { id: "a", label: "The numerator" },
            { id: "b", label: "The denominator" },
          ],
          correctId: "a",
          correctNote: "Yes.",
          recoveryNote: "Not quite.",
          conceptId: "concept-1",
          // Reviewed: wrong then right is a check that holds.
          holds: true,
        },
      }),
      segment("seg-2", "Denominators"),
    ],
  } as unknown as Lesson;

  it("is sent from the inline checks, which are all a review has", async () => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "stu-1",
      role: "student",
    });
    // Live, with a sitting whose completion has landed: the scheduler is
    // told only then, naming it (Teslim, 19 Oct).
    progress.sessionId = SESSION;
    progress.completionSaved = true;
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /begin|start|ready/i }));

    // Wrong first, then right - what happened is reported, not a final pass.
    next();
    fireEvent.click(
      await screen.findByRole("button", { name: /The denominator/ }),
    );
    await askAgain();
    fireEvent.click(screen.getByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    next();

    // B28: the outcome, and no `recallSuccessful` - the server derives that.
    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        outcome: "second_attempt",
        sessionId: SESSION,
      }),
    );
  });

  it("does not count a check reached through the guided questions as first time", async () => {
    // SCRUM-241: "a concept reached through the panel is never recorded as
    // mastered first time". Right on the first pick, after the panel: help
    // was on screen, so it is reported as after a hint.
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "stu-1",
      role: "student",
    });
    const guided = {
      lessonId: "frac-3",
      segments: [],
      adjustment: "show_socratic_panel",
      guidedQuestions: ["Which number counts the parts?"],
    } as AdaptationPlan;
    progress.sessionId = SESSION;
    progress.completionSaved = true;
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={guided}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /begin|start|ready/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Which part is unclear?" }),
    );

    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    next();

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "after_hint" }),
      ),
    );
  });
});

/**
 * L14 (Lydia, 19 Nov): A SAVED LESSON WITHDRAWN FOR SAFETY WHILE OPEN. The
 * child finishes the part they are in, and the lesson closes after it - "not
 * mid-segment, and not run to the end". The 12 Nov rule (held content is
 * revoked before any further content is read) never reached the download
 * path; this is it reaching it.
 */
describe("a saved lesson withdrawn for safety while open", () => {
  const ENDING = "That's the end of this one for now.";
  const NOTE = "Your teacher is having another look at it.";

  /** On the second part when the connection's check withdraws the copy. */
  const withdrawnOnSecond = () => {
    const view = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    view.rerender(<LessonPlayer lesson={LESSON} plan={null} live withdrawn />);
    return view;
  };

  it("leaves the child in the part they are in", () => {
    withdrawnOnSecond();

    expect(screen.getByRole("heading", { name: "Denominators" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: ENDING })).toBeNull();
  });

  it("closes after it, in Lydia's words, reading no further part", () => {
    withdrawnOnSecond();
    next();

    expect(screen.getByRole("heading", { name: ENDING })).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Equivalence" })).toBeNull();
    expect(screen.queryByText(/lesson done/i)).toBeNull();
  });

  it("is written as left at the part finished, never completed", () => {
    withdrawnOnSecond();
    next();

    expect(writes().map(([status]) => status)).not.toContain(
      LESSON_STATUS.COMPLETED,
    );
    expect(writes().at(-1)).toEqual([LESSON_STATUS.EXITED, { segment: 1 }]);
    expect(signals.ending).toEqual({
      completionStatus: "exited",
      exitPosition: "seg-2",
    });
  });

  it("closes on a move back as well: no other part is read", () => {
    withdrawnOnSecond();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(screen.getByRole("heading", { name: ENDING })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Numerators" })).toBeNull();
  });

  it("closes from the last part instead of opening the after-lesson check", () => {
    const view = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    next();
    view.rerender(<LessonPlayer lesson={LESSON} plan={null} live withdrawn />);
    next();

    expect(screen.getByRole("heading", { name: ENDING })).toBeTruthy();
    expect(writes().at(-1)).toEqual([LESSON_STATUS.EXITED, { segment: 2 }]);
  });

  it("goes back to Lessons from its one button", () => {
    withdrawnOnSecond();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back to lessons" }));

    expect(push).toHaveBeenCalledWith("/student/lessons");
  });
});
