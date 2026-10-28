import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { GIVES_WAY_AFTER_MS } from "./QuickCheckSheet";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * `adjustmentDisposition` ON SCREEN (backend 864dff0; Teslim, 22 Oct, answer
 * 3): `retain` keeps the help on screen even when `proactiveAdjustment` is
 * null, only `clear` removes it, `apply` shows the new one - and active help
 * resent under its existing decision id is the same help: not offered again,
 * not counted again as applied, not drawn again, and not reopened once the
 * child has closed it.
 *
 * The real mid-lesson hook under the real player, as in `adaptsession`: only
 * the network is stood in for. Every miss on the check is a reason to ask
 * the engine again, and each ask gets the next answer in turn.
 */

const { getAdaptation, saveAttempt, trackEvent, answerGuided, applied } =
  vi.hoisted(() => ({
    getAdaptation: vi.fn(),
    saveAttempt: vi.fn(),
    trackEvent: vi.fn(),
    answerGuided: vi.fn(),
    /** The player's applied-adaptation count, as handed to the signals. */
    applied: {
      ref: null as { current: { count: number; lastAt: number | null } } | null,
    },
  }));
const progress = vi.hoisted(() => ({ sessionId: null as string | null }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  intelligenceApi: { getAdaptation },
}));
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: {
      ...actual.intelligenceApi,
      answerGuidedQuestion: (...a: unknown[]) => answerGuided(...a),
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
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    applied.ref = args[4] as typeof applied.ref;
    return { trackEvent };
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: progress.sessionId, report: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

const SESSION = "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff";
const LESSON_ID = "9c1e77aa-1111-4222-8333-444455556666";
const D1 = "11111111-2222-4333-8444-555555555555";
const D2 = "99999999-2222-4333-8444-555555555555";
const FULL = "The numerator is the number written above the line.";
const SHORT = "The top number.";
const HINT = "Look at which number sits above the line.";

const LESSON = {
  id: LESSON_ID,
  title: "Fractions",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Numerators", body: { default: FULL, simplify: SHORT } },
      quickCheck: {
        id: "cp-1",
        question: "Which number is on top?",
        options: [
          { id: "a", label: "The numerator", value: "a" },
          { id: "b", label: "The denominator", value: "b" },
        ],
        correctId: "a",
        correctNote: "Yes.",
        recoveryNote: "Not quite.",
      },
    },
    {
      id: "seg-2",
      modalities: ["text"],
      text: { heading: "Denominators", body: { default: "The bottom." } },
    },
  ],
} as unknown as Lesson;
const SEGMENTS = [
  { id: "seg-1", segmentType: "explanation" as const, availableModalities: ["text"] },
  { id: "seg-2", segmentType: "explanation" as const, availableModalities: ["text"] },
];

// ── The engine's answers ───────────────────────────────────────────────────
const answer = (over: Record<string, unknown> = {}) => ({
  lessonId: LESSON_ID,
  source: "rule_based",
  segments: [],
  breakSuggestion: { breakType: null, reason: null },
  proactiveAdjustment: null,
  modalitySuggestion: null,
  ...over,
});
const offer = (text = HINT) => ({
  action: "offer_hint",
  reason: "Two marked misses on this question.",
  hint: text,
  segmentId: "seg-1",
});
const SIMPLIFY = { action: "simplify", reason: "r", segmentId: "seg-1" };
const QUESTION = "What does the top number count?";
const PANEL = {
  action: "show_socratic_panel",
  reason: "r",
  guidedQuestions: [QUESTION],
  guidedPrompts: [{ id: "gq-0", prompt: QUESTION }],
  segmentId: "seg-1",
};
const CLEAR = answer({ adjustmentDisposition: "clear" });
const RETAIN = answer({ adjustmentDisposition: "retain" });
const apply = (adjustment: unknown, decisionId = D1) =>
  answer({
    proactiveAdjustment: adjustment,
    decisionId,
    adjustmentDisposition: "apply",
  });
const resend = (adjustment: unknown) =>
  answer({
    proactiveAdjustment: adjustment,
    decisionId: D1,
    adjustmentDisposition: "retain",
  });

// ── The child ──────────────────────────────────────────────────────────────
let asks = 0;
/** The next ask, answered `res`, and that answer on screen. */
const answered = async (res: unknown) => {
  asks += 1;
  getAdaptation.mockResolvedValueOnce(res);
  return asks;
};
const landed = async (n: number) => {
  await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(n));
  await act(async () => {});
};
/** Opens on the first section, the arrival's ask answered `first`. */
const open = async (first: unknown) => {
  const n = await answered(first);
  render(
    <LessonPlayer lesson={LESSON} plan={null} live adaptSegments={SEGMENTS} />,
  );
  await landed(n);
};
/**
 * Asked again as a child is now (26 Oct): the miss holds a beat and the
 * sheet gives way, then Next opens the check afresh. No Try again any more.
 */
const askAgain = async () => {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
    timeout: GIVES_WAY_AFTER_MS + 2000,
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};
/*
 * Each miss now holds a beat and gives way before the check is asked again
 * (`askAgain`), so these runs of three to five misses take longer than the
 * default five seconds.
 */
vi.setConfig({ testTimeout: 30_000 });
const sheet = () => screen.getByRole("dialog");
/** A miss on the check, and the engine's answer to the ask it makes. */
const missAnswered = async (res: unknown) => {
  const n = await answered(res);
  fireEvent.click(within(sheet()).getByRole("button", { name: /The denominator/ }));
  await landed(n);
  await askAgain();
};
const hintInSheet = () => within(sheet()).queryByText(HINT);
const offered = () =>
  trackEvent.mock.calls.filter((c) => c[0] === "hint_offered").length;
const appliedCount = () => applied.ref?.current.count;
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  asks = 0;
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  getAdaptation.mockReset();
  answerGuided.mockReset().mockResolvedValue({ recorded: true });
  saveAttempt.mockReset().mockResolvedValue({
    id: "att-1",
    lessonId: LESSON_ID,
    sessionId: SESSION,
    questionId: "cp-1",
    segmentId: "seg-1",
    source: "checkpoint",
    attemptNumber: 1,
    question: {},
    answer: "b",
    correct: false,
    submittedAt: "2026-10-22T12:00:00Z",
    resultState: "nothing_landed",
    handoffTo: null,
    guidedPrompts: [],
    advanceAfterHandoff: false,
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
});

/** Into the check, and the two-miss hint arriving in it (SCRUM-277, #849). */
const hintArrives = async () => {
  await open(CLEAR);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await missAnswered(CLEAR);
  await missAnswered(apply(offer()));
  const card = hintInSheet();
  expect(card).toBeTruthy();
  expect(offered()).toBe(1);
  expect(appliedCount()).toBe(1);
  return card;
};

describe("retain keeps the help on screen", () => {
  it("keeps the hint in the open check through a retain with no instruction", async () => {
    const card = await hintArrives();

    await missAnswered(RETAIN);

    // Redrawn as the sheet opens again after each miss gives way (26 Oct);
    // the same hint, and still offered once.
    expect(hintInSheet()?.textContent).toBe(card?.textContent);
    expect(offered()).toBe(1);
    expect(appliedCount()).toBe(1);
  });

  it("keeps the engine's Simplify through a retain with no instruction, counted once", async () => {
    await open(apply(SIMPLIFY));
    expect(text()).toContain(SHORT);
    expect(appliedCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // A cooldown: nothing new, and the reshape is still the engine's word.
    await missAnswered(RETAIN);
    expect(text()).toContain(SHORT);
    expect(text()).not.toContain(FULL);

    // The same reshape resent under its decision id is not a second one.
    await missAnswered(resend(SIMPLIFY));
    expect(text()).toContain(SHORT);
    expect(appliedCount()).toBe(1);
  });
});

describe("help resent under its decision id is not new", () => {
  it("is offered once, counted once and drawn once, however often it is resent", async () => {
    const card = await hintArrives();

    await missAnswered(RETAIN);
    await missAnswered(resend(offer()));
    await missAnswered(resend(offer()));

    // Redrawn as the sheet opens again after each miss gives way (26 Oct);
    // the same hint, and still offered once.
    expect(hintInSheet()?.textContent).toBe(card?.textContent);
    expect(offered()).toBe(1);
    expect(appliedCount()).toBe(1);
  });

  it("leaves the engine's own panel as the child left it: not redrawn, re-shown or abandoned", async () => {
    await open(apply(PANEL));
    expect(appliedCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));
    // A prompt opened, mid-thought, and the check opened over it.
    fireEvent.click(screen.getByRole("button", { name: QUESTION }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await missAnswered(RETAIN);
    await missAnswered(resend(PANEL));

    // Not left, still open where the child left it, nothing said again.
    expect(answerGuided).not.toHaveBeenCalled();
    expect(screen.getByText(/think it through/i)).toBeTruthy();
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "guided_question_shown"),
    ).toHaveLength(1);
    expect(appliedCount()).toBe(1);
  });

  it("stays closed once the child has closed it", async () => {
    await hintArrives();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close hint" }));
    expect(hintInSheet()).toBeNull();

    await missAnswered(RETAIN);
    await missAnswered(resend(offer()));

    expect(hintInSheet()).toBeNull();
    expect(text()).not.toContain(HINT);
    expect(offered()).toBe(1);
  });
});

describe("clear and apply, over help a retain kept", () => {
  it("clear removes it", async () => {
    await hintArrives();
    await missAnswered(RETAIN);
    expect(hintInSheet()).toBeTruthy();

    await missAnswered(CLEAR);

    expect(text()).not.toContain(HINT);
  });

  it("apply shows a new one in its place", async () => {
    await hintArrives();
    await missAnswered(RETAIN);
    expect(hintInSheet()).toBeTruthy();

    await missAnswered(apply(offer("Count the parts first."), D2));

    expect(within(sheet()).getByText("Count the parts first.")).toBeTruthy();
    expect(text()).not.toContain(HINT);
    // A different hint is a new offer.
    expect(offered()).toBe(2);
  });
});

/*
 * THE TWO-MISS HINT AS 97161f2 DELIVERS IT (SCRUM-277): `offer_hint` in the
 * adapt answer after two marked misses, drawn in the open check (#849);
 * repeat asks RETAIN it under the same decision id; a solved question clears
 * it on the next answer.
 */
describe("the two-miss hint, end to end", () => {
  it("is in the check, held without its events again, and gone once the question is solved", async () => {
    const card = await hintArrives();
    await missAnswered(resend(offer()));
    // Redrawn as the sheet opens again after each miss gives way (26 Oct);
    // the same hint, and still offered once.
    expect(hintInSheet()?.textContent).toBe(card?.textContent);
    expect(offered()).toBe(1);
    expect(appliedCount()).toBe(1);

    const n = await answered(CLEAR);
    fireEvent.click(within(sheet()).getByRole("button", { name: /The numerator/ }));
    await landed(n);

    expect(within(sheet()).getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(text()).not.toContain(HINT);
  });
});
