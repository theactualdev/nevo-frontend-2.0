import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * What a calculation tells the engine, from inside the player.
 *
 * `calculation_step_response` and `manipulative_piece_placed` sent keys the
 * catalogue never declared - `correct`, `placed`, `needed` - and not the one
 * it did, `stepId`, so the engine could not tell which step a child answered.
 * They send the catalogue's keys now, and the guard below holds every payload
 * these tests drive out of the player to the catalogue.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "s1",
  stepNumber: 1,
  prompt: "What are the denominators?",
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "4 and 4", label: "4 and 4" },
    { value: "1 and 2", label: "1 and 2" },
  ],
  answer: "4 and 4",
  targets: [],
  hint: "Look at the bottom number of each fraction.",
  confirmationText: "",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const variant = (steps: ReturnType<typeof step>[]) =>
  ({
    type: "co_construction",
    conceptId: "c-1",
    fullEquation: "1/4 + 2/4 = 3/4",
    expression: "1/4 + 2/4",
    answer: "3/4",
    scaffold: null,
    manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
    steps,
    completionStatement: "",
  }) as unknown as CalculationVariant;

const lessonWith = (steps: ReturnType<typeof step>[]): Lesson =>
  ({
    id: "l-1",
    title: "Fractions",
    segments: [
      {
        id: "calc-1",
        modalities: ["text", "interactive"],
        text: { heading: "Adding", body: { default: "Add them." } },
        calculationVariant: "co_construction",
        calculation: calculationFromVariant(variant(steps)),
      },
      {
        id: "after",
        modalities: ["text"],
        text: { heading: "After", body: { default: "Done." } },
      },
    ],
  }) as unknown as Lesson;

const PLAN: AdaptationPlan = {
  lessonId: "l-1",
  segments: [{ segmentId: "calc-1", startModality: "interactive" }],
};

const sent = (type: string) =>
  trackEvent.mock.calls
    .filter(([t]) => t === type)
    .map(([, payload]) => payload as Record<string, unknown>);

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
  expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
});

describe("a calculation's signals", () => {
  it("names the step answered, and never sends whether it was right", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    tap("1 and 2");
    tap("Check my answer");
    tap("4 and 4");
    tap("Check my answer");

    expect(sent("calculation_step_response")).toEqual([
      { segmentId: "calc-1", stepId: "s1" },
      { segmentId: "calc-1", stepId: "s1" },
    ]);
    expect(sent("calculation_complete")).toEqual([{ segmentId: "calc-1" }]);
  });

  it("names the step a piece was placed on", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([
          step({
            stepId: "b1",
            prompt: "Build the total.",
            expectedInput: "drag",
            input: "tap",
            options: [],
            answer: "2",
            tapCount: 2,
          }),
        ])}
        plan={PLAN}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "+ 1/4" })[0]);

    expect(sent("manipulative_piece_placed")).toEqual([
      { segmentId: "calc-1", stepId: "b1" },
    ]);
  });

  it("tells the engine when the child opens a step's hint", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    tap("Need a hint?");

    // Shown and acted on, with the concept the payload names.
    expect(sent("hint_offered")).toEqual([{ segmentId: "calc-1", conceptId: "c-1" }]);
    expect(sent("hint_used")).toEqual([{ segmentId: "calc-1", conceptId: "c-1" }]);
  });

  it("sends no hint event for a miss - the engine decides those", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    tap("1 and 2");
    tap("Check my answer");
    tap("Check my answer");

    expect(sent("hint_offered")).toEqual([]);
    expect(sent("hint_used")).toEqual([]);
  });

  it("reports a step's narration the way the audio card reports its own", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([
          step({
            narrationAudio: {
              audioUrl: "https://cdn.example/s1.mp3",
              storagePath: null,
            },
          }),
        ])}
        plan={PLAN}
      />,
    );
    const audio = document.querySelector("audio")!;

    fireEvent.play(audio);
    fireEvent.ended(audio);
    tap("Play narration");
    fireEvent.error(audio);

    expect(sent("narration_played")).toEqual([{ segmentId: "calc-1" }]);
    expect(sent("replay")).toEqual([{ segmentId: "calc-1" }]);
    expect(sent("system_busy")).toHaveLength(1);
    // No storage path to re-issue from, so the first failure is the failure.
    expect(sent("media_load_failed")).toEqual([
      expect.objectContaining({ segmentId: "calc-1", channel: "audio" }),
    ]);
  });

  it("takes reading support from the plan the other segments read (D30)", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([step()])}
        plan={{ ...PLAN, accommodations: { reading: true } }}
      />,
    );

    expect(screen.getByText("What are the denominators?")).toHaveClass(
      "tracking-[0.01em]",
    );
    expect(screen.getByRole("button", { name: "4 and 4" })).toHaveClass(
      "leading-[2]",
    );
  });

  it("leaves the calculation as drawn without it", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    expect(screen.getByText("What are the denominators?")).not.toHaveClass(
      "tracking-[0.01em]",
    );
    expect(screen.getByRole("button", { name: "4 and 4" })).not.toHaveClass(
      "leading-[2]",
    );
  });

  it("holds the forward chevron until the solution has assembled", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    tap("4 and 4");
    tap("Check my answer");

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
