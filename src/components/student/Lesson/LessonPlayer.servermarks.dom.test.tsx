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
import { MARK_WAIT_LINE, SEND_AGAIN, SLOW_MARK_MS } from "@/lib/lessons/verdict";
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

/**
 * 9B: offline, the answer the package marked is held, and goes up saying so -
 * `offlineMarked` with the version of the key it was marked against - where
 * the lesson was opened from its saved package, which gives the versions.
 */
describe("an answer marked on the device (9b)", () => {
  const VERSION = "c".repeat(64);
  const HELD = "nevo.lesson.pendingAnswers.stu-1";
  const held = () =>
    Object.values(
      JSON.parse(window.localStorage.getItem(HELD) ?? "{}") as Record<
        string,
        { body: Record<string, unknown> }
      >,
    ).map((h) => h.body);
  const openWith = async (lesson: Lesson) => {
    progress.opened = { sessionId: SESSION, resumed: true };
    render(<LessonPlayer lesson={lesson} plan={null} live />);
    await act(async () => {});
  };

  it("is held flagged, with its key's version, from a saved lesson", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await openWith({
      ...LESSON,
      markingKeyVersions: { [`checkpoint:${SEG_1}:cp-1`]: VERSION },
    });
    await pick("Key says right");

    expect(held()).toEqual([
      expect.objectContaining({
        problemId: "cp-1",
        offlineMarked: true,
        markingKeyVersion: VERSION,
        clientAttemptId: expect.any(String),
      }),
    ]);
  });

  it("is held plain from a lesson opened online, which has no versions", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await openWith(LESSON);
    await pick("Key says right");

    expect(held()).toHaveLength(1);
    expect(held()[0]).not.toHaveProperty("offlineMarked");
    expect(held()[0]).not.toHaveProperty("markingKeyVersion");
  });

  it("is never flagged when it went: the server marked it", async () => {
    await openWith({
      ...LESSON,
      markingKeyVersions: { [`checkpoint:${SEG_1}:cp-1`]: VERSION },
    });
    await pick("Key says right");

    const [, body] = api.saveAttempt.mock.calls[0];
    expect(body).not.toHaveProperty("offlineMarked");
    expect(held()).toEqual([]);
  });
});

/*
 * THE WAIT FOR A MARK (SCRUM-315; Lydia, 9 Nov, restated 10 Nov): one
 * neutral line past about two seconds, and the retry "only on a real failure
 * rather than on a timer", reading "Send again". A real failure is a send that
 * failed - no connection, the server erring - with nothing on the device to
 * mark it by: online, where the server holds the keys. Where the package does
 * carry a key, it marks the answer, as offline (5 Nov), and nothing is
 * offered. A refusal is not a failure.
 */
describe("the wait for a mark, and Send again on a real failure", () => {
  /** The check as an online read has it: the server holds its key. */
  const KEYLESS = {
    ...LESSON,
    segments: [
      { ...LESSON.segments[0], quickCheck: { ...CHECK, correctId: undefined } },
      LESSON.segments[1],
    ],
  } as unknown as Lesson;
  const openKeyless = async () => {
    progress.opened = { sessionId: SESSION, resumed: true };
    render(<LessonPlayer lesson={KEYLESS} plan={null} live />);
    await act(async () => {});
  };
  const sendAgain = () => screen.queryByRole("button", { name: SEND_AGAIN });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says her line past two seconds and offers nothing while the reply is only slow", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.saveAttempt.mockImplementation(() => new Promise(() => {}));
    await openKeyless();
    await pick("Key says wrong");

    expect(screen.queryByText(MARK_WAIT_LINE)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOW_MARK_MS);
    });
    expect(screen.getByText(MARK_WAIT_LINE)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOW_MARK_MS * 30);
    });
    expect(sendAgain()).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(continueButton()).toBeNull();
  });

  it("holds the pick and offers Send again when the send fails with no key to mark it", async () => {
    api.saveAttempt.mockRejectedValueOnce(new ApiError(503, "unavailable"));
    await openKeyless();
    await pick("Key says wrong");

    expect(sendAgain()).toBeInTheDocument();
    // Held: no way on, no verdict, and not the line - nothing is still working.
    expect(continueButton()).toBeNull();
    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
    expect(screen.queryByText(MARK_WAIT_LINE)).toBeNull();
  });

  it("sends the same answer again, under its own attempt id, and the first mark back decides", async () => {
    const lands: ((row: unknown) => void)[] = [];
    api.saveAttempt
      .mockRejectedValueOnce(new ApiError(0, "offline"))
      .mockImplementation(() => new Promise((resolve) => lands.push(resolve)));
    await openKeyless();
    await pick("Key says wrong");

    fireEvent.click(screen.getByRole("button", { name: SEND_AGAIN }));
    await act(async () => {});

    expect(api.saveAttempt).toHaveBeenCalledTimes(2);
    const [[, first], [, again]] = api.saveAttempt.mock.calls;
    // The same answer: the server stores it once.
    expect(again).toEqual(first);
    expect(sendAgain()).toBeNull();
    await act(async () => lands[0](reply(true)));
    expect(continueButton()).toBeInTheDocument();
    expect(streak()).toBe(0);
  });

  it("offers Send again again only when that send fails too", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await openKeyless();
    await pick("Key says wrong");

    fireEvent.click(screen.getByRole("button", { name: SEND_AGAIN }));
    await act(async () => {});

    expect(api.saveAttempt).toHaveBeenCalledTimes(2);
    expect(sendAgain()).toBeInTheDocument();
  });

  it("lets the package's key mark it where there is one, as offline, and offers nothing", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await open();
    await pick("Key says right");

    expect(sendAgain()).toBeNull();
    expect(continueButton()).toBeInTheDocument();
  });

  it("offers nothing on a refusal: sent again, it would be refused again", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(422, "refused"));
    await openKeyless();
    await pick("Key says wrong");

    expect(sendAgain()).toBeNull();
    // Unmarkable, as before: it holds no one.
    expect(continueButton()).toBeInTheDocument();
  });
});
