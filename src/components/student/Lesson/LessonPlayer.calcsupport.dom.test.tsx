import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * What the server says back about a calculation step it marked wrong (Teslim
 * 6b5d496): support inside that step, `calculation_scaffold` at
 * `scaffoldLevel: strong`, which it applies itself. The player puts that step
 * at the strong level in the solver - with no card and no words while Lydia
 * decides whether there is a card at all (Hub, 29 Oct) - and nothing else
 * the reply could say changes the solver. The answers themselves, and how
 * they are written, are `LessonPlayer.calcattempts`'s.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";

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

const { trackEvent, saveAttempt } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({
    offeredBreak: null,
    reason: null,
    forSegmentId: null,
    plan: null,
  }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: vi.fn().mockResolvedValue({}) },
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

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "s1",
  stepNumber: 1,
  prompt: "What are the denominators?",
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "same", label: "4 and 4" },
    { value: "differ", label: "1 and 2" },
  ],
  answer: "same",
  targets: [],
  hint: "Look at the bottom number of each fraction.",
  confirmationText: "",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?/4",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const NUMBER = (over: Record<string, unknown> = {}) =>
  step({
    stepId: "s2",
    prompt: "So what is 1 + 2?",
    expectedInput: "numeric",
    input: "number",
    options: [],
    answer: "3",
    hint: "",
    assembles: "1/4 + 2/4 = 3/4",
    equationState: "1/4 + 2/4 = 3/4",
    ...over,
  });

const lessonWith = (steps: ReturnType<typeof step>[]): Lesson =>
  ({
    id: "l-1",
    title: "Fractions",
    segments: [
      {
        id: SEG,
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
          steps,
          completionStatement: "",
        } as unknown as CalculationVariant),
      },
      {
        id: "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
        modalities: ["text"],
        text: { heading: "After", body: { default: "Done." } },
      },
    ],
  }) as unknown as Lesson;

const PLAN: AdaptationPlan = {
  lessonId: "l-1",
  segments: [{ segmentId: SEG, startModality: "interactive" }],
};

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const clock = { now: 1_000 };
let now: { mockRestore: () => void } | undefined;

beforeEach(() => {
  window.localStorage.clear();
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  saveAttempt.mockReset().mockResolvedValue({});
  clock.now = 1_000;
  now = vi.spyOn(performance, "now").mockImplementation(() => clock.now);
});

afterEach(() => {
  now?.mockRestore();
  cleanup();
  clearSession();
});


/*
 * SUPPORT IN THE STEP AFTER A MISS (Teslim 6b5d496; Hub, 29 Oct). The
 * server's one calculation route: "Show more support in this step",
 * `requiresChoice: false`, at `scaffoldLevel: strong`. The step it names goes
 * to the strong level as sent - with no card and no words while Lydia
 * decides whether there is a card at all.
 */
describe("support in the step after a calculation miss", () => {
  const HINT = "Look at the bottom number of each fraction.";
  const route = {
    action: "calculation_scaffold",
    label: "Show more support in this step",
    requiresChoice: false,
  };
  const reteaching = (over: Record<string, unknown> = {}) => ({
    questionId: "s1",
    segmentId: SEG,
    availableRoutes: [route],
    recommendedRoute: route,
    presentation: {
      density: "low",
      itemsPerScreen: 1,
      pacing: "slow",
      recheckRequired: true,
      scaffoldLevel: "strong",
    },
    screens: [],
    ...over,
  });

  it("puts the missed step at the strong level the server sends, with no card and no words", async () => {
    saveAttempt.mockResolvedValue({ correct: false, reteaching: reteaching() });
    render(<LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} live />);
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.getByRole("button", { name: "Need a hint?" })).toBeInTheDocument();

    pick("1 and 2");

    // The step's own hint, unasked, as the strong level draws it.
    await waitFor(() => expect(screen.getByText(HINT)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Need a hint?" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/show more support/i);
    // The row's More support is the child's, and stays theirs.
    expect(
      screen.getByRole("button", { name: "More support" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reads it from the gate's re-teaching where the top level has none", async () => {
    saveAttempt.mockResolvedValue({
      correct: false,
      comprehensionGate: { canAdvance: false, reteaching: reteaching() },
    });
    render(<LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} live />);

    pick("1 and 2");

    await waitFor(() => expect(screen.getByText(HINT)).toBeInTheDocument());
  });

  it("changes nothing for any other route, level or section", async () => {
    for (const other of [
      reteaching({ recommendedRoute: { ...route, action: "slower" } }),
      reteaching({ presentation: { scaffoldLevel: "standard" } }),
      reteaching({ segmentId: "another-section" }),
    ]) {
      saveAttempt.mockReset().mockResolvedValue({ correct: false, reteaching: other });
      render(<LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} live />);

      pick("1 and 2");
      await waitFor(() => expect(saveAttempt).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));

      expect(screen.queryByText(HINT)).toBeNull();
      cleanup();
    }
  });

  it("changes nothing after a right answer", async () => {
    saveAttempt.mockResolvedValue({ correct: true, reteaching: reteaching() });
    render(<LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} live />);

    pick("4 and 4");
    await waitFor(() => expect(saveAttempt).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(HINT)).toBeNull();
  });
});
