import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { Lesson } from "@/lib/types";

/**
 * B98 + SCRUM-178/181: how the check went is the server's word, and when it
 * says nothing landed and reroutes the lesson, the child is told so in
 * design's words and offered one way on, "Let's try it another way"
 * (Lydia, D155, 13 Oct), which follows the reroute.
 *
 * `resultState` is derived server-side from the newest marked attempt per
 * problem; the client's own count of right answers decides nothing now.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const REROUTED_SESSION = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

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

const { push, trackEvent, saveAttempt, endings } = vi.hoisted(() => ({
  push: vi.fn(),
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
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
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
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
      attempts: vi.fn().mockResolvedValue([]),
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

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Numerators", body: { default: "Body of Numerators." } },
    },
  ],
  assessment: { questions: [question(1), question(2)] },
} as unknown as Lesson;

/** The completion write's answer. */
const completed = (over: Record<string, unknown> = {}) => ({
  lessonId: "lesson-1",
  status: "completed",
  modulePosition: 0,
  segmentPosition: 0,
  intelligence: {},
  masteredConcepts: [],
  revisitConcepts: [],
  resultNote: "",
  ...over,
});
const REROUTE = {
  sessionId: REROUTED_SESSION,
  lessonId: "lesson-1",
  depth: "lower",
  segmentPosition: 0,
  reason: "nothing_landed",
};

const HEADING = "That version didn't work.";
const BODY = "Nevo is taking you through this lesson again, a simpler way.";

/** Through the lesson and the check, every answer right on this device. */
const finishCheck = () => {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Two" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
};

beforeEach(() => {
  progress.report.mockReset();
  progress.resend.mockReset();
  progress.sessionId = SESSION;
  progress.completionSaved = false;
  progress.completionFailed = false;
  progress.saved = null;
  push.mockReset();
  trackEvent.mockReset();
  saveAttempt.mockReset().mockResolvedValue({});
  endings.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("the server says nothing landed and reroutes (SCRUM-181)", () => {
  const land = (
    rerender: (ui: React.ReactElement) => void,
    row: unknown,
    onStartAgain = vi.fn(),
  ) => {
    progress.saved = row;
    progress.completionSaved = true;
    rerender(
      <LessonPlayer
        lesson={LESSON}
        plan={null}
        live
        onStartAgain={onStartAgain}
      />,
    );
    return onStartAgain;
  };

  it("says so in design's words, with one action that goes forward (D155)", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();

    land(
      rerender,
      completed({ resultState: "nothing_landed", reroute: REROUTE }),
    );

    expect(screen.getByRole("heading", { name: HEADING })).toBeTruthy();
    expect(screen.getByText(BODY)).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Let's try it another way",
    ]);
    // No score, count or percentage.
    expect(document.body.textContent).not.toMatch(/\d|%/);
  });

  it("follows the reroute's place when the child starts again", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();
    const onStartAgain = land(
      rerender,
      completed({
        resultState: "nothing_landed",
        reroute: { ...REROUTE, segmentPosition: 0 },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Let's try it another way" }));

    expect(onStartAgain).toHaveBeenCalledWith(0, "lower");
    // The run that did not land ended completed, as the server wrote it.
    expect(endings.at(-1)).toEqual({ completionStatus: "completed" });
  });

  it("replaces the completion screen too, if the child moved on first", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "That's the lesson done." }),
    ).toBeTruthy();

    land(
      rerender,
      completed({ resultState: "nothing_landed", reroute: REROUTE }),
    );

    expect(screen.getByRole("heading", { name: HEADING })).toBeTruthy();
  });

  it("is not shown where something landed, whatever the child's answers were", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();

    land(rerender, completed({ resultState: "partly_landed", reroute: null }));

    expect(screen.queryByText(HEADING)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "You're getting the hang of this" }),
    ).toBeTruthy();
  });

  it("is not shown without a reroute to follow: the result says nothing landed (D143)", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();

    land(rerender, completed({ resultState: "nothing_landed" }));

    expect(screen.queryByText(HEADING)).toBeNull();
    expect(screen.getByText(/didn.t land yet/)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("decides nothing landed from the server alone, never the child's answers", () => {
    // Every answer was right on this device; the server's verdict stands.
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();
    expect(screen.queryByText(/didn.t land yet/)).toBeNull();

    land(rerender, completed({ resultState: "nothing_landed" }));

    expect(screen.getByText(/didn.t land yet/)).toBeTruthy();
  });

  it("holds the result's mark and heading until the verdict comes back", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();

    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector("h2")?.closest(".invisible")).toBeTruthy();
  });

  it("never sends the child here for a lesson they did not attempt", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live onStartAgain={vi.fn()} />,
    );
    finishCheck();

    land(
      rerender,
      completed({
        resultState: "not_attempted",
        reroute: { ...REROUTE, reason: "not_attempted" },
      }),
    );

    expect(screen.queryByText(HEADING)).toBeNull();
  });

  it("sends no result state on any write: it is the server's to derive", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();

    for (const [, position] of progress.report.mock.calls)
      expect(position).not.toHaveProperty("resultState");
    for (const [, body] of saveAttempt.mock.calls)
      expect(body).not.toHaveProperty("resultState");
  });
});

describe("a check result that can't be read (D183)", () => {
  const UNREAD = "We couldn't load your result just now.";
  const rerender_ = (rerender: (ui: React.ReactElement) => void) =>
    rerender(<LessonPlayer lesson={LESSON} plan={null} live />);

  it("says so in Lydia's words, with Try again and Back to my lessons", () => {
    const { rerender } = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();

    // The completion write did not reach Nevo - offline, or failed.
    progress.completionFailed = true;
    rerender_(rerender);

    expect(screen.getByRole("heading", { name: UNREAD })).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Try again",
      "Back to my lessons",
    ]);
    // No claim about what was or was not saved.
    expect(document.body.textContent).not.toMatch(/save/i);
  });

  it("is not shown while the result is still on its way", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();

    expect(screen.queryByText(UNREAD)).toBeNull();
  });

  it("reads the result again on Try again, and shows it once it lands", () => {
    const { rerender } = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();
    progress.completionFailed = true;
    rerender_(rerender);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(progress.resend).toHaveBeenCalledTimes(1);

    // On its way: the screen holds, and does not flick back to a blank result.
    progress.completionFailed = false;
    rerender_(rerender);
    expect(screen.getByRole("heading", { name: UNREAD })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    // It landed, with the server's verdict.
    progress.completionSaved = true;
    progress.saved = completed({ resultState: "landed" });
    rerender_(rerender);
    expect(screen.queryByText(UNREAD)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "You're getting the hang of this" }),
    ).toBeTruthy();
  });

  it("stays when the second try fails too", () => {
    const { rerender } = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();
    progress.completionFailed = true;
    rerender_(rerender);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    progress.completionFailed = false;
    rerender_(rerender);

    progress.completionFailed = true;
    rerender_(rerender);

    expect(screen.getByRole("heading", { name: UNREAD })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("goes to the lessons on Back to my lessons, the check finished", () => {
    const { rerender } = render(<LessonPlayer lesson={LESSON} plan={null} live />);
    finishCheck();
    progress.completionFailed = true;
    rerender_(rerender);

    fireEvent.click(screen.getByRole("button", { name: "Back to my lessons" }));

    expect(push).toHaveBeenCalledWith("/student/lessons");
    expect(endings.at(-1)).toEqual({ completionStatus: "completed" });
  });
});
