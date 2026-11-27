import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { LessonExitProvider } from "./LessonExit";
import { clearSession, setSession } from "@/lib/auth/session";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * STOPPING FOR TODAY (Lydia, 25 Nov, L60). The engine offers `stop_for_day`
 * to a child still stuck after two breaks; 17d S5 draws it as the break
 * card's third option. Taken, the lesson ends for today and the child goes
 * Home: on the sitting, the server's own `stop_for_day`, which records the
 * break and closes the sitting; the position written as leaving writes it.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";

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

const { trackEvent, controlBreak, runtime } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  controlBreak: vi.fn(),
  runtime: {
    value: { offeredBreak: null, reason: null, forSegmentId: null, plan: null } as {
      offeredBreak: string | null;
      reason: null;
      forSegmentId: string | null;
      plan: null;
    },
  },
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => runtime.value,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: vi.fn().mockResolvedValue({}),
      attempts: vi.fn().mockResolvedValue([]),
      controlBreak: (...a: unknown[]) => controlBreak(...a),
    },
  };
});

const seg = (id: string) => ({
  id,
  modalities: ["text"],
  text: { heading: id, body: { default: `Body of ${id}.` } },
});
const LESSON = { id: "l-1", title: "Fractions", segments: [seg("seg-1"), seg("seg-2")] } as unknown as Lesson;
const PLAN: AdaptationPlan = { lessonId: "l-1", segments: [{ segmentId: "seg-1", startModality: "text" }] };

const exit = vi.fn();
const open = () => {
  render(
    <LessonExitProvider onExit={exit}>
      <LessonPlayer lesson={LESSON} plan={PLAN} live />
    </LessonExitProvider>,
  );
  // The card opens a beat after it mounts.
  act(() => {
    vi.advanceTimersByTime(1_600);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  progress.sessionId = SESSION;
  progress.report.mockReset();
  trackEvent.mockReset();
  exit.mockReset();
  controlBreak.mockReset().mockResolvedValue({ sessionId: SESSION, status: "stopped" });
  runtime.value = { offeredBreak: "stop_for_day", reason: null, forSegmentId: "seg-1", plan: null };
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
  vi.restoreAllMocks();
  expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
});

describe("the engine's stop for today", () => {
  it("is offered as the break card's third option", () => {
    open();

    expect(screen.getByText("It's okay to stop here for today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop for today" })).toBeInTheDocument();
  });

  it("taken, ends the sitting for today on the server and goes Home", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "Stop for today" }));

    expect(controlBreak).toHaveBeenCalledExactlyOnceWith("l-1", SESSION, "stop_for_day");
    expect(progress.report.mock.calls.some(([status]) => status === "exited")).toBe(true);
    expect(exit).toHaveBeenCalledWith("/student/dashboard");
  });

  it("taken where there is no sitting, still goes Home and asks the server nothing", () => {
    progress.sessionId = null;
    open();

    fireEvent.click(screen.getByRole("button", { name: "Stop for today" }));

    expect(controlBreak).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith("/student/dashboard");
  });

  it("declined, leaves the child in the lesson and the card gone", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "Stay a little longer" }));

    expect(screen.queryByText("It's okay to stop here for today.")).toBeNull();
    expect(exit).not.toHaveBeenCalled();
    expect(controlBreak).not.toHaveBeenCalled();
  });

  it("sends no break event with a type the catalogue does not name", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Stop for today" }));

    const breakTypes = trackEvent.mock.calls
      .filter(([type]) => String(type).startsWith("break_"))
      .map(([, payload]) => (payload as { breakType?: string }).breakType);
    expect(breakTypes).not.toContain("stop_for_day");
  });
});
