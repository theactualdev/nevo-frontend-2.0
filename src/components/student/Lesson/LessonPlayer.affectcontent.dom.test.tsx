import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * THE TWO INSTRUCTIONS THAT HAD NOTHING TO SAY.
 *
 * `offer_hint` and `show_socratic_panel` were readable from the day the action
 * shipped, and no field carried the hint text or the guided questions - so
 * three of §4's four affective responses could not reach a signed-in child at
 * all. The components existed; only the authored demo ever reached them.
 *
 * Filed as two asks on 17 Sep, answered on 21 Sep with
 * `ProactiveAdjustmentResponse.hint` and `.guidedQuestions`.
 *
 * Neither is in the schema's `required` list, so an instruction arriving with
 * nothing to show stays a real case - and stays the nothing-state, because an
 * empty hint card is worse than no hint.
 */

vi.mock("@/hooks", () => ({
  useBreakMonitor: () => ({ due: false, dismiss: vi.fn() }),
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const LESSON = {
  id: "photo-1",
  title: "Photosynthesis",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Inside a leaf", body: { default: "One idea here." } },
    },
  ],
} as unknown as Lesson;

const plan = (over: Partial<AdaptationPlan> = {}): AdaptationPlan => ({
  lessonId: "photo-1",
  segments: [],
  ...over,
});

const HINT = "Start with where the light lands: the leaf.";
const QUESTIONS = [
  "Where does the plant get its energy from?",
  "What do you think the leaf does with sunlight?",
];

const body = () => document.body.textContent ?? "";

beforeEach(() => {});
afterEach(() => {
  cleanup();
});

describe("the hint the engine sends", () => {
  it("reaches the child", () => {
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={plan({ adjustment: ADJUSTMENT_ACTIONS.OFFER_HINT, hint: HINT })}
      />,
    );

    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("shows nothing when the instruction arrives without one", () => {
    // Rule 5. The action is readable and there is no text; an empty card would
    // be the player inventing the help it was told to offer.
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={plan({ adjustment: ADJUSTMENT_ACTIONS.OFFER_HINT })}
      />,
    );

    expect(body()).not.toMatch(/light lands/);
  });

  it("is not shown under a different instruction", () => {
    // The translator drops it, so this can only fail if something downstream
    // started reading the field on its own.
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={plan({
          adjustment: ADJUSTMENT_ACTIONS.MODULATE_DENSITY,
          hint: HINT,
        })}
      />,
    );

    expect(body()).not.toMatch(/light lands/);
  });
});

describe("the questions the socratic panel opens", () => {
  it("reaches the child", () => {
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={plan({
          adjustment: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL,
          guidedQuestions: QUESTIONS,
        })}
      />,
    );

    // The panel opens from its own control rather than sitting open, so the
    // assertion is that the instruction produced something to open.
    expect(
      screen.getByRole("button", { name: /which part is unclear/i }),
    ).toBeInTheDocument();
  });

  it("shows nothing when the instruction arrives with no questions", () => {
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={plan({ adjustment: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /which part is unclear/i }),
    ).toBeNull();
  });
});

describe("the reasoning that must never arrive with it", () => {
  it("renders no reason or confidence beside a hint it does show", () => {
    /*
     * The distinction these fields make sharper. `hint` and `guidedQuestions`
     * are child-facing by design; `reason` and `confidence` are the reasoning
     * frame 38 forbids showing, and the translator does not carry them at all.
     * This is the screen-level check that nothing re-introduces them.
     */
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={
          {
            ...plan({ adjustment: ADJUSTMENT_ACTIONS.OFFER_HINT, hint: HINT }),
            // Shapes a future careless translator might let through.
            reason: "erratic tap coordinates",
            confidence: 0.82,
          } as unknown as AdaptationPlan
        }
      />,
    );

    expect(body()).toMatch(/light lands/);
    expect(body()).not.toMatch(/erratic tap/);
    expect(body()).not.toMatch(/0\.82/);
  });
});
