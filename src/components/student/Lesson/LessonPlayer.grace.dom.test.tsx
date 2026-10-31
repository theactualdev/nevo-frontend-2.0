import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { GIVES_WAY_AFTER_MS } from "./QuickCheckSheet";
import { clearSession, setSession } from "@/lib/auth/session";
import { noteServerClock, resetServerClock } from "@/lib/api/serverClock";
import type { Lesson } from "@/lib/types";

/**
 * THE GRACE WINDOW (Teslim, 22 Oct, answer 6; backend 7d97248).
 *
 * The Socratic panel now waits for the age band's window - 45s for Primary,
 * counted by the server from the first of three misses in a row - so the
 * third miss can come back with no `handoffTo` and a `handoffAvailableAt`
 * deadline instead. The server pushes nothing when its clock passes it; the
 * spec says "re-read attempts then if the question is still unresolved". So
 * the player reads the sitting's answers ONCE at that moment, on the
 * server's clock, and follows what comes back.
 *
 * The server here is a small stand-in for `question_support` and the
 * attempts routes: it marks each answer, keeps each question's run of
 * misses, names the deadline from the run's first miss, and hands off on any
 * read made at or after it - by ITS clock, which a test can set apart from
 * the device's.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const SEG_3 = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";
const T0 = Date.parse("2026-10-22T12:00:00Z");
const WINDOW_MS = 45_000;

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

type Attempt = {
  questionId: string;
  segmentId: string;
  correct: boolean;
  at: number;
  attemptNumber: number;
};
const { trackEvent, saveAttempt, attempts, server } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
  attempts: vi.fn(),
  server: {
    /** How far the DEVICE's clock is ahead of the server's. */
    deviceAheadMs: 0,
    /** Whether the questions carry guided prompts to hand off with. */
    guided: true,
    stored: [] as Attempt[],
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: {
      ...actual.intelligenceApi,
      answerGuidedQuestion: vi.fn().mockResolvedValue({}),
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
      attempts: (...a: unknown[]) => attempts(...a),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const check = (id: string, question: string) => ({
  id,
  question,
  options: [
    { id: "a", label: "The numerator", value: "a" },
    { id: "b", label: "The denominator", value: "b" },
  ],
  correctId: "a",
  correctNote: "Yes.",
  recoveryNote: "Not quite.",
  conceptId: "concept-1",
  // Reviewed: three misses on one check need a check that holds.
  holds: true,
});
const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});
const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    { id: SEG_1, ...text("Numerators"), quickCheck: check("cp-a", "Which is on top?") },
    { id: SEG_2, ...text("Denominators"), quickCheck: check("cp-b", "Which is below?") },
    { id: SEG_3, ...text("Wholes") },
  ],
} as unknown as Lesson;
const PROMPT: Record<string, string> = {
  "cp-a": "What does the top number count?",
  "cp-b": "What does the bottom number count?",
};

// ── The stand-in server ────────────────────────────────────────────────────
const serverNow = () => Date.now() - server.deviceAheadMs;
const iso = (ms: number) => new Date(ms).toISOString();

/** The run of misses on a question since its last right answer. */
const missRun = (questionId: string) => {
  const run: Attempt[] = [];
  for (const a of server.stored.filter((s) => s.questionId === questionId)) {
    if (a.correct) run.length = 0;
    else run.push(a);
  }
  return run;
};

/** A stored row as the attempts routes answer it, as of the server's now. */
const rowFor = (a: Attempt) => {
  const run = missRun(a.questionId);
  const deadline = run.length >= 3 ? run[0].at + WINDOW_MS : null;
  const handing = deadline !== null && serverNow() >= deadline && server.guided;
  return {
    id: `att-${a.questionId}-${a.attemptNumber}`,
    lessonId: "lesson-1",
    sessionId: SESSION,
    questionId: a.questionId,
    segmentId: a.segmentId,
    source: "checkpoint",
    attemptNumber: a.attemptNumber,
    question: {},
    answer: a.correct ? "a" : "b",
    correct: a.correct,
    submittedAt: iso(a.at),
    resultState: "nothing_landed",
    handoffTo: handing ? "socratic_panel" : null,
    guidedPrompts: handing
      ? [{ id: `${a.questionId}-guided-1`, prompt: PROMPT[a.questionId] }]
      : [],
    advanceAfterHandoff: handing,
    handoffAvailableAt: deadline === null ? null : iso(deadline),
  };
};

const store = (body: { problemId: string; segmentId: string; answer: string }) => {
  const a: Attempt = {
    questionId: body.problemId,
    segmentId: body.segmentId,
    correct: body.answer === "a",
    at: serverNow(),
    attemptNumber:
      server.stored.filter((s) => s.questionId === body.problemId).length + 1,
  };
  server.stored.push(a);
  return rowFor(a);
};

// ── The child ──────────────────────────────────────────────────────────────
const flush = () => act(async () => {});
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const player = () => <LessonPlayer lesson={LESSON} plan={null} live />;
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const pick = async (label: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await flush();
};
const miss = () => pick(/The denominator/);
const right = () => pick(/The numerator/);
/**
 * Asked again, the way a child is now (26 Oct): the miss is held a beat and
 * the sheet gives way, then Next opens the check afresh. There is no Try
 * again any more.
 */
const tryAgain = async () => {
  await wait(GIVES_WAY_AFTER_MS);
  next();
  await flush();
};
/** How long `missThrice` takes after its first miss: two give-ways. */
const ASKED_AGAIN_MS = 2 * GIVES_WAY_AFTER_MS;
/** Three misses in a row, the third left on screen. */
const missThrice = async () => {
  await miss();
  await tryAgain();
  await miss();
  await tryAgain();
  await miss();
};
/**
 * Off the section, and back, without passing its check: the chevrons under
 * the sheet, which holds the child on this base until SCRUM-275's own Keep
 * going lands beside it. The read is tied to the section, not to whichever
 * control leaves it.
 */
const previous = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Previous", hidden: true }),
  );
const nextBehind = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next", hidden: true }));
const reads = () => attempts.mock.calls.length;
const panelFor = (questionId: string) => screen.queryByText(PROMPT[questionId]);

/**
 * The first section's check: three misses, the panel at its deadline from
 * the one read, and on with Keep going - what every case below is measured
 * against, so a player that never reads fails them all.
 */
const handedOffAtDeadline = async () => {
  next();
  await missThrice();
  await wait(WINDOW_MS);
  expect(reads()).toBe(1);
  expect(panelFor("cp-a")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
  expect(screen.getByText("Body of Denominators.")).toBeTruthy();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(T0);
  resetServerClock();
  progress.sessionId = SESSION;
  server.deviceAheadMs = 0;
  server.guided = true;
  server.stored = [];
  trackEvent.mockReset();
  saveAttempt
    .mockReset()
    .mockImplementation(async (_lesson: string, body: never) => store(body));
  attempts
    .mockReset()
    .mockImplementation(async () => server.stored.map((a) => rowFor(a)));
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
  resetServerClock();
  vi.useRealTimers();
});

describe("the panel at the end of the grace window", () => {
  it("does not open on the third miss, then opens at the server's deadline from one read", async () => {
    render(player());
    next();
    await missThrice();

    // The server named a moment and handed nothing off.
    expect(saveAttempt).toHaveBeenCalledTimes(3);
    expect(panelFor("cp-a")).toBeNull();
    expect(screen.getByText("Which is on top?")).toBeTruthy();

    // The window runs from the run's FIRST miss.
    await wait(WINDOW_MS - ASKED_AGAIN_MS - 1);
    expect(reads()).toBe(0);
    expect(panelFor("cp-a")).toBeNull();

    await wait(1);
    expect(reads()).toBe(1);
    expect(attempts).toHaveBeenCalledWith("lesson-1", SESSION);
    // The server's hand-off, followed as a write's is: the check gives way.
    expect(panelFor("cp-a")).toBeTruthy();
    expect(screen.queryByText("Which is on top?")).toBeNull();

    // One read, and never a loop.
    await wait(10 * 60_000);
    expect(reads()).toBe(1);
  });

  it("does nothing more when the read hands nothing off: no panel, and no second read", async () => {
    server.guided = false;
    render(player());
    next();
    await missThrice();

    await wait(WINDOW_MS);
    expect(reads()).toBe(1);
    expect(panelFor("cp-a")).toBeNull();
    // The miss gave way long ago; the child is on the section, nothing new.
    expect(screen.queryByRole("dialog")).toBeNull();

    await wait(10 * 60_000);
    expect(reads()).toBe(1);
  });

  it("reads once for the run, however many misses name its deadline", async () => {
    render(player());
    next();
    await missThrice();
    await wait(10_000);
    // A fourth miss names the same moment: the run's first miss set it.
    await tryAgain();
    await miss();

    await wait(WINDOW_MS - 10_000);
    expect(reads()).toBe(1);
    expect(panelFor("cp-a")).toBeTruthy();
    await wait(10 * 60_000);
    expect(reads()).toBe(1);
  });

  it("waits on the server's clock, not the device's", async () => {
    // A device 10s ahead of the server, as the `Date` header says.
    server.deviceAheadMs = 10_000;
    noteServerClock({
      headers: new Headers({ Date: new Date(serverNow()).toUTCString() }),
    } as Response);
    render(player());
    next();
    await missThrice();

    // By the device's own clock the deadline is 10s off already.
    await wait(WINDOW_MS - ASKED_AGAIN_MS - 10_000);
    expect(reads()).toBe(0);
    await wait(10_000 - 1);
    expect(reads()).toBe(0);

    await wait(1);
    expect(reads()).toBe(1);
    expect(panelFor("cp-a")).toBeTruthy();
  });
});

describe("no read once the question is no longer open", () => {
  it("is not made for a question answered right before its deadline", async () => {
    render(player());
    await handedOffAtDeadline();
    next();
    await missThrice();
    await wait(10_000);
    await tryAgain();
    await right();

    await wait(10 * 60_000);
    expect(reads()).toBe(1);
    expect(panelFor("cp-b")).toBeNull();
  });

  it("is not made once the child has left the section", async () => {
    render(player());
    await handedOffAtDeadline();
    next();
    await missThrice();
    previous();
    expect(screen.getByText("Body of Numerators.")).toBeTruthy();

    await wait(10 * 60_000);
    expect(reads()).toBe(1);
    // And nothing waits to open when they come back.
    nextBehind();
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    expect(panelFor("cp-b")).toBeNull();
  });

  /*
   * A miss giving way is the system's move, so the question stays open (the
   * first case above reads at the deadline after it). Tapping out is the
   * child's, and ends it, as it always has.
   */
  it("is not made once the child taps out of the check, asked again after a miss gave way", async () => {
    render(player());
    await handedOffAtDeadline();
    next();
    await missThrice();
    await wait(GIVES_WAY_AFTER_MS);
    next();
    await flush();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await flush();

    await wait(10 * 60_000);
    expect(reads()).toBe(1);
    expect(panelFor("cp-b")).toBeNull();
  });

  it("is not set for a third miss whose answer lands after the child has left", async () => {
    render(player());
    await handedOffAtDeadline();
    next();
    await miss();
    await tryAgain();
    await miss();
    await tryAgain();
    let land: () => void = () => {};
    saveAttempt.mockImplementationOnce(
      (_lesson: string, body: never) =>
        new Promise((resolve) => (land = () => resolve(store(body)))),
    );
    await miss();
    previous();
    land();
    await flush();

    await wait(10 * 60_000);
    expect(reads()).toBe(1);
  });

  it("is not followed when the child leaves while it is on its way", async () => {
    render(player());
    await handedOffAtDeadline();
    next();
    await missThrice();
    let answer: () => void = () => {};
    attempts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(server.stored.map((a) => rowFor(a)));
        }),
    );
    await wait(WINDOW_MS);
    expect(reads()).toBe(2);

    previous();
    answer();
    await flush();
    nextBehind();

    // Not handed off behind their back: the check is still the way on.
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    expect(panelFor("cp-b")).toBeNull();
  });

  it("is not made once the lesson has unmounted", async () => {
    const first = render(player());
    next();
    await missThrice();
    first.unmount();
    await wait(10 * 60_000);
    expect(reads()).toBe(0);

    // The same three misses, still mounted: the one read.
    server.stored = [];
    render(player());
    next();
    await missThrice();
    await wait(WINDOW_MS);
    expect(reads()).toBe(1);
  });
});
