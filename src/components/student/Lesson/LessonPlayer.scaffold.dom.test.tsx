import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { DifficultyOfferPill, SocraticPanel } from "./AffectiveLayer";
import { SCAFFOLD_LEVELS } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * THE SUPPORT DOTS CLAIMED A LEVEL NOBODY HAD SET.
 *
 * With no plan - an adapt call that failed, or a value it did not recognise -
 * the player drew `light`: two filled circles and, one tap away, "Nevo sets it
 * for you". Rule 5 says absence is an instruction, so no level is no
 * indicator. And the controls that are there are 44px to touch.
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
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
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
  ],
} as unknown as Lesson;

const support = () => screen.queryByRole("button", { name: "Support" });

afterEach(() => {
  cleanup();
});

describe("the support indicator", () => {
  it("is not there when the engine sent no plan", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(support()).toBeNull();
  });

  it("is not there when the plan has no level for this segment", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={{ lessonId: "frac-3", segments: [] }} />,
    );

    expect(support()).toBeNull();
  });

  it("shows the level the plan gives", () => {
    const plan: AdaptationPlan = {
      lessonId: "frac-3",
      segments: [
        {
          segmentId: "seg-1",
          startModality: "text",
          scaffold: SCAFFOLD_LEVELS.FULL,
        },
      ],
    };
    render(<LessonPlayer lesson={LESSON} plan={plan} />);

    expect(support()).toBeInTheDocument();
  });

  it("is 44px to touch around its 26px pill", () => {
    const plan: AdaptationPlan = {
      lessonId: "frac-3",
      segments: [
        { segmentId: "seg-1", startModality: "text", scaffold: SCAFFOLD_LEVELS.LIGHT },
      ],
    };
    render(<LessonPlayer lesson={LESSON} plan={plan} />);

    // jsdom lays nothing out, so the size class is what there is to read.
    expect(support()!.className).toMatch(/\bh-11\b/);
  });
});

describe("the affective pills", () => {
  it("are 44px to touch, though drawn at 36", () => {
    render(
      <>
        <DifficultyOfferPill onSpent={() => {}} />
        <SocraticPanel prompts={["What does the leaf do?"]} />
      </>,
    );

    expect(
      screen.getByRole("button", { name: "Ready for something harder?" })
        .className,
    ).toMatch(/\bh-11\b/);
    expect(
      screen.getByRole("button", { name: "Which part is unclear?" }).className,
    ).toMatch(/\bh-11\b/);
  });
});
