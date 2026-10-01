import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SocraticPanel } from "./AffectiveLayer";
import { SCAFFOLD_LEVELS, type ScaffoldLevel } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * THE SUPPORT DOTS CLAIMED A LEVEL NOBODY HAD SET.
 *
 * With no plan - an adapt call that failed, or a value it did not recognise -
 * the player drew `light`: two filled circles and, one tap away, "Nevo sets it
 * for you". Rule 5 says absence is an instruction, so no level is no
 * indicator.
 *
 * AND THEN THEY SAID TOO MUCH. Design, 1 Oct (D27): "No label, no pulse, no
 * tooltip, no tap popover." The word "Support", the popover explaining the
 * dots and the step-up glow all went; the dots change quietly and that is all
 * they do. The engine's own `none` (B17) is a level, drawn with no circle
 * filled - not the same as no level at all.
 */

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

const indicator = () =>
  document.querySelector<HTMLElement>("[data-scaffold-indicator]");
const filledDots = () =>
  Array.from(indicator()?.children ?? []).filter((d) =>
    d.className.includes("bg-nevo-navy"),
  ).length;

const withLevel = (scaffold: ScaffoldLevel): AdaptationPlan => ({
  lessonId: "frac-3",
  segments: [{ segmentId: "seg-1", startModality: "text", scaffold }],
});

afterEach(() => {
  cleanup();
});

describe("the support indicator", () => {
  it("is not there when the engine sent no plan", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(indicator()).toBeNull();
  });

  it("is not there when the plan has no level for this segment", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={{ lessonId: "frac-3", segments: [] }} />,
    );

    expect(indicator()).toBeNull();
  });

  it("fills the circles for the level the plan gives", () => {
    render(<LessonPlayer lesson={LESSON} plan={withLevel(SCAFFOLD_LEVELS.FULL)} />);

    expect(indicator()).not.toBeNull();
    expect(filledDots()).toBe(4);
  });

  it("shows the engine's none as four empty circles, not as nothing", () => {
    /*
     * B17. The engine SAID no support is being given; frontend §4 fills "0 to
     * 4". Dropping it would read as the engine having said nothing.
     */
    render(<LessonPlayer lesson={LESSON} plan={withLevel(SCAFFOLD_LEVELS.NONE)} />);

    expect(indicator()).not.toBeNull();
    expect(indicator()!.children).toHaveLength(4);
    expect(filledDots()).toBe(0);
  });
});

describe("the dots and nothing else (D27)", () => {
  it("carries no label", () => {
    render(<LessonPlayer lesson={LESSON} plan={withLevel(SCAFFOLD_LEVELS.LIGHT)} />);

    expect(indicator()!.textContent).toBe("");
    expect(screen.queryByText(/support/i)).toBeNull();
  });

  it("is not a control, so there is no popover to open", () => {
    render(<LessonPlayer lesson={LESSON} plan={withLevel(SCAFFOLD_LEVELS.LIGHT)} />);

    expect(indicator()!.closest("button")).toBeNull();
    expect(indicator()!.querySelector("button")).toBeNull();
    fireEvent.click(indicator()!);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(/sets it for you/i)).toBeNull();
  });

  it("does not pulse", () => {
    render(<LessonPlayer lesson={LESSON} plan={withLevel(SCAFFOLD_LEVELS.FULL)} />);

    expect(indicator()!.outerHTML).not.toMatch(/glow|animate|transition/);
  });

  it("is not announced, in any words", () => {
    // A screen reader reading out the dots is copy pointing the child back
    // to them. Hidden whole, so there is no name to read.
    render(<LessonPlayer lesson={LESSON} plan={withLevel(SCAFFOLD_LEVELS.FULL)} />);

    expect(indicator()!.getAttribute("aria-hidden")).toBe("true");
    expect(indicator()!.getAttribute("aria-label")).toBeNull();
  });
});

describe("the affective pill", () => {
  it("is 44px to touch, though drawn at 36", () => {
    render(<SocraticPanel prompts={[{ prompt: "What does the leaf do?" }]} />);

    expect(
      screen.getByRole("button", { name: "Which part is unclear?" }).className,
    ).toMatch(/\bh-11\b/);
  });
});
