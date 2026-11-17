import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * A BREAK AND A TAP OUT ON THE END-OF-LESSON CHECK (Lydia, 16 Nov: "Break and
 * tap-out go ON the end-of-lesson check, and are not optional"). She ruled
 * holding a pick on a dropped connection right because Break, tap out and
 * Exit lesson stay open, so the child is held on the answer, not trapped in
 * the lesson; this check had only the exit.
 *
 * - "Take a break": the child's own break, on the sitting as from a quick
 *   check, and back to the same question - its pick, and a mark on its way,
 *   still there.
 * - The tap out, the player's own Previous: back to the lesson's last part,
 *   and the check asked again from that question when the child moves on.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  resend: vi.fn(),
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

const { trackEvent, saveAttempt, controlBreak } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
  controlBreak: vi.fn(),
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
      attempts: vi.fn().mockResolvedValue([]),
      controlBreak: (...a: unknown[]) => controlBreak(...a),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

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
    { id: "seg-1", ...text("Numerators") },
    { id: "seg-2", ...text("Denominators") },
  ],
  assessment: { questions: [question(1), question(2)] },
} as unknown as Lesson;

/** The micro break holds for its two breaths (`BreakScreen`), then returns. */
const MICRO_HOLD_MS = 8_000;

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const intoCheck = () => {
  render(<LessonPlayer lesson={LESSON} plan={null} live />);
  fireEvent.click(button("Next"));
  fireEvent.click(button("Next"));
  fireEvent.click(button("Start"));
};
const breathe = async () => {
  await act(async () => {
    vi.advanceTimersByTime(MICRO_HOLD_MS + 100);
  });
  // The return waits on the start's answer.
  await act(async () => {});
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  saveAttempt.mockReset().mockResolvedValue({});
  controlBreak.mockReset().mockResolvedValue({
    sessionId: SESSION,
    status: "paused",
  });
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

describe("Take a break, on the end-of-lesson check", () => {
  it("is on every question, beside the way out", async () => {
    intoCheck();

    expect(button("Take a break")).toBeInTheDocument();
    expect(button("Leave for now")).toBeInTheDocument();
    fireEvent.click(button("Two"));
    fireEvent.click(button("Next"));
    await act(async () => {});

    expect(screen.getByText("Question 2?")).toBeInTheDocument();
    expect(button("Take a break")).toBeInTheDocument();
  });

  it("starts the child's own break on the sitting, over the check", () => {
    intoCheck();

    fireEvent.click(button("Take a break"));

    expect(controlBreak).toHaveBeenCalledExactlyOnceWith(
      "lesson-1",
      SESSION,
      "start",
    );
    expect(screen.getByText("Take a breath")).toBeInTheDocument();
    expect(screen.getByText("Question 1?")).not.toBeVisible();
  });

  it("returns to the same question, its held pick and the mark on its way all still there", async () => {
    let land: (v: unknown) => void = () => {};
    saveAttempt
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => (land = resolve)));
    intoCheck();
    fireEvent.click(button("Three"));
    fireEvent.click(button("Next"));
    // Held on the answer (SCRUM-315): the break stays pressable.
    fireEvent.click(button("Take a break"));

    await breathe();

    expect(controlBreak).toHaveBeenLastCalledWith("lesson-1", SESSION, "return");
    expect(screen.getByText("Question 1?")).toBeVisible();
    expect(button("Three")).toHaveAttribute("aria-pressed", "true");
    // The mark lands on the question it was for.
    await act(async () => {
      land({ correct: false });
    });
    expect(button("Next question")).toBeInTheDocument();
  });
});

describe("the tap out, on the end-of-lesson check", () => {
  it("goes back to the lesson's last part, as Back does", () => {
    intoCheck();

    fireEvent.click(button("Previous"));

    expect(screen.getByText("Body of Denominators.")).toBeInTheDocument();
    expect(screen.queryByText("Question 1?")).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith("engagement_signal", {
      indicator: "navigation_fragmentation",
      value: 1,
    });
  });

  it("asks the check again from the same question, past the intro, when the child moves on", () => {
    intoCheck();
    fireEvent.click(button("Previous"));

    fireEvent.click(button("Next"));

    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.getByText("Question 1?")).toBeInTheDocument();
    // Asked afresh: nothing picked.
    expect(button("Two")).not.toHaveAttribute("aria-pressed", "true");
    expect(button("Three")).not.toHaveAttribute("aria-pressed", "true");
  });

  it("comes back on the next question after an answer already marked", async () => {
    saveAttempt.mockResolvedValue({ correct: false });
    intoCheck();
    fireEvent.click(button("Three"));
    fireEvent.click(button("Next"));
    await act(async () => {});
    expect(button("Next question")).toBeInTheDocument();

    fireEvent.click(button("Previous"));
    fireEvent.click(button("Next"));

    expect(screen.getByText("Question 2?")).toBeInTheDocument();
  });

  it("stays pressable while a mark is on its way, and passes nothing", async () => {
    saveAttempt.mockReset().mockImplementation(() => new Promise(() => {}));
    intoCheck();
    fireEvent.click(button("Three"));
    fireEvent.click(button("Next"));

    const previous = button("Previous");
    expect(previous).toBeEnabled();
    expect(previous).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(previous);

    expect(screen.getByText("Body of Denominators.")).toBeInTheDocument();
    fireEvent.click(button("Next"));
    expect(screen.getByText("Question 1?")).toBeInTheDocument();
  });
});
