import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * An instruction the engine gives mid-lesson reaches the child.
 *
 * `useRuntimeAdaptation` kept only the break suggestion, so a hint decided
 * while the child was working never appeared. The player now prefers the
 * engine's newest answer over the one it gave at load.
 */

const runtime = vi.hoisted(() => ({
  value: {
    offeredBreak: null,
    reason: null,
    plan: null,
    forSegmentId: null,
  } as {
    offeredBreak: null;
    reason: null;
    plan: AdaptationPlan | null;
    forSegmentId: string | null;
  },
}));

vi.mock("@/hooks", () => ({
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
  useRuntimeAdaptation: () => runtime.value,
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Numerators", body: { default: "The top number." } },
    },
    {
      id: "seg-2",
      modalities: ["text"],
      text: {
        heading: "Denominators",
        body: { default: "The bottom number." },
      },
    },
  ],
} as unknown as Lesson;

const hintPlan = {
  lessonId: "frac-3",
  segments: [],
  adjustment: "offer_hint",
  hint: "Look at the bottom number first.",
} as AdaptationPlan;

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const glowing = () =>
  screen
    .getByRole("button", { name: "Next" })
    .className.includes("animate-nevo-glow-guide");

const HINT = "Look at the bottom number first.";

afterEach(() => {
  cleanup();
  runtime.value = {
    offeredBreak: null,
    reason: null,
    plan: null,
    forSegmentId: null,
  };
});

describe("the engine's mid-lesson instruction", () => {
  it("shows a hint that arrived mid-lesson, when the opening plan had none", () => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: hintPlan,
      forSegmentId: "seg-1",
    };

    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("shows nothing when the engine has not said anything mid-lesson", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(screen.queryByText(HINT)).toBeNull();
  });
});

/*
 * B18: the engine now sends a hint or the socratic panel after two wrong
 * answers in a row, as a mid-lesson answer for the segment the child is on.
 * Nothing here may block it, draw it twice, or bring back one the child shut.
 */
describe("support the engine sends after two wrong answers (B18)", () => {
  const SOCRATIC = {
    lessonId: "frac-3",
    segments: [],
    adjustment: "show_socratic_panel",
    guidedPrompts: [{ id: "p-1", prompt: "Which number counts the parts?" }],
  } as AdaptationPlan;

  it("shows the hint once, and D29's Close keeps it shut when it is said again", () => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: hintPlan,
      forSegmentId: "seg-1",
    };
    // The load-time plan says the same thing; it is still one card.
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={hintPlan} />,
    );
    expect(screen.getAllByText(HINT)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Close hint" }));
    expect(screen.queryByText(HINT)).toBeNull();

    // A third wrong answer asks again, and the engine answers the same.
    runtime.value = { ...runtime.value, plan: { ...hintPlan } };
    rerender(<LessonPlayer lesson={LESSON} plan={hintPlan} />);

    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("offers the socratic panel once, on the segment it was sent for", () => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: SOCRATIC,
      forSegmentId: "seg-1",
    };
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(
      screen.getAllByRole("button", { name: "Which part is unclear?" }),
    ).toHaveLength(1);

    next();

    expect(
      screen.queryByRole("button", { name: "Which part is unclear?" }),
    ).toBeNull();
  });
});

describe("the segment a hint belongs to", () => {
  /*
   * The instruction is lesson-level on the wire, and a hint is about the
   * content in front of the child when it was asked for. Keyed on the plan
   * alone, the same hint - and the glow guiding to it - sat under every
   * segment after, and a failed read kept it there.
   */
  it("shows a mid-lesson hint only on the segment it was asked for", () => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: hintPlan,
      forSegmentId: "seg-1",
    };

    render(<LessonPlayer lesson={LESSON} plan={null} />);
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(glowing()).toBe(true);

    next();

    expect(screen.queryByText(HINT)).toBeNull();
    expect(glowing()).toBe(false);
  });

  it("shows a load-time hint on the segment the lesson opened on, and not after", () => {
    render(<LessonPlayer lesson={LESSON} plan={hintPlan} />);
    expect(screen.getByText(HINT)).toBeInTheDocument();

    next();

    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("follows a resumed lesson to the segment it opened on", () => {
    render(<LessonPlayer lesson={LESSON} plan={hintPlan} startAt={1} />);

    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});
