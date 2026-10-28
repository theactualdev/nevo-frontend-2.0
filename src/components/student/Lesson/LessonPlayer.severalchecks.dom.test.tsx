import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { GIVES_WAY_AFTER_MS, RECOVERY_LINE } from "./QuickCheckSheet";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * SEVERAL CHECKS IN ONE SHEET (Lydia, 23 Oct #1; 25 Oct: "a straight bug fix:
 * today a lesson with two checks in a section can't be finished"). They are
 * asked one after another in the same sheet, and each gates on its own: pass
 * check 1 and miss check 2, and it is check 2 that is asked again.
 *
 * "Check 2 of 4" (Lydia, 26 Oct, D4) says where the child is; after a right
 * answer the Lesson Check frame's "Next check", and "Finish" on the last
 * (design 4e03b7f, `qc-multi`).
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const SEG_3 = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

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

const { trackEvent, saveAttempt, attempts } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
  attempts: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({
    offeredBreak: null,
    reason: null,
    plan: null,
    forSegmentId: null,
  }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
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

const check = (n: number) => ({
  id: `cp-${n}`,
  question: `Question ${n}?`,
  options: [
    { id: "r", label: `Right ${n}`, value: "r" },
    { id: "w", label: `Wrong ${n}`, value: "w" },
  ],
  correctId: "r",
  correctNote: `Yes, ${n}.`,
  recoveryNote: "Not quite.",
});

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

const CHECKS = [check(1), check(2), check(3)];
const LESSON = {
  id: "lesson-1",
  title: "Photosynthesis",
  segments: [
    { id: SEG_1, ...text("Light") },
    {
      id: SEG_2,
      ...text("Leaves"),
      quickCheck: CHECKS[0],
      quickChecks: CHECKS,
    },
    { id: SEG_3, ...text("Roots") },
  ],
} as unknown as Lesson;

const reply = (questionId: string, correct: boolean) => ({
  id: `att-${questionId}`,
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId,
  segmentId: SEG_2,
  source: "checkpoint",
  attemptNumber: 1,
  question: {},
  answer: correct ? "r" : "w",
  correct,
  submittedAt: "2026-10-27T10:00:00Z",
  resultState: "nothing_landed",
});

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const sheet = () => screen.getByRole("dialog");
const pick = (label: string) =>
  fireEvent.click(within(sheet()).getByRole("button", { name: new RegExp(label) }));
const press = (name: string) =>
  fireEvent.click(within(sheet()).getByRole("button", { name }));

/** Into the section with three checks, and its sheet. */
const toTheChecks = async () => {
  render(<LessonPlayer lesson={LESSON} plan={null} live />);
  next();
  next();
  await screen.findByRole("dialog");
};

beforeEach(() => {
  progress.sessionId = SESSION;
  progress.opened = null;
  trackEvent.mockReset();
  attempts.mockReset().mockResolvedValue([]);
  saveAttempt.mockReset().mockImplementation(
    async (_lesson: string, body: { problemId: string; answer: string }) =>
      reply(body.problemId, body.answer === "r"),
  );
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
  vi.useRealTimers();
});

describe("several checks, one after another in the same sheet", () => {
  it("asks each in turn, saying where the child is, and goes on only after the last", async () => {
    await toTheChecks();

    expect(within(sheet()).getByText("Check 1 of 3")).toBeTruthy();
    expect(within(sheet()).getByText("Question 1?")).toBeTruthy();
    pick("Right 1");
    press("Next check");

    expect(within(sheet()).getByText("Check 2 of 3")).toBeTruthy();
    expect(within(sheet()).getByText("Question 2?")).toBeTruthy();
    // Asked with nothing picked.
    expect(within(sheet()).queryByRole("status")).toBeNull();
    pick("Right 2");
    press("Next check");

    expect(within(sheet()).getByText("Check 3 of 3")).toBeTruthy();
    pick("Right 3");
    expect(within(sheet()).queryByRole("button", { name: "Next check" })).toBeNull();
    press("Finish");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Roots" })).toBeTruthy();
  });

  it("sends each answer against its own check", async () => {
    await toTheChecks();
    pick("Right 1");
    press("Next check");
    pick("Right 2");

    expect(saveAttempt.mock.calls.map(([, body]) => body.problemId)).toEqual([
      "cp-1",
      "cp-2",
    ]);
  });

  it("never names a count of right answers, only the place", async () => {
    await toTheChecks();
    pick("Right 1");
    press("Next check");

    expect(sheet().textContent).not.toMatch(/\d+ (right|correct)|score|%/i);
  });
});

describe("each check gates on its own", () => {
  it("holds a miss on check 2, and Next asks check 2 again, not check 1", async () => {
    await toTheChecks();
    pick("Right 1");
    press("Next check");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    pick("Wrong 2");
    expect(within(sheet()).getByRole("status").textContent).toBe(RECOVERY_LINE);
    // No way on past it.
    expect(within(sheet()).queryByRole("button", { name: /Next check|Finish|Continue/ })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(GIVES_WAY_AFTER_MS);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Still on the section.
    expect(screen.getByRole("heading", { name: "Leaves" })).toBeTruthy();

    next();

    await screen.findByRole("dialog");
    expect(within(sheet()).getByText("Check 2 of 3")).toBeTruthy();
    expect(within(sheet()).getByText("Question 2?")).toBeTruthy();
    expect(within(sheet()).queryByRole("status")).toBeNull();
  });

  it("opens on the next check after a tap-out that left a right answer's way on untaken", async () => {
    await toTheChecks();
    pick("Right 1");
    fireEvent.keyDown(sheet(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    next();

    await screen.findByRole("dialog");
    expect(within(sheet()).getByText("Check 2 of 3")).toBeTruthy();
  });

  it("hands off from a miss on check 2 though check 1 was answered right", async () => {
    // A right answer makes a late hand-off for THAT question moot, not for
    // the next one (B94).
    saveAttempt.mockImplementation(
      async (_lesson: string, body: { problemId: string; answer: string }) => ({
        ...reply(body.problemId, body.answer === "r"),
        ...(body.answer === "r"
          ? {}
          : {
              handoffTo: "socratic_panel",
              guidedPrompts: [{ id: "p-1", prompt: "What does a leaf need?" }],
              advanceAfterHandoff: true,
            }),
      }),
    );
    await toTheChecks();
    pick("Right 1");
    press("Next check");

    pick("Wrong 2");

    expect(await screen.findByText("What does a leaf need?")).toBeTruthy();
  });

  it("does not let Next past the section until every check is passed", async () => {
    await toTheChecks();
    pick("Right 1");
    fireEvent.keyDown(sheet(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    next();

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Roots" })).toBeNull();
  });
});

describe("the server's marks, read back as the sitting opens", () => {
  const reopened = async (right: string[]) => {
    progress.opened = { sessionId: SESSION, resumed: true };
    attempts.mockResolvedValue(right.map((id) => reply(id, true)));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await waitFor(() => expect(attempts).toHaveBeenCalled());
    await act(async () => {});
    next();
    next();
  };

  it("opens part way on the first check not yet passed", async () => {
    await reopened(["cp-1"]);

    await screen.findByRole("dialog");
    expect(within(sheet()).getByText("Check 2 of 3")).toBeTruthy();
  });

  it("counts only the run from the first: a later one passed alone is asked again", async () => {
    await reopened(["cp-2"]);

    await screen.findByRole("dialog");
    expect(within(sheet()).getByText("Check 1 of 3")).toBeTruthy();
  });

  it("asks none of a section whose every check is passed", async () => {
    await reopened(["cp-1", "cp-2", "cp-3"]);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Roots" })).toBeTruthy();
  });
});

describe("a section with one check", () => {
  it("is the sheet it always was: no place line, and Continue", async () => {
    const one = {
      ...LESSON,
      segments: [
        LESSON.segments[0],
        { id: SEG_2, ...text("Leaves"), quickCheck: CHECKS[0] },
        LESSON.segments[2],
      ],
    } as unknown as Lesson;
    render(<LessonPlayer lesson={one} plan={null} live />);
    next();
    next();
    await screen.findByRole("dialog");

    expect(within(sheet()).queryByText(/Check \d of \d/)).toBeNull();
    pick("Right 1");
    expect(within(sheet()).getByRole("button", { name: "Continue" })).toBeTruthy();
  });
});
