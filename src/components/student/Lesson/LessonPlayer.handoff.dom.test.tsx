import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * B94 / SCRUM-241, frame 38a: the quick check gives way to the Socratic
 * panel when the SERVER says so, on its reply to a miss - "the front end
 * never counts attempts and never decides for itself". The panel arrives
 * open, with the server's prompts and nothing to accept or decline, and once
 * they are worked through the child goes "forward, never back to the
 * question" - when the server said to (`advanceAfterHandoff`). What the child
 * did is reported as it was: "a concept reached this way is never recorded as
 * mastered first time".
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  sessionId: null as string | null,
  completionSaved: false,
  completionFailed: false,
  saved: null as unknown,
  opened: null as unknown,
  localId: "local-1",
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progress }),
}));

const { trackEvent, recordReview, saveAttempt, answerGuided, applied } =
  vi.hoisted(() => ({
    trackEvent: vi.fn(),
    recordReview: vi.fn(),
    saveAttempt: vi.fn(),
    answerGuided: vi.fn(),
    /** The player's applied-adaptation count, as handed to the signals. */
    applied: { ref: null as { current: { count: number; lastAt: number | null } } | null },
  }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    applied.ref = args[4] as typeof applied.ref;
    return { trackEvent };
  },
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: (...a: unknown[]) => recordReview(...a) },
}));
vi.mock("@/lib/api/scaffolds", () => ({
  scaffoldsApi: { attempt: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: {
      ...actual.intelligenceApi,
      answerGuidedQuestion: (...a: unknown[]) => answerGuided(...a),
    },
  };
});
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: (...a: unknown[]) => saveAttempt(...a),
      attempts: vi.fn().mockResolvedValue([]),
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
} as unknown as Lesson;

const PROMPT = "What does the bottom number count?";

/** The stored attempt, as the server answers it. */
const reply = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-inline",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 3,
  question: {},
  answer: "b",
  correct: false,
  submittedAt: "2026-10-08T10:00:00Z",
  resultState: "nothing_landed",
  ...over,
});
const HANDOFF = {
  handoffTo: "socratic_panel",
  guidedPrompts: [{ id: "p-1", prompt: PROMPT }],
  advanceAfterHandoff: true,
};

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const miss = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: /The denominator/ }),
  );
const checkOnScreen = () => screen.queryByText("Which number is on top?");

/** Answer the panel's one write-in prompt. */
const workThrough = () => {
  fireEvent.click(screen.getByRole("button", { name: PROMPT }));
  fireEvent.change(screen.getByRole("textbox", { name: PROMPT }), {
    target: { value: "The parts" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

beforeEach(() => {
  progress.report.mockReset();
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  recordReview.mockReset().mockResolvedValue({});
  saveAttempt.mockReset().mockResolvedValue(reply());
  answerGuided.mockReset().mockResolvedValue({ promptId: "p-1" });
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("the server hands a child off from the quick check (B94)", () => {
  it("closes the check and opens the panel with the server's prompts", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    await miss();

    expect(await screen.findByText(PROMPT)).toBeTruthy();
    await waitFor(() => expect(checkOnScreen()).toBeNull());
    // It arrives: nothing to accept or decline, no count of tries.
    expect(screen.getByText(/think it through/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /not now|yes/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ (tries|attempts)/i);
    expect(trackEvent).toHaveBeenCalledWith("guided_question_shown", {
      segmentId: SEG_1,
      promptId: "p-1",
    });
  });

  it("moves on into the next segment once the prompts are worked through", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await screen.findByText(PROMPT);

    workThrough();
    expect(screen.getByText("Let's keep going.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    // Forward, an ordinary segment, and the panel gone with the check.
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(checkOnScreen()).toBeNull();
    // The reply went up as its length, never the words.
    expect(answerGuided).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: "p-1", responseLength: 9 }),
    );
  });

  it("does not send the child back into the check it moved them past", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await screen.findByText(PROMPT);
    workThrough();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    next();

    expect(checkOnScreen()).toBeNull();
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    // And no panel arrives again on the way back through.
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it("offers no way on when the server did not say to move on", async () => {
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, advanceAfterHandoff: false }),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await screen.findByText(PROMPT);

    workThrough();

    expect(screen.queryByRole("button", { name: "Keep going" })).toBeNull();
    expect(screen.queryByText("Let's keep going.")).toBeNull();
    // The check is still the way on.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    next();
    expect(checkOnScreen()).toBeTruthy();
  });

  it("counts no misses of its own: without the server's word nothing hands off", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    for (let i = 0; i < 4; i++) {
      await miss();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    }
    await new Promise((r) => setTimeout(r, 0));

    expect(checkOnScreen()).toBeTruthy();
    expect(screen.queryByText(/think it through/i)).toBeNull();
  });

  it("draws nothing for a hand-off with no prompts (rule 5)", async () => {
    saveAttempt.mockResolvedValue(reply({ ...HANDOFF, guidedPrompts: [] }));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    await miss();
    await new Promise((r) => setTimeout(r, 0));

    expect(checkOnScreen()).toBeTruthy();
    expect(screen.queryByText(/think it through/i)).toBeNull();
  });

  it("ignores a hand-off for a miss the child has since answered right", async () => {
    let land: (row: unknown) => void = () => {};
    saveAttempt.mockImplementationOnce(
      () => new Promise((resolve) => (land = resolve)),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: /The numerator/ }));

    land(reply(HANDOFF));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.getByRole("button", { name: "Keep going" })).toBeTruthy();
  });
});

describe("what a hand-off records (38a)", () => {
  it("is never first time for the review, even with a right answer after it", async () => {
    // Handed off, worked through, then back to the check and right on the
    // first pick of the new round: help was on screen, so it is not first
    // time - and the misses before it stand.
    const REVIEW = { ...LESSON, assessment: undefined } as unknown as Lesson;
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, advanceAfterHandoff: false }),
    );
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    next();
    await miss();
    await screen.findByText(PROMPT);
    workThrough();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    saveAttempt.mockResolvedValue(reply({ correct: true }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();

    await waitFor(() => expect(recordReview).toHaveBeenCalled());
    expect(recordReview.mock.calls[0][0].outcome).not.toBe("first_time");
  });

  it("is never the check passed when the child moves on through it", async () => {
    const REVIEW = { ...LESSON, assessment: undefined } as unknown as Lesson;
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    next();
    await miss();
    await screen.findByText(PROMPT);
    workThrough();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        outcome: "not_recalled",
      }),
    );
  });
});

describe("a hand-off panel is an adaptation applied (B74)", () => {
  it("counts once when it renders", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    expect(applied.ref?.current.count).toBe(0);

    await miss();
    await screen.findByText(PROMPT);

    expect(applied.ref?.current.count).toBe(1);
    expect(applied.ref?.current.lastAt).toEqual(expect.any(Number));
  });

  it("counts once per segment, however often it arrives there", async () => {
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, advanceAfterHandoff: false }),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await screen.findByText(PROMPT);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Back into the check, another miss, and the server hands off again.
    next();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await miss();
    await waitFor(() => expect(checkOnScreen()).toBeNull());
    expect(await screen.findByText(PROMPT)).toBeTruthy();

    expect(applied.ref?.current.count).toBe(1);
  });

  it("counts nothing where no hand-off came", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await new Promise((r) => setTimeout(r, 0));

    expect(applied.ref?.current.count).toBe(0);
  });
});
