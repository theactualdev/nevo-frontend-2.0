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
import type { Lesson } from "@/lib/types";

/**
 * A CHECK ALREADY PASSED ON THE SERVER IS NOT ASKED AGAIN AFTER A RELOAD
 * (24 Oct production run, item 4: The Periodic Table's section 4).
 *
 * Passed is the server's mark - a stored quick-check answer to the section's
 * own question with `correct: true` - read back once the sitting opens, over
 * the whole lesson as the server's own gate counts a pass. Nothing here
 * counts or decides (rule 3), and with no read every check is asked as it
 * was before (rule 5).
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

const { attempts } = vi.hoisted(() => ({ attempts: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({
  useAssignmentNote: () => null,
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: vi.fn().mockResolvedValue({}),
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

const stored = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: "an-earlier-sitting",
  questionId: "cp-inline",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 1,
  answer: "a",
  correct: true,
  submittedAt: "2026-10-24T11:50:00Z",
  ...over,
});

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const checkIsUp = () =>
  screen.queryByRole("button", { name: /The numerator/ }) !== null;

/** Render with the sitting open, and let the read land. */
const opened = async (props: Record<string, unknown> = {}) => {
  progress.opened = { sessionId: SESSION, resumed: true };
  render(<LessonPlayer lesson={LESSON} plan={null} live {...props} />);
  await act(async () => {});
};

beforeEach(() => {
  progress.report.mockReset();
  progress.sessionId = SESSION;
  progress.saved = null;
  progress.opened = null;
  attempts.mockReset().mockResolvedValue([]);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("a check passed before this page loaded", () => {
  it("is not asked again: Next goes on to the next section", async () => {
    attempts.mockResolvedValue([
      stored({ correct: false, attemptNumber: 1 }),
      stored({ correct: true, attemptNumber: 2 }),
    ]);
    await opened();

    // The whole lesson's answers, as the server's gate counts a pass.
    expect(attempts).toHaveBeenCalledWith("lesson-1");
    next();

    expect(checkIsUp()).toBe(false);
    expect(
      await screen.findByRole("heading", { name: "Denominators" }),
    ).toBeInTheDocument();
  });

  it("is still asked when every stored answer to it was a miss", async () => {
    attempts.mockResolvedValue([stored({ correct: false })]);
    await opened();

    next();

    await waitFor(() => expect(checkIsUp()).toBe(true));
  });

  it("is still asked when the answer was unmarkable, which is never right", async () => {
    attempts.mockResolvedValue([stored({ correct: null })]);
    await opened();

    next();

    await waitFor(() => expect(checkIsUp()).toBe(true));
  });

  it("is still asked when the right answer was to another question", async () => {
    attempts.mockResolvedValue([
      stored({ questionId: "cp-somewhere-else" }),
      // The after-lesson check's, though it names the same id.
      stored({ source: "assessment" }),
    ]);
    await opened();

    next();

    await waitFor(() => expect(checkIsUp()).toBe(true));
  });

  it("is asked as before when the answers cannot be read", async () => {
    attempts.mockRejectedValue(new Error("offline"));
    await opened();

    next();

    await waitFor(() => expect(checkIsUp()).toBe(true));
  });

  it("is not looked for until the sitting opens", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await act(async () => {});

    expect(attempts).not.toHaveBeenCalled();
  });

  it("is not looked for on a finished lesson opened again", async () => {
    await opened({ finished: true });

    expect(attempts).not.toHaveBeenCalled();
  });

  it("is not looked for in the walkthrough, which has no server", async () => {
    progress.opened = { sessionId: SESSION, resumed: true };
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    await act(async () => {});

    expect(attempts).not.toHaveBeenCalled();
  });
});
