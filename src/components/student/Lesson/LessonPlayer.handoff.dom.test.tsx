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
import { ApiError } from "@/lib/api/client";
import type { Lesson } from "@/lib/types";

/**
 * B94 / SCRUM-241, frame 38a: the quick check gives way to the Socratic
 * panel when the SERVER says so, on its reply to a miss - "the front end
 * never counts attempts and never decides for itself". The panel arrives
 * open, with the server's prompts and nothing to accept or decline, and once
 * they are worked through the child goes "forward, never back to the
 * question". B128, 13 Oct: `advanceAfterHandoff` "is true whenever a
 * Socratic handoff exists. False means there is no handoff." What the child
 * did is reported as it was: "a concept reached this way is never recorded as
 * mastered first time".
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

const { trackEvent, recordReview, saveAttempt, answerGuided, applied } =
  vi.hoisted(() => ({
    trackEvent: vi.fn(),
    recordReview: vi.fn(),
    saveAttempt: vi.fn(),
    answerGuided: vi.fn(),
    /** The player's applied-adaptation count, as handed to the signals. */
    applied: {
      ref: null as { current: { count: number; lastAt: number | null } } | null,
    },
  }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    applied.ref = args[4] as typeof applied.ref;
    return { trackEvent };
  },
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({
    offeredBreak: null,
    reason: null,
    plan: null,
  }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: (...a: unknown[]) => recordReview(...a) },
}));
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/intelligence")>();
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
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const QUICK_CHECK = {
  id: "cp-inline",
  question: "Which number is on top?",
  options: [
    { id: "a", label: "The numerator", value: "a" },
    { id: "b", label: "The denominator", value: "b" },
  ],
  correctId: "a",
  correctNote: "Yes.",
  recoveryNote: "Not quite.",
  conceptId: "concept-1",
  // Reviewed: misses run up on a check that holds.
  holds: true,
};

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    { id: SEG_1, ...text("Numerators"), quickCheck: QUICK_CHECK },
    { id: SEG_2, ...text("Denominators") },
  ],
} as unknown as Lesson;

const PROMPT = "What does the bottom number count?";

/** The stored attempt, as the server answers it. */
const reply = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-inline",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 3,
  question: {},
  answer: "b",
  correct: false,
  submittedAt: "2026-10-08T10:00:00Z",
  resultState: "nothing_landed",
  ...over,
});
const HANDOFF = {
  handoffTo: "socratic_panel",
  guidedPrompts: [{ id: "p-1", prompt: PROMPT }],
  advanceAfterHandoff: true,
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
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const miss = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: /The denominator/ }),
  );
const checkOnScreen = () => screen.queryByText("Which number is on top?");
/**
 * The hand-off is OFFERED, never opened for the child (Lydia, 7 Nov, her 12:
 * "The box offers, the child takes it"): "Talk it through", taken.
 */
const talkThrough = async (prompt: string = PROMPT) => {
  fireEvent.click(await screen.findByRole("button", { name: "Talk it through" }));
  return screen.findByText(prompt);
};
/**
 * Out of a miss whose mark is still on its way. Since test 9 a miss waits for
 * its reply before it gives way, so a second answer in flight beside it is
 * one given after a tap out.
 */
const tapOutWhileMarked = async () => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

/** Answer the panel's one write-in prompt. */
/** Answered, and the server's reply (here, not marked) followed. */
const workThrough = async () => {
  fireEvent.click(screen.getByRole("button", { name: PROMPT }));
  fireEvent.change(screen.getByRole("textbox", { name: PROMPT }), {
    target: { value: "The parts" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await act(async () => {});
};

beforeEach(() => {
  progress.report.mockReset();
  progress.sessionId = SESSION;
  progress.completionSaved = false;
  trackEvent.mockReset();
  recordReview.mockReset().mockResolvedValue({});
  saveAttempt.mockReset().mockResolvedValue(reply());
  answerGuided.mockReset().mockResolvedValue({ promptId: "p-1" });
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

describe("the server hands a child off from the quick check (B94)", () => {
  it("closes the check and opens the panel with the server's prompts", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    await miss();

    expect(await talkThrough()).toBeTruthy();
    await waitFor(() => expect(checkOnScreen()).toBeNull());
    // It arrives: nothing to accept or decline, no count of tries.
    expect(screen.getByText(/think it through/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /not now|yes/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ (tries|attempts)/i);
    expect(trackEvent).toHaveBeenCalledWith("guided_question_shown", {
      segmentId: SEG_1,
      promptId: "p-1",
    });
  });

  it("moves on into the next segment once the prompts are worked through", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await talkThrough();

    await workThrough();
    expect(screen.getByText("Let's keep going.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    // Forward, an ordinary segment, and the panel gone with the check.
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(checkOnScreen()).toBeNull();
    // The reply went up as its length, never the words.
    expect(answerGuided).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: "p-1", responseLength: 9 }),
    );
  });

  it("does not send the child back into the check it moved them past", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await talkThrough();
    await workThrough();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    next();

    expect(checkOnScreen()).toBeNull();
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    // And no panel arrives again on the way back through.
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it("goes forward, not back into the check, when the child closes the panel and taps Next", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await talkThrough();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    next();

    // Forward - no check sheet, no old wrong pick, no "Not quite."
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
    expect(checkOnScreen()).toBeNull();
    expect(screen.queryByText("Not quite.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // And on the way back through, neither the check nor the panel again.
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.queryByText(PROMPT)).toBeNull();
    next();
    expect(checkOnScreen()).toBeNull();
    expect(screen.getByText("Body of Denominators.")).toBeTruthy();
  });

  it("is never the check passed when the child closes the panel and moves on", async () => {
    const REVIEW = { ...LESSON, assessment: undefined } as unknown as Lesson;
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    // The review's completion lands, so the scheduler is told (Teslim, 19 Oct).
    progress.completionSaved = true;
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    next();
    await miss();
    await talkThrough();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    next();
    next();

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        outcome: "not_recalled",
        sessionId: SESSION,
      }),
    );
  });

  it.each([
    ["false", { advanceAfterHandoff: false }],
    [
      "absent, the contract's default false",
      { advanceAfterHandoff: undefined },
    ],
  ])(
    "opens no panel when advanceAfterHandoff is %s: there is no hand-off (B128)",
    async (_, over) => {
      saveAttempt.mockResolvedValue(reply({ ...HANDOFF, ...over }));
      render(<LessonPlayer lesson={LESSON} plan={null} live />);
      next();

      await miss();
      await new Promise((r) => setTimeout(r, 0));

      // No panel that ends nowhere: the check stays, and is still the way on.
      expect(screen.queryByText(PROMPT)).toBeNull();
      expect(screen.queryByText(/think it through/i)).toBeNull();
      expect(checkOnScreen()).toBeTruthy();
      expect(applied.ref?.current.count).toBe(0);
    },
  );

  it("counts no misses of its own: without the server's word nothing hands off", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    for (let i = 0; i < 4; i++) {
      await miss();
      await askAgain();
    }
    await new Promise((r) => setTimeout(r, 0));

    expect(checkOnScreen()).toBeTruthy();
    expect(screen.queryByText(/think it through/i)).toBeNull();
  }, 20_000);

  it("draws nothing for a hand-off with no prompts (rule 5)", async () => {
    saveAttempt.mockResolvedValue(reply({ ...HANDOFF, guidedPrompts: [] }));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();

    await miss();
    await new Promise((r) => setTimeout(r, 0));

    expect(checkOnScreen()).toBeTruthy();
    expect(screen.queryByText(/think it through/i)).toBeNull();
  });

  it("ignores a hand-off for a miss the child has since answered right", async () => {
    let land: (row: unknown) => void = () => {};
    saveAttempt
      .mockImplementationOnce(() => new Promise((resolve) => (land = resolve)))
      .mockResolvedValueOnce(reply({ answer: "a", correct: true }));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    // Left while the miss is marked, and answered right on the way back.
    await tapOutWhileMarked();
    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    await act(async () => {});

    land(reply(HANDOFF));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(PROMPT)).toBeNull();
    // Still the check, answered right: its way on (Lydia, 25 Oct).
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });
});

describe("what a hand-off records (38a)", () => {
  it("is never the check passed when the child moves on through it", async () => {
    const REVIEW = { ...LESSON, assessment: undefined } as unknown as Lesson;
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    // The review's completion lands, so the scheduler is told (Teslim, 19 Oct).
    progress.completionSaved = true;
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
        live
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    next();
    await miss();
    await talkThrough();
    await workThrough();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        outcome: "not_recalled",
        sessionId: SESSION,
      }),
    );
  });
});

describe("a hand-off panel is an adaptation applied (B74)", () => {
  it("counts once when it renders", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    expect(applied.ref?.current.count).toBe(0);

    await miss();
    await talkThrough();

    expect(applied.ref?.current.count).toBe(1);
    expect(applied.ref?.current.lastAt).toEqual(expect.any(Number));
  });

  it("counts once per segment, however often it arrives there", async () => {
    // Two misses in flight, and the server hands off on both replies: the
    // panel arrives again, and it is the same panel applied once.
    const lands: ((row: unknown) => void)[] = [];
    saveAttempt.mockImplementation(
      () => new Promise((resolve) => lands.push(resolve)),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await tapOutWhileMarked();
    next();
    await miss();

    lands[0](reply(HANDOFF));
    expect(await talkThrough()).toBeTruthy();
    lands[1](reply({ ...HANDOFF, attemptNumber: 4 }));
    await act(async () => {});
    // A second hand-off is an offer (her 12), and the panel is already open:
    // nothing reopens it, and the one panel is counted once.
    expect(
      trackEvent.mock.calls.filter((c) => c[0] === "guided_question_shown"),
    ).toHaveLength(1);
    expect(applied.ref?.current.count).toBe(1);
  });

  it("counts nothing where no hand-off came", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await new Promise((r) => setTimeout(r, 0));

    expect(applied.ref?.current.count).toBe(0);
  });
});

/*
 * THE HAND-OFF'S STEPS, MARKED (audit, 2 Nov; backend `guided_panel.py`).
 * A hand-off's prompts carry their answer type and choices; they were cut
 * down to id and words, so every step drew as a write-in and went up as a
 * length, which the server refuses (422 `guided_answer_required`).
 */
describe("a hand-off's steps, answered and marked by the server", () => {
  const CHOICE = {
    id: "gq-a",
    prompt: "Which part names the size of each piece?",
    answerType: "single_choice",
    options: [
      { label: "The top number", value: "top" },
      { label: "The bottom number", value: "bottom" },
    ],
  };

  it("draws a step's choices and sends the one picked by its value", async () => {
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, guidedPrompts: [CHOICE] }),
    );
    answerGuided.mockResolvedValue({
      promptId: "gq-a",
      correct: true,
      panelComplete: true,
    });
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    // Offered, and taken (her 12).
    fireEvent.click(await screen.findByRole("button", { name: "Talk it through" }));
    fireEvent.click(await screen.findByRole("button", { name: CHOICE.prompt }));
    fireEvent.click(screen.getByRole("radio", { name: "The bottom number" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {});

    expect(answerGuided).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: "gq-a", option: "bottom" }),
    );
    expect(screen.getByText("Let's keep going.")).toBeInTheDocument();
  });

  it("asks a step again after a miss, with its explanation only once the retry is missed too", async () => {
    // Lydia, 4 Nov: "the explanation is held back until after the retry".
    const WHY = "The bottom number says how many equal pieces make the whole.";
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, guidedPrompts: [CHOICE] }),
    );
    answerGuided.mockResolvedValue({
      promptId: "gq-a",
      correct: false,
      panelComplete: false,
      prompt: { id: "gq-a", prompt: CHOICE.prompt },
      feedback: WHY,
    });
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    // Offered, and taken (her 12).
    fireEvent.click(await screen.findByRole("button", { name: "Talk it through" }));
    fireEvent.click(await screen.findByRole("button", { name: CHOICE.prompt }));
    fireEvent.click(screen.getByRole("radio", { name: "The top number" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {});

    expect(screen.queryByText(WHY)).toBeNull();
    expect(
      screen.getByRole("radio", { name: "The top number" }),
    ).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("radio", { name: "The top number" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {});

    expect(
      screen.getByText("Let's come at it a different way."),
    ).toBeInTheDocument();
    expect(screen.getByText(WHY)).toBeInTheDocument();
  });

  it("asks a step again in the words the server sends for it after a miss (reaskPrompt)", async () => {
    const REASK = "Which number tells you how many equal pieces there are?";
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, guidedPrompts: [CHOICE] }),
    );
    answerGuided.mockResolvedValue({
      promptId: "gq-a",
      correct: false,
      panelComplete: false,
      prompt: { id: "gq-a", prompt: REASK },
      feedback: null,
    });
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    // Offered, and taken (her 12).
    fireEvent.click(await screen.findByRole("button", { name: "Talk it through" }));
    fireEvent.click(await screen.findByRole("button", { name: CHOICE.prompt }));
    fireEvent.click(screen.getByRole("radio", { name: "The top number" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {});

    expect(
      screen.getByText("Let's come at it a different way."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REASK })).toBeInTheDocument();
  });

  it("never takes another step's prompt, or a right answer's next one, as a re-ask", async () => {
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, guidedPrompts: [CHOICE] }),
    );
    answerGuided.mockResolvedValue({
      promptId: "gq-a",
      correct: false,
      panelComplete: false,
      prompt: { id: "gq-b", prompt: "Some other step's question?" },
      feedback: null,
    });
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    // Offered, and taken (her 12).
    fireEvent.click(await screen.findByRole("button", { name: "Talk it through" }));
    fireEvent.click(await screen.findByRole("button", { name: CHOICE.prompt }));
    fireEvent.click(screen.getByRole("radio", { name: "The top number" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {});

    expect(screen.queryByText("Some other step's question?")).toBeNull();
    expect(
      screen.getByRole("button", { name: CHOICE.prompt }),
    ).toBeInTheDocument();
  });

  it("opens the step the server is asking when a 409 says another was out of turn", async () => {
    const SECOND = {
      id: "gq-b",
      prompt: "So what does 4 count here?",
      answerType: "numeric",
    };
    saveAttempt.mockResolvedValue(
      reply({ ...HANDOFF, guidedPrompts: [CHOICE, SECOND] }),
    );
    answerGuided.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: {
          code: "guided_step_out_of_order",
          prompt: { id: "gq-a", prompt: CHOICE.prompt },
        },
      }),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    // Offered, and taken (her 12).
    fireEvent.click(await screen.findByRole("button", { name: "Talk it through" }));
    fireEvent.click(await screen.findByRole("button", { name: SECOND.prompt }));
    fireEvent.change(screen.getByRole("textbox", { name: SECOND.prompt }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {});

    expect(answerGuided).toHaveBeenCalledWith(
      expect.objectContaining({ promptId: "gq-b", answer: "4" }),
    );
    expect(
      screen.getByRole("radio", { name: "The top number" }),
    ).toBeInTheDocument();
  });

  it("shows a several-answer step as a question to think about, with nothing to send", async () => {
    saveAttempt.mockResolvedValue(
      reply({
        ...HANDOFF,
        guidedPrompts: [{ ...CHOICE, answerType: "multiple_choice" }],
      }),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await talkThrough(CHOICE.prompt);

    expect(screen.queryByRole("button", { name: CHOICE.prompt })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

/**
 * LYDIA, 7 NOV, HER 12: at the third miss the box shows the "Talk it through"
 * button, and the panel must NOT open by itself - "The box offers, the child
 * takes it."
 */
describe("Talk it through, offered at the third miss (her 12)", () => {
  it("never opens the panel by itself: the check stays, offering it, past the give-way", async () => {
    saveAttempt.mockResolvedValue(reply(HANDOFF));
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await act(async () => {});

    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(checkOnScreen()).toBeTruthy();
    // Longer than a miss is held: the offer is not taken away.
    await new Promise((r) => setTimeout(r, GIVES_WAY_AFTER_MS + 300));
    expect(screen.getByRole("button", { name: "Talk it through" })).toBeInTheDocument();
    expect(screen.queryByText(PROMPT)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Talk it through" }));

    expect(await screen.findByText(PROMPT)).toBeTruthy();
    await waitFor(() => expect(checkOnScreen()).toBeNull());
  });

  it("is not offered where the server handed nothing off", async () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    await miss();
    await act(async () => {});

    expect(screen.queryByRole("button", { name: "Talk it through" })).toBeNull();
  });
});
