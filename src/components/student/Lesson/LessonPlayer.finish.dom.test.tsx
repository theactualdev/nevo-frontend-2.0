import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { Lesson } from "@/lib/types";

/**
 * Two things a child cannot see and both got wrong.
 *
 * A lesson with no end-of-lesson questions could not be FINISHED: forward was
 * disabled on its last segment, and forward is the only way to the completion
 * screen. And the time spent on a segment was measured with the wall clock,
 * which rule 4 forbids for anything sent to the engine - a tablet correcting
 * its clock mid-lesson sent a negative duration.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
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

const segment = (id: string, heading: string) => ({
  id,
  modalities: ["text"] as const,
  text: { heading, body: { default: `Body of ${heading}.` } },
});

/** No `assessment` and no quick checks - the lesson that could not end. */
const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [segment("seg-1", "Numerators"), segment("seg-2", "Denominators")],
} as unknown as Lesson;

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a lesson with no end-of-lesson questions", () => {
  it("can still be finished from its last segment", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    next(); // to the last segment
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    next(); // and out of it

    expect(
      screen.getByRole("heading", { name: /That's the lesson done/ }),
    ).toBeVisible();
  });
});

describe("time on a segment", () => {
  it("is measured on the monotonic clock, not the wall clock", () => {
    // The wall clock jumps BACKWARDS mid-segment - a tablet correcting itself.
    const wall = vi.spyOn(Date, "now");
    wall.mockReturnValue(1_000_000);
    let mono = 5_000;
    vi.spyOn(performance, "now").mockImplementation(() => mono);

    render(<LessonPlayer lesson={LESSON} plan={null} />);
    mono = 8_000;
    wall.mockReturnValue(10_000);
    next();

    const sent = trackEvent.mock.calls.find(
      (c) =>
        c[0] === SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT &&
        c[1]?.segmentId === "seg-1",
    );
    expect(sent?.[1].durationMs).toBe(3_000);
  });
});
