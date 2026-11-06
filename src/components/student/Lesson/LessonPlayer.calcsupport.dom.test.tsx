import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { CALC_SUPPORT_LINES } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * A CALCULATION MISS'S RE-TEACHING IS SUPPORT IN THE STEP (Lydia, 2 and 4
 * Nov). The server's reply to a wrong step names its one calculation route,
 * `calculation_scaffold`, and a level; the step it names goes to that level
 * and the card says what changed. Any other route, a right answer, or another
 * section changes nothing.
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

/** The server's reply to a wrong step, with the re-teaching it names. */
const missed = (
  action: string,
  scaffoldLevel: string,
  over: Record<string, unknown> = {},
) => ({
  id: "att-1",
  lessonId: "l-1",
  sessionId: SESSION,
  questionId: "s1",
  segmentId: SEG,
  source: "calculation",
  attemptNumber: 1,
  answer: "differ",
  correct: false,
  submittedAt: "2026-11-04T12:00:00Z",
  reteaching: {
    questionId: "s1",
    segmentId: SEG,
    availableRoutes: [{ action, label: "Show more support in this step" }],
    recommendedRoute: { action, label: "Show more support in this step" },
    presentation: { scaffoldLevel },
    screens: [],
  },
  ...over,
});

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const card = () =>
  screen
    .queryAllByRole("status")
    .find((s) =>
      (Object.values(CALC_SUPPORT_LINES) as string[]).includes(
        s.textContent ?? "",
      ),
    ) ?? null;
/** Every write the player has made, settled. */
const settled = () =>
  waitFor(() => expect(saveAttempt).toHaveBeenCalled()).then(() =>
    Promise.all(saveAttempt.mock.results.map((r) => r.value)),
  );

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

describe("the server's support after a calculation miss", () => {
  it("draws the picture in the step it names, and the card says so", async () => {
    saveAttempt.mockResolvedValue(missed("calculation_scaffold", "standard"));
    render(<LessonPlayer lesson={LESSON} plan={PLAN} live />);
    expect(screen.queryByText("Picture it")).toBeNull();

    pick("1 and 2");

    expect(await screen.findByText("Picture it")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Here it is as a picture.");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("adds the step's hint at strong, and the card says both", async () => {
    saveAttempt.mockResolvedValue(missed("calculation_scaffold", "strong"));
    render(<LessonPlayer lesson={LESSON} plan={PLAN} live />);

    pick("1 and 2");

    expect(await screen.findByText(HINT)).toBeInTheDocument();
    expect(card()).toHaveTextContent(
      "Here it is as a picture, with a hint on the question.",
    );
  });

  it.each([
    ["another route", missed("slower", "standard")],
    ["a level it does not name", missed("calculation_scaffold", "full")],
    ["a right answer", missed("calculation_scaffold", "standard", { correct: true })],
    [
      "another section",
      missed("calculation_scaffold", "standard", {
        reteaching: {
          ...missed("calculation_scaffold", "standard").reteaching,
          segmentId: "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
        },
      }),
    ],
  ])("changes nothing for %s", async (_, reply) => {
    saveAttempt.mockResolvedValue(reply);
    render(<LessonPlayer lesson={LESSON} plan={PLAN} live />);

    pick("1 and 2");
    await settled();

    expect(screen.queryByText("Picture it")).toBeNull();
    expect(card()).toBeNull();
  });

  it("reads the re-teaching from the gate's reply as well", async () => {
    const { reteaching, ...rest } = missed("calculation_scaffold", "standard");
    saveAttempt.mockResolvedValue({
      ...rest,
      comprehensionGate: { required: true, canAdvance: false, reteaching },
    });
    render(<LessonPlayer lesson={LESSON} plan={PLAN} live />);

    pick("1 and 2");

    expect(await screen.findByText("Picture it")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Here it is as a picture.");
  });
});
