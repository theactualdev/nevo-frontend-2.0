import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  value: { offeredBreak: null, reason: null, plan: null } as {
    offeredBreak: null;
    reason: null;
    plan: AdaptationPlan | null;
  },
}));

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
  ],
} as unknown as Lesson;

const HINT = "Look at the bottom number first.";

afterEach(() => {
  cleanup();
  runtime.value = { offeredBreak: null, reason: null, plan: null };
});

describe("the engine's mid-lesson instruction", () => {
  it("shows a hint that arrived mid-lesson, when the opening plan had none", () => {
    runtime.value = {
      offeredBreak: null,
      reason: null,
      plan: {
        lessonId: "frac-3",
        segments: [],
        adjustment: "offer_hint",
        hint: HINT,
      } as AdaptationPlan,
    };

    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("shows nothing when the engine has not said anything mid-lesson", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(screen.queryByText(HINT)).toBeNull();
  });
});
