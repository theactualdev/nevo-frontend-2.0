import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * FEWER STEPS' ANSWERS GO UP AS CALCULATION ANSWERS (8c67353): each mini-step
 * under its own `questionId` as the problem, in the calculation's section,
 * for the server to mark - and the step itself after them, under its own id.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const HINT = "Look at the bottom number of each fraction.";

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
  hint: HINT,
  miniSteps: [
    {
      id: "m1",
      questionId: "mini-aaa",
      prompt: "First, just 1/4. What number is on top?",
      input: "choice",
      answer: "1",
      options: [
        { value: "1", label: "1" },
        { value: "4", label: "4" },
      ],
    },
  ],
  confirmationText: "",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?/4",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const LESSON = {
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
        scaffold: {
          kind: "bar",
          parts: 4,
          rows: 2,
          marks: [1, 2],
          labels: ["1/4", "2/4"],
        },
        manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
        steps: [step()],
        completionStatement: "",
      } as unknown as CalculationVariant),
    },
    {
      id: "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
      modalities: ["text"],
      text: { heading: "After", body: { default: "Done." } },
    },
  ],
} as unknown as Lesson;

// The dots at light: the picture is not drawn until the server asks for it.
const PLAN: AdaptationPlan = {
  lessonId: "l-1",
  segments: [{ segmentId: SEG, startModality: "interactive", scaffold: "light" }],
};

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const written = () =>
  saveAttempt.mock.calls.map(([, body]) => body as Record<string, unknown>);

beforeEach(() => {
  window.localStorage.clear();
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  saveAttempt.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("Fewer steps' answers", () => {
  it("are written as calculation answers under each mini-step's own id, then the step's", async () => {
    render(<LessonPlayer lesson={LESSON} plan={PLAN} live />);

    tap("Fewer steps");
    pick("1");
    pick("4 and 4");

    await waitFor(() => expect(saveAttempt).toHaveBeenCalledTimes(3));
    expect(written()).toEqual([
      expect.objectContaining({
        sessionId: SESSION,
        problemId: "mini-aaa",
        segmentId: SEG,
        source: "calculation",
        answer: "1",
      }),
      expect.objectContaining({
        problemId: "s1",
        segmentId: SEG,
        source: "calculation",
        answer: "same",
      }),
      // And the calculation, solved, as always after its last step.
      expect.objectContaining({ problemId: SEG, answer: "3/4" }),
    ]);
  });
});
