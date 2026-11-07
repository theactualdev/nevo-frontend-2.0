import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { RECOVERY_LINE } from "./QuickCheckSheet";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * TEST 9: THE SERVER MARKS (Lydia, 5 Nov; the hub, 6 Nov).
 *
 * Online, a check moves on the mark its answer's reply carries - `correct`
 * on the stored row - never on the lesson's own key. While that reply is on
 * its way the pick is held, quietly. Offline - no reply - the key still
 * marks, for now. And what follows from an answer follows its mark: the
 * error streak the engine is sent.
 *
 * Each case below is built so the server and the key DISAGREE, which is the
 * only way to tell whose mark the screen moved on.
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
/** Every set of observed facts the player handed the engine's hook. */
const adapt = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: (...a: unknown[]) => {
    adapt.calls.push(a);
    return { offeredBreak: null, reason: null, plan: null };
  },
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

/** A check whose lesson key says "Key says right" is right. */
const CHECK = {
  id: "cp-1",
  question: "Question 1?",
  options: [
    { id: "r", label: "Key says right", value: "r" },
    { id: "w", label: "Key says wrong", value: "w" },
  ],
  correctId: "r",
  correctNote: "Yes, that one.",
  recoveryNote: "Not quite.",
  holds: true,
};

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    {
      id: SEG_1,
      modalities: ["text"],
      text: { heading: "Numerators", body: { default: "Body." } },
      quickCheck: CHECK,
    },
    {
      id: SEG_2,
      modalities: ["text"],
      text: { heading: "Denominators", body: { default: "Body." } },
    },
  ],
} as unknown as Lesson;

/** The gate as production has it: off, and `canAdvance` true whatever the answer. */
const GATE_OFF = { required: false, canAdvance: true };

/** The server's reply to an answer, carrying ITS mark. */
const reply = (correct: boolean | null) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-1",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 1,
  answer: "r",
  correct,
  submittedAt: "2026-11-06T12:00:00Z",
  comprehensionGate: GATE_OFF,
});

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const continueButton = () =>
  screen.queryByRole("button", { name: "Continue" });
const pick = async (label: string) => {
  next();
  fireEvent.click(await screen.findByRole("button", { name: label }));
  await act(async () => {});
};
/** The error streak in the newest observed facts the engine's hook was given. */
const streak = () => {
  const facts = adapt.calls
    .at(-1)
    ?.find(
      (a): a is { consecutiveErrors: number } =>
        typeof a === "object" && a !== null && "consecutiveErrors" in a,
    );
  return facts?.consecutiveErrors;
};

const open = async () => {
  progress.opened = { sessionId: SESSION, resumed: true };
  render(<LessonPlayer lesson={LESSON} plan={null} live />);
  await act(async () => {});
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
  adapt.calls = [];
  api.comprehension.mockReset().mockResolvedValue(GATE_OFF);
  api.saveAttempt.mockReset().mockResolvedValue(reply(true));
  api.saveSegmentChoice.mockReset().mockResolvedValue({});
  api.attempts.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("online, a check moves on the server's mark, never the key's", () => {
  it("holds a pick the key calls right when the server marks it wrong", async () => {
    api.saveAttempt.mockResolvedValue(reply(false));
    await open();
    await pick("Key says right");

    expect(continueButton()).toBeNull();
    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
    expect(screen.queryByText(CHECK.correctNote)).toBeNull();
  });

  it("passes a pick the key calls wrong when the server marks it right", async () => {
    api.saveAttempt.mockResolvedValue(reply(true));
    await open();
    await pick("Key says wrong");

    expect(screen.getByText(CHECK.correctNote)).toBeInTheDocument();
    fireEvent.click(continueButton()!);
    expect(
      screen.getByRole("heading", { name: "Denominators" }),
    ).toBeInTheDocument();
  });

  it("is not let through by `canAdvance` with the gate off: production says true to every answer", async () => {
    // GATE_OFF rides on the reply: `canAdvance: true` beside a wrong mark.
    api.saveAttempt.mockResolvedValue(reply(false));
    await open();
    await pick("Key says right");

    expect(continueButton()).toBeNull();
  });

  it("offers the way on, and says nothing, for an answer the server could not mark", async () => {
    api.saveAttempt.mockResolvedValue(reply(null));
    await open();
    await pick("Key says wrong");

    expect(continueButton()).toBeInTheDocument();
    expect(screen.queryByText(CHECK.correctNote)).toBeNull();
    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
  });
});

describe("while the reply is on its way", () => {
  it("holds the pick quietly - no words, no way on - and takes no second answer", async () => {
    let land: (row: unknown) => void = () => {};
    api.saveAttempt.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    await open();
    await pick("Key says right");

    // The key would have said right by now. Nothing is said yet.
    expect(continueButton()).toBeNull();
    expect(screen.queryByText(CHECK.correctNote)).toBeNull();
    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Key says wrong" }));
    expect(api.saveAttempt).toHaveBeenCalledOnce();

    await act(async () => land(reply(true)));
    expect(continueButton()).toBeInTheDocument();
  });
});

describe("offline, the lesson's key still marks", () => {
  it("passes a pick the key calls right when the answer cannot go", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await open();
    await pick("Key says right");

    expect(continueButton()).toBeInTheDocument();
  });

  it("holds a pick the key calls wrong when the answer cannot go", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await open();
    await pick("Key says wrong");

    expect(continueButton()).toBeNull();
    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
  });
});

describe("the error streak the engine is sent (#10)", () => {
  it("counts the server's miss, not the key's right", async () => {
    api.saveAttempt.mockResolvedValue(reply(false));
    await open();
    expect(streak()).toBe(0);
    await pick("Key says right");

    expect(streak()).toBe(1);
  });

  it("counts nothing until the mark lands", async () => {
    api.saveAttempt.mockReturnValue(new Promise(() => {}));
    await open();
    await pick("Key says wrong");

    expect(streak()).toBe(0);
  });
});
