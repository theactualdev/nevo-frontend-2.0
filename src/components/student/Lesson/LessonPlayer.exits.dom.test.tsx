import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { LESSON_STATUS } from "@/lib/api/lessons";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * How a child leaves a lesson, and what they are told on the way out.
 *
 * Each of these was a small lie or a wrong door: "Leave for now" went to
 * Lessons where the IA sends a child Home; the leave dialog and the
 * completion screen said "Your progress is saved" whether or not anything had
 * landed; the completion button had become "Back to home" where the frame
 * says "Back to lessons"; a child who stopped at a module boundary resumed in
 * the module they had finished; "Take a break first" rested in place instead
 * of taking the break; an unknown place was written over the real one; and a
 * review's outcome never reached the scheduler.
 */

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  positionSaved: false,
  completionSaved: false,
  completionFailed: false,
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, ...progress }),
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

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const writes = () => progress.report.mock.calls;

beforeEach(() => {
  progress.report.mockReset();
  progress.positionSaved = false;
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

  it.each([false, true])(
    "never says the latest place is saved (D88), landed: %s",
    (landed) => {
      progress.positionSaved = landed;
      render(<LessonPlayer lesson={LESSON} plan={null} live />);

      fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

      expect(screen.queryByText(/progress is saved/i)).toBeNull();
      expect(screen.queryByText(/pick up where you left off/i)).toBeNull();
      // What is true either way: the last point that landed is where they
      // come back to.
      expect(screen.getByRole("heading", { name: LAST_SAVED })).toBeTruthy();
      // And the two choices, exactly as they were.
      expect(screen.getByRole("button", { name: "Keep learning" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Leave for now" })).toBeTruthy();
    },
  );

  it.each([
    ["the signed-out walkthrough", {}],
    ["a review", { live: true, review: true }],
    ["a finished lesson reopened", { live: true, finished: true }],
  ])("says nothing about a saved place on %s, which writes none", (_, over) => {
    render(<LessonPlayer lesson={LESSON} plan={null} {...over} />);
    if ("review" in over)
      fireEvent.click(screen.getByRole("button", { name: /begin|start|ready/i }));

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(screen.queryByText(LAST_SAVED)).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
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
});

describe("a lesson played from the offline package's copy", () => {
  /*
   * Lydia, 6 Oct: a lesson played without its modules, recap and after-lesson
   * check "is not recorded as completed, and it comes back when the child is
   * next online". The package carries none of the three.
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

  it("writes nothing at all for a finished lesson reopened from it", () => {
    // Finished stays finished; the package cannot complete it again either.
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
    expect(screen.getByText("Section complete")).toBeTruthy();
  };

  it("writes the place it opens onto, so leaving here resumes in the next module", () => {
    toBoundary();

    expect(writes().at(-1)).toEqual([
      LESSON_STATUS.IN_PROGRESS,
      { segment: 2, module: 1 },
    ]);
  });

  it("sends 'Take a break first' to the break module and back into the next module", () => {
    toBoundary();

    fireEvent.click(screen.getByRole("button", { name: "Take a break first" }));

    // The break module, not a rest state on the boundary.
    expect(screen.queryByText("Section complete")).toBeNull();
    expect(screen.queryByText("Take your time")).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith(
      "break_start",
      expect.objectContaining({ trigger: "module_boundary" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /I.m back/i }));

    expect(screen.getByRole("group", { name: /Module 2 of 2/ })).toBeTruthy();
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
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /begin|start|ready/i }));

    // Wrong first, then right - what happened is reported, not a final pass.
    next();
    fireEvent.click(
      await screen.findByRole("button", { name: /The denominator/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();

    // B28: the outcome, and no `recallSuccessful` - the server derives that.
    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        outcome: "second_attempt",
      }),
    );
  });
});
