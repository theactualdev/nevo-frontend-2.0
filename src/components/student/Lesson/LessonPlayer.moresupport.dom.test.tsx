import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { MORE_SUPPORT_LABEL } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { Lesson } from "@/lib/types";

/**
 * MORE SUPPORT, THE CHILD'S OWN, HELD FOR THE SITTING (8c67353: `moreSupport`
 * on the same preference write as the pace, read back in `lessonPreferences`
 * and each section's `deliveryPreference`). Lydia, 31 Oct: More support not
 * surviving a reload was "a defect we are knowingly shipping, not an accepted
 * state". It survives one now.
 */

const SITTING = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const IDEA = "The denominator is the bottom number of each fraction.";

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

const { trackEvent, saveSegmentChoice } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveSegmentChoice: vi.fn(),
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveSegmentChoice,
      saveAttempt: vi.fn().mockResolvedValue({}),
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
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
  conceptExplanation: IDEA,
  confirmationText: "",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?/4",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const lessonWith = (chosen?: Record<string, unknown>): Lesson =>
  ({
    id: "l-1",
    title: "Fractions",
    segments: [
      {
        id: SEG,
        modalities: ["text", "interactive"],
        text: { heading: "Adding", body: { default: "Add them." } },
        calculationVariant: "co_construction",
        ...(chosen ? { chosen } : {}),
        calculation: calculationFromVariant({
          type: "co_construction",
          conceptId: "c-1",
          fullEquation: "1/4 + 2/4 = 3/4",
          expression: "1/4 + 2/4",
          answer: "3/4",
          scaffold: null,
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
  }) as unknown as Lesson;

let shown: Lesson;
const play = (l: Lesson) => {
  shown = l;
  return render(<LessonPlayer lesson={l} plan={null} live />);
};
/** `POST /session` answers, a moment after the first frame. */
const lands = (
  view: ReturnType<typeof render>,
  lessonPreferences: Record<string, unknown>,
) => {
  progress.opened = {
    sessionId: SITTING,
    resumed: true,
    deliveryState: {
      engineConfig: {},
      accommodations: [],
      capturedAt: "2026-11-04T14:00:00Z",
      segmentChoices: {},
      lessonPreferences,
    },
  };
  view.rerender(<LessonPlayer lesson={shown} plan={null} live />);
};

const pill = () => screen.getByRole("button", { name: "More support" });
const card = () => screen.queryByText(MORE_SUPPORT_LABEL);
const settle = () => act(async () => {});

beforeEach(() => {
  progress.sessionId = SITTING;
  progress.opened = null;
  trackEvent.mockReset();
  saveSegmentChoice.mockReset().mockResolvedValue({ availableFormats: ["text"] });
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

describe("More support on the calculation, held for the sitting", () => {
  it("shows the step's explanation on a press, and holds it on the server for the sitting", async () => {
    play(lessonWith());
    expect(card()).toBeNull();

    fireEvent.click(pill());
    await settle();

    expect(card()).not.toBeNull();
    expect(screen.getByText(IDEA)).toBeInTheDocument();
    expect(pill()).toHaveAttribute("aria-pressed", "true");
    expect(saveSegmentChoice).toHaveBeenCalledExactlyOnceWith(
      "l-1",
      SITTING,
      SEG,
      { moreSupport: true },
    );
  });

  it("clears it with null when pressed again", async () => {
    play(lessonWith());
    fireEvent.click(pill());
    await settle();
    fireEvent.click(pill());
    await settle();

    expect(card()).toBeNull();
    expect(saveSegmentChoice).toHaveBeenLastCalledWith("l-1", SITTING, SEG, {
      moreSupport: null,
    });
  });

  it("opens with it on where the lesson read says the sitting holds it - a reload", () => {
    play(lessonWith({ moreSupport: true }));

    expect(card()).not.toBeNull();
    expect(pill()).toHaveAttribute("aria-pressed", "true");
    expect(saveSegmentChoice).not.toHaveBeenCalled();
  });

  it("takes the sitting's word as it lands", () => {
    const view = play(lessonWith());

    lands(view, { slower: null, moreSupport: true });

    expect(card()).not.toBeNull();
  });

  it("is not changed by a sitting that says nothing about it", () => {
    const view = play(lessonWith({ moreSupport: true }));

    lands(view, { slower: null });

    expect(card()).not.toBeNull();
  });

  it("keeps the child's press over a sitting's word that lands after it", async () => {
    const view = play(lessonWith());
    fireEvent.click(pill());
    await settle();

    lands(view, { moreSupport: false });

    expect(card()).not.toBeNull();
  });

  it("stays on screen when the write fails, for this visit", async () => {
    saveSegmentChoice.mockRejectedValue(new Error("offline"));
    play(lessonWith());

    fireEvent.click(pill());
    await settle();

    expect(card()).not.toBeNull();
  });

  it("writes nothing where there is no sitting to hold it under, and still shows", async () => {
    progress.sessionId = null;
    play(lessonWith());

    fireEvent.click(pill());
    await settle();

    expect(card()).not.toBeNull();
    expect(saveSegmentChoice).not.toHaveBeenCalled();
  });

  it("is not offered on a calculation step with no explanation", () => {
    play(
      ({
        ...lessonWith(),
        segments: lessonWith().segments.map((s, i) =>
          i === 0
            ? {
                ...s,
                calculation: calculationFromVariant({
                  type: "co_construction",
                  conceptId: "c-1",
                  fullEquation: "1/4 + 2/4 = 3/4",
                  expression: "1/4 + 2/4",
                  answer: "3/4",
                  scaffold: null,
                  manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
                  steps: [step({ conceptExplanation: null })],
                  completionStatement: "",
                } as unknown as CalculationVariant),
              }
            : s,
        ),
      }) as Lesson,
    );

    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
    expect(screen.getByRole("button", { name: "Slower" })).toBeInTheDocument();
  });
});
