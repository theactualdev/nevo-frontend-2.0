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
import { GIVES_WAY_AFTER_MS } from "./QuickCheckSheet";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * WHICH CHECKS HOLD THE CHILD (Lydia, 26 Oct; Olayinka's go, 30 Oct).
 *
 * Only a check whose answer key a person wrote, or a teacher reviewed, holds
 * a child on its section - as the server says it (`teacherReviewed`, carried
 * here as `holds`). A generated, unreviewed key never gates: the check is
 * asked, and once the sheet has opened on it, Next takes the child on. Where
 * the server's own gate is on (`comprehensionGate.required`), its
 * `canAdvance` is followed over either.
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

const api = vi.hoisted(() => ({
  comprehension: vi.fn(),
  saveAttempt: vi.fn(),
  saveSegmentChoice: vi.fn(),
  attempts: vi.fn(),
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
      comprehension: (...a: unknown[]) => api.comprehension(...a),
      saveAttempt: (...a: unknown[]) => api.saveAttempt(...a),
      saveSegmentChoice: (...a: unknown[]) => api.saveSegmentChoice(...a),
      attempts: (...a: unknown[]) => api.attempts(...a),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const check = (n: number, holds: boolean) => ({
  id: `cp-${n}`,
  question: `Question ${n}?`,
  options: [
    { id: "r", label: `Right ${n}`, value: "r" },
    { id: "w", label: `Wrong ${n}`, value: "w" },
  ],
  correctId: "r",
  correctNote: `Yes, ${n}.`,
  recoveryNote: "Not quite.",
  holds,
});

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

const lessonWith = (checks: ReturnType<typeof check>[]) =>
  ({
    id: "lesson-1",
    title: "Fractions Lesson 3",
    segments: [
      {
        id: SEG_1,
        ...text("Numerators"),
        quickCheck: checks[0],
        ...(checks.length > 1 ? { quickChecks: checks } : {}),
      },
      { id: SEG_2, ...text("Denominators") },
    ],
  }) as unknown as Lesson;

const GATE_ON = { required: true, canAdvance: false, segmentId: SEG_1 };
const GATE_OPEN = { required: true, canAdvance: true, segmentId: SEG_1 };
const GATE_OFF = { required: false, canAdvance: true };

/** The server's reply to an answer, marked. */
const reply = (correct: boolean, gate: Record<string, unknown> | null) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-1",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 1,
  answer: correct ? "r" : "w",
  correct,
  submittedAt: "2026-10-30T12:00:00Z",
  ...(gate ? { comprehensionGate: gate } : {}),
});

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const sheet = () => screen.queryByRole("dialog");
const onSection = (heading: string) =>
  expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
const tapOut = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

/** Open the lesson with its sitting open, and let the gate's read land. */
const open = async (lesson: Lesson) => {
  progress.opened = { sessionId: SESSION, resumed: true };
  render(<LessonPlayer lesson={lesson} plan={null} live />);
  await act(async () => {});
};

/** Miss check `n`, and wait for the sheet to give way. */
const missAndGiveWay = async (n = 1) => {
  next();
  fireEvent.click(await screen.findByRole("button", { name: `Wrong ${n}` }));
  await act(async () => {});
  await waitFor(() => expect(sheet()).toBeNull(), {
    timeout: GIVES_WAY_AFTER_MS + 2000,
  });
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });
  progress.report.mockReset();
  progress.sessionId = SESSION;
  progress.saved = null;
  progress.opened = null;
  api.comprehension.mockReset().mockResolvedValue(GATE_OFF);
  api.saveAttempt.mockReset().mockResolvedValue(reply(false, GATE_OFF));
  api.saveSegmentChoice.mockReset().mockResolvedValue({});
  api.attempts.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("a check no person stands behind is asked, then the child goes on", () => {
  it("is still asked: Next opens the sheet on it first", async () => {
    await open(lessonWith([check(1, false)]));
    next();

    expect(
      await screen.findByRole("heading", { name: "Question 1?" }),
    ).toBeInTheDocument();
  });

  it("after a miss gives way, Next takes the child on to the next section", async () => {
    await open(lessonWith([check(1, false)]));
    await missAndGiveWay();
    onSection("Numerators");

    next();

    expect(sheet()).toBeNull();
    onSection("Denominators");
    // The miss was still stored as it was given.
    expect(api.saveAttempt).toHaveBeenCalledOnce();
  });

  it("after a tap out, Next takes the child on", async () => {
    await open(lessonWith([check(1, false)]));
    next();
    await screen.findByRole("dialog");
    tapOut();
    onSection("Numerators");

    next();

    expect(sheet()).toBeNull();
    onSection("Denominators");
    expect(api.saveAttempt).not.toHaveBeenCalled();
  });

  it("asks each of a section's checks once, then goes on", async () => {
    await open(lessonWith([check(1, false), check(2, false)]));
    next();
    await screen.findByRole("heading", { name: "Question 1?" });
    tapOut();

    next();
    expect(
      await screen.findByRole("heading", { name: "Question 2?" }),
    ).toBeInTheDocument();
    tapOut();

    next();
    expect(sheet()).toBeNull();
    onSection("Denominators");
  });

  it("is not asked again on the way back", async () => {
    await open(lessonWith([check(1, false)]));
    next();
    await screen.findByRole("dialog");
    tapOut();
    next();
    onSection("Denominators");

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    onSection("Numerators");
    next();

    expect(sheet()).toBeNull();
    onSection("Denominators");
  });

  it("still holds where a person stands behind the key: Next asks it again", async () => {
    await open(lessonWith([check(1, true)]));
    await missAndGiveWay();

    next();

    expect(
      await screen.findByRole("heading", { name: "Question 1?" }),
    ).toBeInTheDocument();
  });
});

describe("the server's own gate, where it is on, is followed", () => {
  it("holds an unreviewed check where the miss's reply says the section cannot be left", async () => {
    api.saveAttempt.mockResolvedValue(reply(false, GATE_ON));
    await open(lessonWith([check(1, false)]));
    await missAndGiveWay();

    next();

    expect(
      await screen.findByRole("heading", { name: "Question 1?" }),
    ).toBeInTheDocument();
  });

  it("lets a reviewed check go where the reply says the section can be left", async () => {
    api.saveAttempt.mockResolvedValue(reply(false, GATE_OPEN));
    await open(lessonWith([check(1, true)]));
    await missAndGiveWay();

    next();

    expect(sheet()).toBeNull();
    onSection("Denominators");
  });

  it("holds an unreviewed check from the sitting's own read", async () => {
    api.comprehension.mockResolvedValue(GATE_ON);
    await open(lessonWith([check(1, false)]));
    next();
    await screen.findByRole("dialog");
    tapOut();

    next();

    expect(
      await screen.findByRole("heading", { name: "Question 1?" }),
    ).toBeInTheDocument();
  });

  it("leaves it to the check where the gate is off", async () => {
    api.comprehension.mockResolvedValue(GATE_OFF);
    api.saveAttempt.mockResolvedValue(reply(false, GATE_OFF));
    await open(lessonWith([check(1, true)]));
    await missAndGiveWay();

    next();

    expect(
      await screen.findByRole("heading", { name: "Question 1?" }),
    ).toBeInTheDocument();
  });
});
