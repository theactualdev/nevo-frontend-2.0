import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * "TAKE A BREAK" FROM INSIDE THE CHECK (Lydia, 23 Oct: a hold at a check is
 * not live until the break is reachable at all times, including from inside
 * the check sheet; Olayinka, 23 Oct, call 4).
 *
 * The child's own break: `POST /api/v1/lessons/{id}/sessions/{session}/break`
 * with `{action: "start"}` - micro, the contract's default - and
 * `{action: "return"}` as it ends. The server records the break itself (its
 * `break_start` and `break_end`, trigger `student_request`), so the player
 * sends neither. When it ends the child is back at the check, asked afresh.
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

const QUESTION = "Which number is on top?";
const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    {
      id: SEG_1,
      modalities: ["text"],
      text: { heading: "Numerators", body: { default: "Body of Numerators." } },
      quickCheck: {
        id: "cp-inline",
        question: QUESTION,
        options: [
          { id: "a", label: "The numerator", value: "a" },
          { id: "b", label: "The denominator", value: "b" },
        ],
        correctId: "a",
        correctNote: "Yes.",
        recoveryNote: "Not quite.",
        conceptId: "concept-1",
      },
    },
    {
      id: SEG_2,
      modalities: ["text"],
      text: { heading: "Denominators", body: { default: "Body." } },
    },
  ],
} as unknown as Lesson;

/** The micro break holds for its two breaths (`BreakScreen`), then returns. */
const MICRO_HOLD_MS = 8_000;

const types = () => trackEvent.mock.calls.map(([t]) => t);
const intoCheck = async () => {
  render(<LessonPlayer lesson={LESSON} plan={null} live />);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  return screen.findByRole("dialog");
};
const takeBreak = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByRole("button", { name: "Take a break" }));
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

describe("Take a break, from inside the check", () => {
  it("starts the child's own break on the sitting, and the check gives way to it", async () => {
    const dialog = await intoCheck();

    takeBreak(dialog);

    expect(controlBreak).toHaveBeenCalledExactlyOnceWith(
      "lesson-1",
      SESSION,
      "start",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Take a breath")).toBeInTheDocument();
  });

  it("returns the child to the check when it ends, asked afresh, and tells the server", async () => {
    const dialog = await intoCheck();
    fireEvent.click(within(dialog).getByRole("button", { name: /The denominator/ }));
    takeBreak(screen.getByRole("dialog"));

    await breathe();

    expect(controlBreak).toHaveBeenLastCalledWith("lesson-1", SESSION, "return");
    const back = screen.getByRole("dialog");
    expect(within(back).getByText(QUESTION)).toBeInTheDocument();
    expect(within(back).queryByText("Not quite.")).toBeNull();
    // The section behind the reopened sheet, hidden from it as Radix does.
    expect(
      screen.getByRole("heading", { name: "Numerators", hidden: true }),
    ).toBeInTheDocument();
  });

  it("sends the return only after the start has landed", async () => {
    let land: (v: unknown) => void = () => {};
    controlBreak.mockReset().mockImplementationOnce(
      () => new Promise((resolve) => (land = resolve)),
    );
    controlBreak.mockResolvedValue({ sessionId: SESSION, status: "learning" });
    const dialog = await intoCheck();
    takeBreak(dialog);

    await breathe();
    expect(controlBreak).toHaveBeenCalledTimes(1);

    await act(async () => {
      land({ sessionId: SESSION, status: "paused" });
    });
    expect(controlBreak).toHaveBeenLastCalledWith("lesson-1", SESSION, "return");
  });

  it("sends no break_start or break_end of its own: the server records this break", async () => {
    const dialog = await intoCheck();
    takeBreak(dialog);
    await breathe();

    expect(types()).not.toContain("break_start");
    expect(types()).not.toContain("break_end");
    // Leaving the check for the break is not tapping out of it.
    expect(
      trackEvent.mock.calls.filter(
        ([t, p]) =>
          t === "engagement_signal" &&
          (p as { indicator?: string }).indicator === "navigation_fragmentation",
      ),
    ).toHaveLength(0);
  });

  it("is still the child's break with no sitting to start it on, recorded on the signal stream", async () => {
    progress.sessionId = null;
    const dialog = await intoCheck();

    takeBreak(dialog);
    await breathe();

    expect(controlBreak).not.toHaveBeenCalled();
    const starts = trackEvent.mock.calls.filter(([t]) => t === "break_start");
    const ends = trackEvent.mock.calls.filter(([t]) => t === "break_end");
    expect(starts).toHaveLength(1);
    expect(starts[0][1]).toMatchObject({
      breakType: "micro",
      trigger: "student_request",
    });
    expect(ends).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sends no return for a break the server never started, and records neither half", async () => {
    controlBreak.mockReset().mockRejectedValue(new Error("offline"));
    const dialog = await intoCheck();

    takeBreak(dialog);
    await breathe();

    expect(controlBreak).toHaveBeenCalledOnce();
    expect(controlBreak).toHaveBeenCalledWith("lesson-1", SESSION, "start");
    expect(types()).not.toContain("break_start");
    expect(types()).not.toContain("break_end");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("never starts one on a finished lesson's sitting", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live finished />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const dialog = await screen.findByRole("dialog");

    takeBreak(dialog);

    expect(controlBreak).not.toHaveBeenCalled();
    expect(screen.getByText("Take a breath")).toBeInTheDocument();
  });
});
