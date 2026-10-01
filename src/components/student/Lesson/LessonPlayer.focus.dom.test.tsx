import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { Lesson } from "@/lib/types";

/**
 * Advancing a segment used to drop focus on the floor.
 *
 * The segment body is keyed `${segment.id}:${modality}`, deliberately, so that
 * entry motion replays and per-modality state never leaks between segments. But
 * changing a key throws the subtree away and builds a new one - so anything
 * focused inside it goes too, and the browser drops focus to `<body>`.
 *
 * A child using a keyboard or switch access was therefore returned to the top
 * of the document on every advance, and had to tab back down through the whole
 * player to reach the next thing to read. Nothing on screen said so, and it is
 * invisible to anyone reviewing with a mouse - which is why it survived.
 *
 * These tests are written against `document.activeElement`, because that is the
 * only thing that actually distinguishes the fix from the bug.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
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

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    segment("seg-1", "Numerators"),
    segment("seg-2", "Denominators"),
    segment("seg-3", "Equivalence"),
  ],
} as unknown as Lesson;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));

describe("LessonPlayer — focus when the content changes", () => {
  it("does not seize focus on arrival", () => {
    // Landing in a lesson should leave focus where the browser put it.
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the new segment when a child advances", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    next();

    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    expect(active.getAttribute("role")).toBe("group");
    expect(active.textContent).toContain("Denominators");
  });

  it("names where they now are, so a screen reader says it", () => {
    // The orientation a sighted child reads off the line above the progress
    // bar, given to everyone else.
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    next();

    expect(
      (document.activeElement as HTMLElement).getAttribute("aria-label"),
    ).toMatch(/Segment 2 of 3/);
  });

  it("keeps doing it on every advance, not just the first", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    next();
    next();

    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute("aria-label")).toMatch(/Segment 3 of 3/);
    expect(active.textContent).toContain("Equivalence");
  });

  it("moves focus back when a child goes to the previous segment", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    next();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(
      (document.activeElement as HTMLElement).getAttribute("aria-label"),
    ).toMatch(/Segment 1 of 3/);
  });
});
