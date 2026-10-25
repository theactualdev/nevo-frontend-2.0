import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * A calculation opens in the solver and nothing else, and one this app cannot
 * draw is its text, reported.
 *
 * Lydia, 17 Oct (#5): "Calculations stop opening as plain text." Teslim, 19
 * Oct: "A valid one advertises interactive only ... A renderer failure on the
 * device should use the source body and report the failure."
 */

const { report, solver, runtime } = vi.hoisted(() => ({
  report: vi.fn(),
  solver: { throws: false, attempts: 0 },
  runtime: {
    value: {
      offeredBreak: null,
      reason: null,
      forSegmentId: null,
      plan: null,
    } as {
      offeredBreak: null;
      reason: null;
      forSegmentId: string | null;
      plan: AdaptationPlan | null;
    },
  },
}));

vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => runtime.value,
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
vi.mock("@/lib/api/clientErrors", async (original) => ({
  ...(await original<typeof import("@/lib/api/clientErrors")>()),
  reportCalculationFallback: report,
}));
/** The real solver, unless a test has it fail as it draws. */
vi.mock("./CalculationSolver", async (original) => {
  const real = await original<typeof import("./CalculationSolver")>();
  return {
    ...real,
    CalculationSolver: (props: ComponentProps<typeof real.CalculationSolver>) => {
      if (solver.throws) {
        solver.attempts += 1;
        throw new Error("the drawing broke");
      }
      return createElement(real.CalculationSolver, props);
    },
  };
});

const BODY = "Add the tops and keep the bottom.";
const PROMPT = "What are the denominators?";

const CHOICE = {
  stepId: "s1",
  stepNumber: 1,
  prompt: PROMPT,
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "4 and 4", label: "4 and 4" },
    { value: "1 and 2", label: "1 and 2" },
  ],
  answer: "4 and 4",
  targets: [],
  hint: "",
  confirmationText: "",
  visualUpdate: "",
  assembles: "",
  equationState: "",
  unit: null,
  narrationAudio: null,
};

const variant = (steps: object[]) => ({
  type: "co_construction",
  conceptId: null,
  fullEquation: "1/4 + 2/4 = 3/4",
  expression: "1/4 + 2/4",
  answer: "3/4",
  scaffold: null,
  manipulative: null,
  steps,
  completionStatement: "",
});

const textSegment = (id: string, order: number, body: string) => ({
  id,
  segmentKey: id,
  contentType: "explanatory_text",
  sequenceOrder: order,
  title: id,
  body,
  availableModalities: ["text"],
  comprehensionCheckpoints: [],
  textVariant: null,
  visualVariant: null,
  audioVariant: null,
  interactiveVariant: null,
  calculationVariant: null,
  needsReview: false,
  reviewReasons: [],
});

/** The lesson as the content read sends it, through the real adapter. */
const detail = (calc: Record<string, unknown>): LessonDetailResponse =>
  ({
    id: "l-1",
    title: "Fractions",
    segments: [
      {
        ...textSegment("calc-1", 1, BODY),
        contentType: "calculation",
        availableModalities: ["interactive"],
        calculationVariant: variant([CHOICE]),
        ...calc,
      },
      textSegment("after", 2, "Done."),
    ],
    modules: [],
  }) as unknown as LessonDetailResponse;

const built = (calc: Record<string, unknown> = {}): Lesson => {
  const lesson = lessonFromContent(detail(calc));
  if (!lesson) throw new Error("the adapter refused the whole lesson");
  return lesson;
};

const opensOn = (startModality: "text" | "interactive"): AdaptationPlan => ({
  lessonId: "l-1",
  segments: [{ segmentId: "calc-1", startModality }],
});

beforeEach(() => {
  report.mockReset();
  solver.throws = false;
  solver.attempts = 0;
  runtime.value = { offeredBreak: null, reason: null, forSegmentId: null, plan: null };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a calculation opens in the solver alone", () => {
  it("opens in the solver with no plan to say so", () => {
    // The engine's silence: the first channel offered. That was Text.
    render(<LessonPlayer lesson={built()} plan={null} />);

    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it("opens in the solver when a plan names Text", () => {
    render(<LessonPlayer lesson={built()} plan={opensOn("text")} />);

    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it("is never offered as its text, whatever a formats list names", () => {
    // The engine's live answer for this very segment, listing Text and
    // recommending it: a calculation is the solver alone, so there is no
    // second format and no group to put a marker in.
    runtime.value = {
      ...runtime.value,
      forSegmentId: "calc-1",
      plan: {
        lessonId: "l-1",
        segments: [
          {
            segmentId: "calc-1",
            startModality: "interactive",
            formats: ["interactive", "text"],
            recommendedFormat: "text",
          },
        ],
      },
    };
    render(<LessonPlayer lesson={built()} plan={opensOn("interactive")} />);

    expect(screen.queryByRole("group", { name: "Lesson format" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Text" })).toBeNull();
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
  });

  it("reports nothing for a calculation it can draw", () => {
    render(<LessonPlayer lesson={built()} plan={null} />);

    expect(report).not.toHaveBeenCalled();
  });
});

describe("a calculation this app cannot draw", () => {
  /** A choice with one option: the server let it through, our checks do not. */
  const ONE_OPTION = {
    calculationVariant: variant([
      { ...CHOICE, options: [{ value: "4 and 4", label: "4 and 4" }] },
    ]),
  };

  it("is its source text, and is reported once the child meets it", () => {
    render(<LessonPlayer lesson={built(ONE_OPTION)} plan={opensOn("interactive")} />);

    expect(screen.getByText(BODY)).toBeInTheDocument();
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      lessonId: "l-1",
      segmentId: "calc-1",
      reason: "step 1 of 1: a choice with fewer than two options",
    });
  });

  it("is not reported for a child who never reaches it", () => {
    render(
      <LessonPlayer lesson={built(ONE_OPTION)} plan={null} startAt={1} />,
    );

    expect(screen.getByText("Done.")).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it("is its text, reported, when the solver fails as it draws - never the lesson's error screen", () => {
    solver.throws = true;
    // React logs what a boundary catches; the boundary is what is under test.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<LessonPlayer lesson={built()} plan={opensOn("interactive")} />);

      expect(screen.getByText(BODY)).toBeInTheDocument();
      expect(report).toHaveBeenCalledTimes(1);
      const [fallback] = report.mock.calls[0];
      expect(fallback).toMatchObject({
        lessonId: "l-1",
        segmentId: "calc-1",
        reason: "the solver failed on the device",
      });
      expect((fallback as { error: Error }).error.message).toBe(
        "the drawing broke",
      );

      // Its text from here on: forward is not held for a solve that cannot
      // happen, and coming back does not draw the broken solver again.
      const attempts = solver.attempts;
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText("Done.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      expect(screen.getByText(BODY)).toBeInTheDocument();
      expect(solver.attempts).toBe(attempts);
      // Said again on the way back, the same fault: sent once a page.
      for (const [again] of report.mock.calls) {
        expect(again).toMatchObject({ segmentId: "calc-1" });
      }
    } finally {
      quiet.mockRestore();
    }
  });
});
