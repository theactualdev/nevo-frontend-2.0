import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { RECOVERY_LINE } from "./QuickCheckSheet";
import { clearSession, setSession } from "@/lib/auth/session";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * SCRUM-275 #1 (Lydia, 21 Oct, over frame 38's sheet at the foot):
 * - "The panel does not cover Back and Next. It sits above them."
 * - "Keep going is present and pressable from the moment the panel opens,
 *   before anything is answered."
 * - "A panel the child opened themselves, on a section with no unpassed
 *   check, is closed by the child. No completion condition."
 * And Teslim, 21 Oct: with no guided questions stored for the failed
 * question, "no dialogue is sent" - so none is drawn.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const SEG_3 = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

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

const { trackEvent, saveAttempt, answerGuided, runtime } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
  answerGuided: vi.fn(),
  runtime: {
    value: {
      offeredBreak: null,
      reason: null,
      plan: null as unknown,
      forSegmentId: null as string | null,
    },
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
  useRuntimeAdaptation: () => runtime.value,
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
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
};

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

// The check is on the middle section, so Previous has somewhere to go.
const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    { id: SEG_1, ...text("Numerators") },
    { id: SEG_2, ...text("Denominators"), quickCheck: QUICK_CHECK },
    { id: SEG_3, ...text("Equivalence") },
  ],
} as unknown as Lesson;

const PROMPT = "What does the bottom number count?";

/** The stored attempt, as the server answers it. */
const reply = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-inline",
  segmentId: SEG_2,
  source: "checkpoint",
  attemptNumber: 3,
  question: {},
  answer: "b",
  correct: false,
  submittedAt: "2026-10-21T10:00:00Z",
  resultState: "nothing_landed",
  ...over,
});
const HANDOFF = {
  handoffTo: "socratic_panel",
  guidedPrompts: [{ id: "p-1", prompt: PROMPT }],
  advanceAfterHandoff: true,
};

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const miss = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: /The denominator/ }),
  );

/** To the checked section, into its check, a miss, and the hand-off. */
const handedOff = async () => {
  saveAttempt.mockResolvedValue(reply(HANDOFF));
  render(<LessonPlayer lesson={LESSON} plan={null} live />);
  next();
  next();
  await miss();
  await screen.findByText(PROMPT);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

const dock = () => document.querySelector<HTMLElement>("[data-panel-dock]");

beforeEach(() => {
  progress.sessionId = SESSION;
  trackEvent.mockReset();
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
  runtime.value = {
    offeredBreak: null,
    reason: null,
    plan: null,
    forSegmentId: null,
  };
});

describe("the panel sits above Back and Next, never over them", () => {
  it("opens into the row directly above the arrows, not over the screen", async () => {
    await handedOff();

    const row = dock();
    expect(row).not.toBeNull();
    expect(row!.contains(screen.getByText(/think it through/i))).toBe(true);
    // The row is the arrows' own neighbour, above them in the column.
    expect(row!.nextElementSibling).toBe(screen.getByRole("navigation"));
  });

  it("leaves Back and Next in the accessibility tree, and Previous works with it open", async () => {
    await handedOff();

    const nav = screen.getByRole("navigation");
    expect(nav).not.toHaveAttribute("aria-hidden");
    expect(nav).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous).toBeEnabled();

    fireEvent.click(previous);

    expect(screen.getByText("Body of Numerators.")).toBeTruthy();
  });

  it("leaves Next working with it open: forward, as the hand-off goes", async () => {
    await handedOff();

    next();

    expect(screen.getByText("Body of Equivalence.")).toBeTruthy();
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  /*
   * Mobile, tablet and desktop alike (d6b9fbc draws all three): jsdom lays
   * nothing out, so the classes that keep it above the arrows are pinned -
   * the row and the panel in flow at every breakpoint, the row free to give
   * way and the arrows not.
   */
  it("is held above the arrows by the column's flow at every width", async () => {
    await handedOff();

    const PINNED =
      /(^|\s)((sm|md|lg|xl|2xl):)?(fixed|absolute|sticky|inset-[^\s]+|bottom-[^\s]+|z-[^\s]+)(\s|$)/;
    const row = dock()!;
    const sheet = row.firstElementChild as HTMLElement;
    expect(row.className).not.toMatch(PINNED);
    expect(sheet.className).not.toMatch(PINNED);
    // The row may shrink, and the panel with it, scrolling inside its cap.
    expect(row.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "min-h-0", "flex-col"]),
    );
    expect(row.className).not.toMatch(/(^|\s)((sm|md|lg|xl):)?shrink-0(\s|$)/);
    expect(sheet.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-0", "overflow-y-auto", "max-h-[85dvh]"]),
    );
    // The arrows never give way, and the reading column gives way first.
    expect(screen.getByRole("navigation").className.split(" ")).toContain(
      "shrink-0",
    );
    const column = row.parentElement!.querySelector(
      ":scope > .overflow-y-auto",
    ) as HTMLElement;
    expect(column.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-0", "flex-1"]),
    );
    expect(column.contains(sheet)).toBe(false);
  });
});

describe("Keep going, from the moment the panel opens", () => {
  it("goes on from a hand-off before anything is answered", async () => {
    await handedOff();

    const keepGoing = screen.getByRole("button", { name: "Keep going" });
    expect(keepGoing).toBeEnabled();
    fireEvent.click(keepGoing);

    expect(screen.getByText("Body of Equivalence.")).toBeTruthy();
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Nothing was answered, so nothing went up as an answer.
    expect(answerGuided).not.toHaveBeenCalled();
  });

  it("closes a panel the child opened on a section with no check, with nothing answered", () => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: {
        lessonId: "lesson-1",
        segments: [],
        adjustment: "show_socratic_panel",
        guidedPrompts: [{ id: "p-9", prompt: "Which number counts the parts?" }],
      } as AdaptationPlan,
      forSegmentId: SEG_1,
    };
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    fireEvent.click(
      screen.getByRole("button", { name: "Which part is unclear?" }),
    );
    expect(screen.getByText("Which number counts the parts?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    // Closed, by the child alone - and the lesson where they left it.
    expect(screen.queryByText("Which number counts the parts?")).toBeNull();
    expect(screen.getByText("Body of Numerators.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(answerGuided).not.toHaveBeenCalled();
    // What it reported on opening is unchanged.
    expect(trackEvent).toHaveBeenCalledWith("guided_question_shown", {
      segmentId: SEG_1,
      promptId: "p-9",
    });
  });
});

describe("a hand-off with no guided questions (Teslim, 21 Oct)", () => {
  it("draws no panel and no prompt of its own: the check stays", async () => {
    // What the server sends when the failed question has none stored.
    saveAttempt.mockResolvedValue(
      reply({ handoffTo: null, guidedPrompts: [], advanceAfterHandoff: false }),
    );
    render(<LessonPlayer lesson={LESSON} plan={null} live />);
    next();
    next();

    await miss();
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(/think it through/i)).toBeNull();
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);
    expect(trackEvent).not.toHaveBeenCalledWith(
      "guided_question_shown",
      expect.anything(),
    );
  });
});
