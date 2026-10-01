import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { Lesson } from "@/lib/types";

/**
 * Every segment that fits on one screen told the engine the child read none of
 * it.
 *
 * `handleScroll` already had the right rule — no room to scroll means the child
 * can see all of it, so depth is 100 — but it lives in an `onScroll` handler.
 * A segment that fits never scrolls, so the handler never runs and the rule
 * never fires. `scrollDepth` stayed at the 0 it is reset to on entry.
 *
 * That is MOST segments: this product keeps them short on purpose, for low
 * cognitive load. So the adaptation engine was being told "read nothing" about
 * children who had read everything.
 *
 * jsdom reports every element as 0×0, so `scrollHeight - clientHeight` is 0 and
 * a segment is "non-scrolling" by default — which is the case under test. The
 * scrollable case is made by giving the container real dimensions.
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

const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [
    segment("seg-1", "Numerators"),
    segment("seg-2", "Denominators"),
    segment("seg-3", "Equivalence"),
  ],
} as unknown as Lesson;

/** The depth reported for a segment when it was left. */
const depthFor = (segmentId: string) =>
  trackEvent.mock.calls
    .filter(
      (c) =>
        c[0] === SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT &&
        c[1]?.segmentId === segmentId,
    )
    .map((c) => c[1].scrollDepthPct)
    .at(-1);

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("how much of a segment a child is reported to have read", () => {
  it("reports a segment that fits on one screen as fully read", () => {
    // The bug. A short segment cannot be scrolled, so it reported 0 — the
    // engine was told the child read none of a thing they could see all of.
    const { unmount } = render(<LessonPlayer lesson={LESSON} plan={null} />);

    unmount();

    expect(depthFor("seg-1")).toBe(100);
  });

  it("keeps reporting it on every later segment, not just the first", () => {
    /*
     * THE ORDERING TEST, and it caught a real bug in the first version of this
     * fix. The depth is RESET to 0 when a segment is entered, and React runs
     * effects in declaration order — so measuring before the reset means the
     * reset wipes the measurement on every segment change. The fix looked
     * correct, passed a single-render test, and did nothing.
     */
    const { unmount } = render(<LessonPlayer lesson={LESSON} plan={null} />);

    next();
    next();
    unmount();

    expect(depthFor("seg-2")).toBe(100);
    expect(depthFor("seg-3")).toBe(100);
  });

  it("does not claim a scrollable segment was read to the end", () => {
    // The other direction, and the reason this cannot simply hardcode 100: a
    // segment with room to scroll has to be scrolled to be read, and reporting
    // otherwise would be the same fabrication pointing the other way.
    const { container, unmount } = render(
      <LessonPlayer lesson={LESSON} plan={null} />,
    );
    const scroller = container.querySelector(
      ".overflow-y-auto",
    ) as HTMLDivElement;
    Object.defineProperty(scroller, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(scroller, "clientHeight", {
      value: 500,
      configurable: true,
    });
    // Re-enter the segment so the measurement runs against these dimensions.
    next();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    unmount();

    expect(depthFor("seg-1")).not.toBe(100);
  });

  it("still credits a child who scrolls a long segment to the bottom", () => {
    const { container, unmount } = render(
      <LessonPlayer lesson={LESSON} plan={null} />,
    );
    const scroller = container.querySelector(
      ".overflow-y-auto",
    ) as HTMLDivElement;
    Object.defineProperty(scroller, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(scroller, "clientHeight", {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(scroller, "scrollTop", {
      value: 1500,
      configurable: true,
    });
    fireEvent.scroll(scroller);

    unmount();

    expect(depthFor("seg-1")).toBe(100);
  });
});
