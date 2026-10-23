import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * SCRUM-275 #2 (Lydia, 21 Oct): "The hint goes inside the open check sheet,
 * with the question it refers to. Not held until the sheet closes, because a
 * hint that arrives after the moment it was for is worse than no hint, and
 * away from its question it does not read."
 *
 * The 21 Oct run's trace: the engine's hint rendered under the segment,
 * behind the check's scrim, and went with the segment when the check closed.
 * Whether a miss earns a hint stays the engine's call - here it simply
 * answers with one, for the section the check is on.
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

const { trackEvent, saveAttempt, runtime } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
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
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const QUESTION = "Which number is on top?";
const QUICK_CHECK = {
  id: "cp-inline",
  question: QUESTION,
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

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    { id: SEG_1, ...text("Numerators"), quickCheck: QUICK_CHECK },
    { id: SEG_2, ...text("Denominators") },
  ],
} as unknown as Lesson;

const HINT = "Look at which number sits above the line.";

/** The engine's in_lesson answer after a miss: a hint, for this section. */
const hintFor = (segmentId: string) => {
  runtime.value = {
    offeredBreak: null,
    reason: null,
    plan: {
      lessonId: "lesson-1",
      segments: [],
      adjustment: "offer_hint",
      hint: HINT,
    } as AdaptationPlan,
    forSegmentId: segmentId,
  };
};

const reply = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-inline",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 1,
  question: {},
  answer: "b",
  correct: false,
  submittedAt: "2026-10-21T10:00:00Z",
  resultState: "nothing_landed",
  ...over,
});

const player = () => <LessonPlayer lesson={LESSON} plan={null} live />;
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const miss = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: /The denominator/ }),
  );

/** Into the check, a miss, and the engine's hint arriving for it. */
const hintArrivesInCheck = async () => {
  const view = render(player());
  next();
  await miss();
  hintFor(SEG_1);
  view.rerender(player());
  return view;
};

beforeEach(() => {
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  saveAttempt.mockReset().mockResolvedValue(reply());
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

describe("the engine's hint while a check is open (SCRUM-275 #2)", () => {
  it("goes inside the check the moment it arrives, under its question and over the answers", async () => {
    await hintArrivesInCheck();

    const dialog = screen.getByRole("dialog");
    const hint = within(dialog).getByText(HINT);
    const question = within(dialog).getByText(QUESTION);
    const firstAnswer = within(dialog).getByRole("button", {
      name: /The numerator/,
    });
    expect(
      question.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      hint.compareDocumentPosition(firstAnswer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The hint card's own look, and D29's labelled Close with it.
    expect(hint.parentElement?.className).toMatch(/(^|\s)bg-nevo-violet\/14(\s|$)/);
    expect(
      within(dialog).getByRole("button", { name: "Close hint" }),
    ).toBeTruthy();
  });

  it("is not drawn under the section behind the sheet at the same time", async () => {
    await hintArrivesInCheck();

    const drawn = screen.getAllByText(HINT);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].closest('[role="dialog"]')).not.toBeNull();
  });

  it("moves in with the check when it was already showing as the check opened", () => {
    hintFor(SEG_1);
    render(player());
    expect(screen.getByText(HINT).closest('[role="dialog"]')).toBeNull();

    next();

    const drawn = screen.getAllByText(HINT);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].closest('[role="dialog"]')).not.toBeNull();
  });

  it("goes back under the section once the sheet closes", async () => {
    await hintArrivesInCheck();
    expect(screen.getByText(HINT).closest('[role="dialog"]')).not.toBeNull();

    // The server hands the child off on the next miss: the sheet closes, and
    // the child stays on the section.
    saveAttempt.mockResolvedValue(
      reply({
        attemptNumber: 3,
        handoffTo: "socratic_panel",
        guidedPrompts: [{ id: "p-1", prompt: "What does the top count?" }],
        advanceAfterHandoff: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await miss();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const hint = screen.getByText(HINT);
    expect(hint.closest('[role="dialog"]')).toBeNull();
    expect(
      screen
        .getByText("Body of Numerators.")
        .compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("closes in the sheet, and stays closed for that section (D29)", async () => {
    await hintArrivesInCheck();

    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close hint",
      }),
    );

    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("still says hint_offered as it shows, and the next answer goes up as after a hint (B28)", async () => {
    await hintArrivesInCheck();
    expect(trackEvent).toHaveBeenCalledWith("hint_offered", {
      segmentId: SEG_1,
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /The numerator/ }),
    );

    expect(saveAttempt).toHaveBeenLastCalledWith(
      "lesson-1",
      expect.objectContaining({ hintCount: 1 }),
    );
  });

  it("on a calculation's check, is in the sheet and still said as offered", () => {
    // A solved calculation with a check after it: the solver draws no hint
    // once it is solved, so the sheet is the hint's only place on screen.
    const CALC = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
    const lesson = {
      id: "lesson-1",
      title: "Fractions Lesson 3",
      segments: [
        {
          id: CALC,
          modalities: ["text", "interactive"],
          text: { heading: "Adding", body: { default: "Add them." } },
          calculationVariant: "co_construction",
          calculation: calculationFromVariant({
            type: "co_construction",
            conceptId: "c-1",
            fullEquation: "1/4 + 2/4 = 3/4",
            expression: "1/4 + 2/4",
            answer: "3/4",
            scaffold: null,
            manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
            steps: [
              {
                stepId: "s2",
                stepNumber: 1,
                prompt: "So what is 1 + 2?",
                expectedInput: "numeric",
                input: "number",
                options: [],
                answer: "3",
                targets: [],
                hint: "",
                confirmationText: "",
                visualUpdate: "",
                assembles: "1/4 + 2/4 = 3/4",
                equationState: "1/4 + 2/4 = 3/4",
                unit: null,
                narrationAudio: null,
              },
            ],
            completionStatement: "",
          } as unknown as CalculationVariant),
          quickCheck: QUICK_CHECK,
        },
        { id: SEG_2, ...text("Denominators") },
      ],
    } as unknown as Lesson;
    const plan = {
      lessonId: "lesson-1",
      segments: [{ segmentId: CALC, startModality: "interactive" }],
    } as AdaptationPlan;
    const view = render(<LessonPlayer lesson={lesson} plan={plan} live />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));
    next();
    expect(screen.getByRole("dialog")).toBeTruthy();

    hintFor(CALC);
    view.rerender(<LessonPlayer lesson={lesson} plan={plan} live />);

    expect(
      within(screen.getByRole("dialog")).getByText(HINT),
    ).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith("hint_offered", {
      segmentId: CALC,
    });
  });

  it("is no hint in the check when it was given for a different section", async () => {
    const view = render(player());
    next();
    await miss();
    hintFor(SEG_2);
    view.rerender(player());

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

/*
 * 23 OCT'S SWEEP: THE HINT CAME, AND THE SHEET NEVER SHOWED IT. Since the
 * gate, the engine sends the two-miss hint beside whatever it asks for -
 * `offer_modality_shift`, `simplify`, `rechunk` - and only `offer_hint` drew
 * it. The gate contract (Teslim, 23 Oct): it "must not be hidden solely
 * because the action is a pacing or chunking action".
 */
describe("the engine's hint beside another instruction (the gate, 23 Oct)", () => {
  const hintBeside = (adjustment?: string) => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: {
        lessonId: "lesson-1",
        segments: [],
        ...(adjustment ? { adjustment } : {}),
        hint: HINT,
      } as AdaptationPlan,
      forSegmentId: SEG_1,
    };
  };

  it.each([
    ["simplify", "simplify"],
    ["an action this client does not draw", undefined],
  ])("goes inside the open check under %s", async (_, adjustment) => {
    const view = render(player());
    next();
    await miss();
    hintBeside(adjustment);
    view.rerender(player());

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(HINT)).toBeTruthy();
  });
});
