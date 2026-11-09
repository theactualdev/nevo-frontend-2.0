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
import { resetAttentionReports } from "@/hooks/useAttentionReports";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * FOCUS EVENTS FROM THE PLAYER (Teslim, 8ab10c5; Lydia's rollout order,
 * 1 Nov): the section on screen, to the sitting it belongs to, for a live
 * first-time sitting only. How they travel is `useAttentionReports`' own
 * test; this is what the player hands it.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/attention", () => ({
  attentionApi: { report: (...a: unknown[]) => report(...a) },
}));

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
      comprehension: vi.fn().mockResolvedValue({ required: false, canAdvance: true }),
      saveAttempt: vi.fn().mockResolvedValue({}),
      saveSegmentChoice: vi.fn().mockResolvedValue({}),
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    { id: SEG_1, ...text("Numerators") },
    { id: SEG_2, ...text("Denominators") },
  ],
  assessment: {
    questions: [
      {
        id: "cp-1",
        prompt: "Question 1?",
        options: [
          { id: "2", label: "Two", value: 2 },
          { id: "3", label: "Three", value: 3 },
        ],
        correctId: "2",
      },
    ],
  },
} as unknown as Lesson;

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
/** Each report as `[action, segmentId]`. */
const sent = () =>
  report.mock.calls.map(([, r]) => [
    (r as { action: string }).action,
    (r as { segmentId: string }).segmentId,
  ]);
const settle = () => act(async () => {});

beforeEach(() => {
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });
  progress.sessionId = SESSION;
  progress.opened = { sessionId: SESSION, resumed: false };
  report.mockReset().mockResolvedValue({});
});

afterEach(() => {
  resetAttentionReports();
  cleanup();
  clearSession();
});

describe("the section on screen, to its sitting", () => {
  it("reports each section of a live sitting as it comes on screen", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await settle();
    expect(report.mock.calls[0][0]).toBe(SESSION);

    next();
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_1],
      ["return", SEG_2],
    ]);
  });

  it("sends no away as the lesson moves on to its after-lesson questions", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await settle();
    next();
    next();
    await settle();
    // The after-lesson questions' own opening: no section on screen.
    expect(
      (await screen.findAllByText(/This helps Nevo see what landed/)).length,
    ).toBeGreaterThan(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    // An away there would stay open: no section is on screen to return to.
    expect(sent()).toEqual([
      ["return", SEG_1],
      ["return", SEG_2],
    ]);
  });

  it("sends nothing more once 'Leave for now' has ended the sitting", async () => {
    // Case 11 of the 9 Nov run: the lesson went with one more event for the
    // sitting the leave had just ended, answered 404.
    const { unmount } = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Leave for now",
      }),
    );
    await settle();
    expect(progress.report).toHaveBeenCalledWith("exited", { segment: 0 });

    // Home takes over: the player goes.
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    expect(sent()).toEqual([["return", SEG_1]]);
  });

  it("sends nothing before the sitting has opened", async () => {
    progress.sessionId = null;
    progress.opened = null;
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await settle();

    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["an authored lesson", { live: false }],
    ["a review", { live: true, review: true }],
  ] as const)("sends nothing for %s", async (_, over) => {
    render(<LessonPlayer lesson={LESSON} plan={null} {...over} />);
    await settle();
    for (const button of screen.queryAllByRole("button", { name: /begin|start|ready/i }))
      fireEvent.click(button);
    await settle();

    expect(report).not.toHaveBeenCalled();
  });

  it("sends nothing for a finished lesson looked at again", async () => {
    progress.opened = { sessionId: SESSION, resumed: true, reviewMode: true };
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    await settle();

    expect(report).not.toHaveBeenCalled();
  });
});
