import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { Lesson } from "@/lib/types";

/**
 * SCRUM-178, backend 9 Oct: "The player should use depthVariants.simplified
 * where available, falling back to the normal body where no simplified
 * variant exists" - for the whole of a lower-depth session, as the server's
 * instruction. Not the child's Simplify, and not the engine's: no chip lights
 * for it.
 */

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

const { trackEvent, applied } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  applied: {
    ref: null as { current: { count: number } } | null,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    applied.ref = args[4] as typeof applied.ref;
    return { trackEvent };
  },
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

const STANDARD_1 = "Numerators count the parts. They sit on top. Read them first.";
const SIMPLER_1 = "The top number counts the parts.";
const STANDARD_2 = "Denominators name the size. They sit underneath.";
const STANDARD_3 = "Equal fractions name the same amount. Two quarters is a half.";
const SIMPLER_3 = "Two quarters is a half.";

/** Built the way a live lesson is: `body.simplify` is `depthVariants.simplified`. */
const LESSON = {
  id: "lesson-1",
  title: "Fractions",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: {
        heading: "Numerators",
        body: { default: STANDARD_1, simplify: SIMPLER_1 },
      },
    },
    {
      id: "seg-2",
      modalities: ["text"],
      text: { heading: "Denominators", body: { default: STANDARD_2 } },
    },
    {
      id: "seg-3",
      modalities: ["text"],
      text: {
        heading: "Equivalence",
        body: { default: STANDARD_3, simplify: SIMPLER_3 },
      },
    },
  ],
} as unknown as Lesson;

const text = () => document.body.textContent ?? "";
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const depths = () =>
  trackEvent.mock.calls
    .filter(([type]) => type === "time_on_segment")
    .map(([, payload]) => (payload as { depthShown?: string }).depthShown);

beforeEach(() => {
  progress.report.mockReset();
  progress.sessionId = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
  progress.opened = null;
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("a lower-depth session (SCRUM-178)", () => {
  it("reads each segment's simplified version", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live depth="lower" />);

    expect(text()).toContain(SIMPLER_1);
    expect(text()).not.toContain(STANDARD_1);
  });

  it("falls back to the normal body where there is no simplified version", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live depth="lower" />);

    next();

    expect(text()).toContain(STANDARD_2);
    next();
    expect(text()).toContain(SIMPLER_3);
  });

  it("lights no chip and offers no Simplify over it", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live depth="lower" />);

    expect(screen.queryByRole("button", { name: "Simplify" })).toBeNull();
    for (const chip of screen.queryAllByRole("button", { pressed: true }))
      expect(chip.textContent).not.toMatch(/simplify|expand|slower/i);
    // The server's instruction for the session, not an adaptation applied.
    expect(applied.ref?.current.count).toBe(0);
  });

  it("tells the engine which version was on screen", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live depth="lower" />);

    next();
    next();

    expect(depths()).toEqual(["simplified", "standard"]);
  });

  it("applies the session's own word from the next segment, not under the one on screen", () => {
    const { rerender } = render(
      <LessonPlayer lesson={LESSON} plan={null} live />,
    );
    expect(text()).toContain(STANDARD_1);

    // `POST /session` answers: the rerouted, lower-depth session resumed.
    progress.opened = { sessionId: "s", resumed: true, depth: "lower" };
    rerender(<LessonPlayer lesson={LESSON} plan={null} live />);
    expect(text()).toContain(STANDARD_1);

    next();
    next();
    expect(text()).toContain(SIMPLER_3);
    expect(text()).not.toContain(STANDARD_3);
  });
});

describe("a standard session", () => {
  it("reads the normal body, and Simplify is still the child's to ask for", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} live />);

    expect(text()).toContain(STANDARD_1);
    expect(text()).not.toContain(SIMPLER_1);
    expect(screen.getByRole("button", { name: "Simplify" })).toBeTruthy();
  });

  it("stays standard when the session says so", () => {
    progress.opened = { sessionId: "s", resumed: false, depth: "standard" };
    render(<LessonPlayer lesson={LESSON} plan={null} live depth="standard" />);

    next();
    next();

    expect(text()).toContain(STANDARD_3);
    expect(depths()).toEqual(["standard", "standard"]);
  });
});
