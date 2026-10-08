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
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { loadCheckOutcome, loadReviewAnswers } from "./reviewStore";

/**
 * The checks and the review, as the player wires them on 1 Oct.
 *
 * D36  A child may leave the after-lesson check, or a review before it
 *      starts. Leaving records "not completed", never "failed", with the
 *      answers already given kept - which means every answer is now stored
 *      on the account as it is given.
 * D40  The review's completion says only what the scheduler confirmed.
 *      "You strengthened this concept" showed whatever happened.
 * B28  The review reports what happened (`outcome`), not a verdict.
 * D30  The reading accommodation reaches the checks, not only the segments.
 * B49  A check left part way reopens where it was left, the same day.
 * B26  "From the check-in" is the server's, from the completion write.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  sessionId: null as string | null,
  completionSaved: false,
  completionFailed: false,
  /** The newest progress write's answer - see `useLessonProgress.saved`. */
  saved: null as unknown,
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progress }),
}));

const { push, trackEvent, recordReview, saveAttempt, attempts, endings } =
  vi.hoisted(() => ({
    push: vi.fn(),
    trackEvent: vi.fn(),
    recordReview: vi.fn(),
    saveAttempt: vi.fn(),
    attempts: vi.fn(),
    /** How the signal session was said to end, render by render. */
    endings: [] as unknown[],
  }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    endings.push(args[3]);
    return { trackEvent };
  },
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({
  useAssignmentNote: () => null,
}));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: (...a: unknown[]) => recordReview(...a) },
}));
vi.mock("@/lib/api/scaffolds", () => ({
  scaffoldsApi: { attempt: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: (...a: unknown[]) => saveAttempt(...a),
      attempts: (...a: unknown[]) => attempts(...a),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const QUICK_CHECK = {
  id: "cp-inline",
  question: "Which number is on top?",
  options: [
    { id: "a", label: "The numerator", value: "a" },
    { id: "b", label: "The denominator", value: "b" },
  ],
  correctId: "a",
  correctNote: "Yes.",
  recoveryNote: "Not quite.",
  conceptId: "concept-1",
};

const question = (n: number) => ({
  id: `cp-${n}`,
  prompt: `Question ${n}?`,
  options: [
    { id: "2", label: "Two", value: 2 },
    { id: "3", label: "Three", value: 3 },
  ],
  correctId: "2",
});

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    { id: SEG_1, ...text("Numerators"), quickCheck: QUICK_CHECK },
    { id: SEG_2, ...text("Denominators") },
  ],
  assessment: { questions: [question(1), question(2)] },
} as unknown as Lesson;

const REVIEW = {
  ...LESSON,
  assessment: undefined,
} as unknown as Lesson;

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const statuses = () => progress.report.mock.calls.map((c) => c[0]);
const leave = () =>
  fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

/** Pass the inline check first time, then reach the after-lesson check. */
const toAssessment = async () => {
  next();
  fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
  fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
  next();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
};

/** Confirm an answer on the after-lesson check. */
const answer = (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });

beforeEach(() => {
  progress.report.mockReset();
  progress.sessionId = SESSION;
  progress.completionSaved = false;
  progress.completionFailed = false;
  progress.saved = null;
  attempts.mockReset().mockResolvedValue([]);
  window.sessionStorage.clear();
  push.mockReset();
  trackEvent.mockReset();
  recordReview.mockReset().mockResolvedValue({});
  saveAttempt.mockReset().mockResolvedValue({});
  endings.length = 0;
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("leaving the after-lesson check (D36)", () => {
  it("records the lesson as exited, never completed", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await toAssessment();
    answer("Two");
    progress.report.mockClear();

    leave();

    expect(progress.report).toHaveBeenCalledWith(LESSON_STATUS.EXITED, {
      segment: 1,
      // B49: the place in the check - question 2, the next one to ask.
      check: 1,
    });
    expect(statuses()).not.toContain(LESSON_STATUS.COMPLETED);
    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });

  it("ends the signal session as exited, not completed", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await toAssessment();

    leave();

    expect(endings.at(-1)).toEqual({
      completionStatus: "exited",
      exitPosition: SEG_2,
    });
  });

  it("keeps the answer already given, on the account", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await toAssessment();
    answer("Two");

    leave();

    expect(saveAttempt).toHaveBeenCalledWith("lesson-1", {
      sessionId: SESSION,
      problemId: "cp-1",
      source: "assessment",
      // The option's own value - a number, as the checkpoint has it.
      answer: 2,
    });
  });

  it("can be left from its intro too", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();
    progress.report.mockClear();

    leave();

    expect(statuses()).toEqual([LESSON_STATUS.EXITED]);
    // Not begun, so no place in it to keep.
    expect(progress.report.mock.calls[0][1]).not.toHaveProperty("check");
    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });
});

describe("leaving a review before it starts (D36)", () => {
  it("goes Home and records nothing against the concept", () => {
    signIn();
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
        live
      />,
    );

    leave();

    expect(push).toHaveBeenCalledWith("/student/dashboard");
    expect(recordReview).not.toHaveBeenCalled();
    // A review never demotes the lesson it reviews.
    expect(statuses()).not.toContain(LESSON_STATUS.EXITED);
  });
});

describe("every answer to a check is stored as it is given", () => {
  it("stores each pick on an inline check, with its segment", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    fireEvent.click(
      await screen.findByRole("button", { name: /The denominator/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: /The numerator/ }));

    expect(saveAttempt.mock.calls).toEqual([
      [
        "lesson-1",
        {
          sessionId: SESSION,
          problemId: "cp-inline",
          segmentId: SEG_1,
          source: "checkpoint",
          answer: "b",
        },
      ],
      [
        "lesson-1",
        {
          sessionId: SESSION,
          problemId: "cp-inline",
          segmentId: SEG_1,
          source: "checkpoint",
          answer: "a",
        },
      ],
    ]);
  });

  it("stores nothing for an authored lesson, whose ids are not real", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    next();

    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));

    expect(saveAttempt).not.toHaveBeenCalled();
  });

  it("stores nothing before the session exists", async () => {
    progress.sessionId = null;
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));

    expect(saveAttempt).not.toHaveBeenCalled();
  });
});

describe("what the review tells the scheduler (B28)", () => {
  const finishReview = async (plan: AdaptationPlan | null = null) => {
    signIn();
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={plan}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();
  };

  it("is first_time for a right first answer", async () => {
    await finishReview();

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        outcome: "first_time",
      }),
    );
  });

  it("is after_hint when a hint was showing before it", async () => {
    await finishReview({
      lessonId: "lesson-1",
      segments: [
        {
          segmentId: SEG_1,
          startModality: "text",
          adjustment: "offer_hint",
          hint: "Look at the top.",
        },
      ],
    } as AdaptationPlan);

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "after_hint" }),
      ),
    );
  });

  it("is sent once", async () => {
    await finishReview();

    await waitFor(() => expect(recordReview).toHaveBeenCalledTimes(1));
  });
});

describe("what the review's completion may claim (D40)", () => {
  const schedule = {
    studentId: "stu-1",
    conceptId: "concept-1",
    stability: 3,
    difficulty: 5,
    retrievability: 0.9,
    lastReview: "2026-10-01T10:00:00Z",
    reviewCount: 2,
    nextReviewDue: "2026-10-09T10:00:00Z",
    lessonId: "lesson-1",
  };

  const finish = async (conceptId: string | null = "concept-1") => {
    signIn();
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId={conceptId ?? undefined}
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();
  };

  it("says the firmer line, and the return, when the scheduler confirms both", async () => {
    recordReview.mockResolvedValue({ recallSuccessful: true, schedule });
    await finish();

    expect(
      await screen.findByRole("heading", {
        name: "You've got this one more firmly now.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("We'll bring it back later.")).toBeTruthy();
  });

  it("says the plain line when the scheduler did not count it", async () => {
    recordReview.mockResolvedValue({ recallSuccessful: false, schedule });
    await finish();

    expect(
      await screen.findByRole("heading", {
        name: "You've been through this one again.",
      }),
    ).toBeTruthy();
  });

  it("says the plain line, and no return, when nothing was recorded", async () => {
    // No concept on the URL: nothing to tell the scheduler, so nothing is.
    await finish(null);

    expect(recordReview).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "You've been through this one again.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/bring it back/i)).toBeNull();
  });

  it("says the plain line, and no return, when the write failed", async () => {
    recordReview.mockRejectedValue(new Error("offline"));
    await finish();

    expect(
      await screen.findByRole("heading", {
        name: "You've been through this one again.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/bring it back/i)).toBeNull();
  });

  it("holds the heading while the write is in flight", async () => {
    recordReview.mockReturnValue(new Promise(() => {}));
    await finish();

    // Kept in place but hidden, so the plain line is not swapped for the
    // firmer one in front of the child a moment later.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector("h2")?.className).toContain("invisible");
  });

  it("never says the old lines", async () => {
    recordReview.mockResolvedValue({ recallSuccessful: true, schedule });
    await finish();
    await screen.findByRole("heading", {
      name: "You've got this one more firmly now.",
    });

    expect(document.body.textContent).not.toMatch(
      /strengthened|settling in|fully sticks|nicely paced/i,
    );
  });
});

describe("an ordinary lesson's completion (D40)", () => {
  it("drops 'Nicely paced'", async () => {
    render(<LessonPlayer lesson={REVIEW} plan={null} />);
    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();

    expect(
      screen.getByRole("heading", { name: "That's the lesson done." }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/nicely paced/i);
  });
});

describe("the reading accommodation reaches the checks (D30)", () => {
  const READING: AdaptationPlan = {
    lessonId: "lesson-1",
    segments: [],
    accommodations: { reading: true },
  };

  it("sets an inline check's answers in the reading type", async () => {
    render(<LessonPlayer lesson={LESSON} plan={READING} />);
    next();

    const label = await screen.findByText("The numerator");
    expect(label.className).toContain("text-[18px]");
  });

  it("sets the after-lesson check's answers in it too", async () => {
    render(<LessonPlayer lesson={LESSON} plan={READING} />);
    await toAssessment();

    expect(screen.getByText("Two").className).toContain("text-[18px]");
  });

  it("leaves the checks alone without it", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    next();

    const label = await screen.findByText("The numerator");
    expect(label.className).not.toContain("text-[18px]");
  });
});

/** The last segment's way into the check, without pressing Start. */
const intoCheck = async () => {
  next();
  fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
  fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
  next();
};

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe("picking a check back up (B49)", () => {
  it("reopens on the question it was left at, the same day", async () => {
    progress.saved = {
      status: "in_progress",
      checkPosition: 1,
      checkResumableUntil: inAnHour(),
    };
    render(<LessonPlayer lesson={LESSON} plan={null} live />);

    await intoCheck();

    expect(screen.getByRole("heading", { name: "Question 2?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("starts fresh once the server's day for it is over", async () => {
    progress.saved = {
      status: "in_progress",
      checkPosition: 1,
      checkResumableUntil: new Date(Date.now() - 1000).toISOString(),
    };
    render(<LessonPlayer lesson={LESSON} plan={null} live />);

    await intoCheck();

    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(attempts).not.toHaveBeenCalled();
  });

  it("reads back the answers given before, for Review Answers", async () => {
    progress.saved = {
      status: "in_progress",
      checkPosition: 1,
      checkResumableUntil: inAnHour(),
    };
    attempts.mockResolvedValue([
      {
        questionId: "cp-1",
        source: "assessment",
        attemptNumber: 1,
        answer: 3,
        correct: false,
      },
    ]);
    render(<LessonPlayer lesson={LESSON} plan={null} live />);

    await intoCheck();

    expect(attempts).toHaveBeenCalledWith("lesson-1", SESSION);
    await waitFor(() =>
      expect(loadReviewAnswers("lesson-1")).toEqual([
        { questionIndex: 0, selectedId: "3" },
      ]),
    );
  });

  it("never reopens a lesson nothing writes", async () => {
    // The authored walkthrough has no progress row to resume from.
    progress.saved = {
      status: "in_progress",
      checkPosition: 1,
      checkResumableUntil: inAnHour(),
    };
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    await intoCheck();

    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });
});

describe("the check ending completes the lesson", () => {
  it("writes the completion as the result appears, not on the next tap", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await toAssessment();
    answer("Two");
    answer("Two");

    await waitFor(() =>
      expect(statuses()).toContain(LESSON_STATUS.COMPLETED),
    );
    // The child is still on the result.
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("waits for the last answer to be stored first", async () => {
    // The server reads the check-in's outcome from the answers it holds.
    let store: () => void = () => {};
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await toAssessment();
    answer("Two");
    saveAttempt.mockImplementation(
      () => new Promise<void>((resolve) => (store = resolve)),
    );
    answer("Two");

    await new Promise((r) => setTimeout(r, 0));
    expect(statuses()).not.toContain(LESSON_STATUS.COMPLETED);

    store();
    await waitFor(() =>
      expect(statuses()).toContain(LESSON_STATUS.COMPLETED),
    );
  });
});

describe("from the check-in (B26)", () => {
  const completed = {
    lessonId: "lesson-1",
    status: "completed",
    modulePosition: 0,
    segmentPosition: 1,
    intelligence: {},
    masteredConcepts: [
      { conceptId: null, conceptName: "Numerators", asked: 2, correct: 2 },
    ],
    revisitConcepts: [
      { conceptId: null, conceptName: "Denominators", asked: 2, correct: 0 },
    ],
    resultNote: "You can say which number is on top.",
  };

  it("draws what the completion write brought back, and keeps it for the summary", async () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live />,
    );
    await toAssessment();
    answer("Two");
    answer("Two");
    expect(screen.queryByText("Numerators")).toBeNull();

    // The completion lands.
    progress.saved = completed;
    rerender(<LessonPlayer lesson={LESSON} plan={null} live />);

    expect(screen.getByText("Numerators")).toBeTruthy();
    expect(screen.getByText(/Denominators/)).toBeTruthy();
    expect(screen.getByText("You can say which number is on top.")).toBeTruthy();
    // Concepts, never the counts behind them (rule 9).
    expect(document.body.textContent).not.toMatch(/\d/);
    expect(loadCheckOutcome("lesson-1")).toEqual({
      mastered: ["Numerators"],
      revisit: ["Denominators"],
      note: "You can say which number is on top.",
    });
  });

  it("draws nothing before it lands", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await toAssessment();
    answer("Two");
    answer("Two");

    expect(screen.queryByText(/revisit soon/)).toBeNull();
    expect(document.querySelectorAll(".shadow-elevation-1")).toHaveLength(0);
  });
});
