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
import { lessonFromContent } from "@/lib/lessons/fromContent";
import { SEND_AGAIN } from "@/lib/lessons/verdict";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * 8 NOV, LIVE: #1039 WAS LIVE AND STILL NO CHILD WAS ASKED A QUESTION.
 *
 * The server strips every answer key from an online student lesson (41c2f83),
 * and the builder still dropped any check without one - so the sheet that
 * moves on the server's mark never opened. These run the REAL path: the wire
 * lesson as the server sends it (no `answerKey`, no `acceptedAnswers`, no
 * `explanation` - absent, not null), through `lessonFromContent` as an online
 * read builds it, into the player.
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

const section = (
  id: string,
  order: number,
  title: string,
  checks: unknown[],
): ContentSegment =>
  ({
    id,
    segmentKey: `s${order}`,
    contentType: "explanatory_text",
    sequenceOrder: order,
    title,
    body: "Body.",
    availableModalities: ["text"],
    // As the server sends them online: the key, accepted answers and
    // explanation held back - the fields are not there at all.
    comprehensionCheckpoints: checks,
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    needsReview: false,
    reviewReasons: [],
  }) as unknown as ContentSegment;

const WIRE = {
  id: "lesson-1",
  title: "Heat Transfer",
  confirmationSummary: null,
  segments: [
    section(SEG_1, 1, "Numerators", [
      {
        id: "cp-1",
        conceptId: null,
        conceptName: null,
        prompt: "Question 1?",
        answerType: "single_choice",
        options: [
          { value: "a", label: "First option" },
          { value: "b", label: "Second option" },
        ],
        position: "after_segment",
        teacherReviewed: true,
      },
    ]),
    section(SEG_2, 2, "Denominators", []),
  ],
  assessment: [],
} as unknown as LessonDetailResponse;

const LESSON = lessonFromContent(WIRE, [], { serverMarks: true })!;

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

describe("online, a check with no key is asked, and the server's mark is the only one", () => {
  it("asks it: the stripped check reaches the sheet", async () => {
    await open();
    next();

    expect(
      await screen.findByRole("button", { name: "First option" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second option" })).toBeInTheDocument();
  });

  it("passes on the server's right", async () => {
    api.saveAttempt.mockResolvedValue(reply(true));
    await open();
    await pick("Second option");

    expect(api.saveAttempt).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ problemId: "cp-1", answer: "b" }),
    );
    fireEvent.click(continueButton()!);
    expect(
      screen.getByRole("heading", { name: "Denominators" }),
    ).toBeInTheDocument();
  });

  it("holds on the server's wrong", async () => {
    api.saveAttempt.mockResolvedValue(reply(false));
    await open();
    await pick("First option");

    expect(continueButton()).toBeNull();
    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
  });

  it("never calls it wrong when no mark comes back: there is no key to fall back on", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await open();
    await pick("First option");

    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
    // A real failure with nothing to mark it by: the pick holds and the
    // child can send it again (Lydia, 9 Nov, restated 10 Nov).
    expect(continueButton()).toBeNull();
    expect(screen.getByRole("button", { name: SEND_AGAIN })).toBeInTheDocument();
  });

  it("counts no miss in the error streak for an answer nothing marked", async () => {
    api.saveAttempt.mockRejectedValue(new ApiError(0, "offline"));
    await open();
    await pick("First option");

    expect(streak()).toBe(0);
  });
});
