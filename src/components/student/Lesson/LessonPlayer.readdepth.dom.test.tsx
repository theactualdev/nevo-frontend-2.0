import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { Lesson } from "@/lib/types";
import { offendingCalls } from "@/test/signalCatalogue";
import { pageScrolledColumn, selfScrolledColumn } from "@/test/readingColumn";

/**
 * How far into a segment a child is reported to have read, as the catalogue
 * takes it (6 Oct).
 *
 * Depth goes up as `[depthRatio]` - a ratio, so the bottom is 1, not 100 - on
 * two types: `scroll`, "the child scrolls within a segment", at each mark
 * passed; and since 8 Oct (B90) `time_on_segment`, the furthest down it was
 * seen, counting a segment that fits on one screen as seen whole. It used to
 * go up twice and in neither form: `depthPct` on each scroll mark, and a
 * `scrollDepthPct` on `time_on_segment` that the catalogue did not declare.
 *
 * AND THE MARKS NEVER WENT UP AT ALL. They were read from the column's own
 * scroll, and the column never scrolls: the player is `min-h-[100dvh]`, so it
 * grows with the segment and the page scrolls instead. The old tests here gave
 * the column room of its own, a layout no phone ever showed, and passed.
 * `pageScrolledColumn` lays it out the way it really is.
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
  ],
} as unknown as Lesson;

/** Every payload of one type, in order. */
const sent = (type: string) =>
  trackEvent.mock.calls
    .filter((c) => c[0] === type)
    .map((c) => c[1] as Record<string, unknown>);

const marks = () =>
  sent(SIGNAL_EVENT_TYPES.SCROLL).map((p) => p.depthRatio);

/** The long segment measured on a phone: 2665px of column, 812px of screen. */
const LONG = { height: 2665, top: 120, viewport: 812 };

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("how far a child is reported to have read", () => {
  it("is measured on the page, because the page is what scrolls", () => {
    // THE BUG. The column's own scroll never fires on a real layout, so a
    // child who scrolled a long segment halfway was reported as nothing.
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const page = pageScrolledColumn(container, LONG);

    page.scrollPageTo(700); // the screen now reaches halfway down the column

    expect(sent(SIGNAL_EVENT_TYPES.SCROLL)).toEqual([
      { segmentId: "seg-1", depthRatio: 0.25 },
      { segmentId: "seg-1", depthRatio: 0.5 },
    ]);
  });

  it("credits a child who scrolls to the bottom of a long segment with all of it", () => {
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const page = pageScrolledColumn(container, LONG);

    page.scrollPageTo(2100);

    expect(marks()).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("sends each mark once per segment, however often it is passed", () => {
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const page = pageScrolledColumn(container, LONG);

    page.scrollPageTo(2100);
    page.scrollPageTo(0);
    page.scrollPageTo(2100);

    expect(marks()).toHaveLength(4);
  });

  it("reads the column itself too, if it is ever the one that scrolls", () => {
    // A layout change must not silently stop the marks a second time.
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const column = selfScrolledColumn(container, { room: 1400, shown: 600 });

    column.scrollColumnTo(700); // 1300 of 2000px has been on screen

    expect(marks()).toEqual([0.25, 0.5]);
  });

  it("does not count something else scrolling as the child scrolling the segment", () => {
    // A sheet, a drawer: their scroll is not the segment's.
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    pageScrolledColumn(container, LONG);
    const drawer = document.createElement("div");
    document.body.appendChild(drawer);

    fireEvent.scroll(drawer);

    expect(marks()).toEqual([]);
    drawer.remove();
  });

  it("does not count the player's own move onto a new segment as the child scrolling", () => {
    /*
     * Next moves focus onto the new segment, and that moves the page: a
     * scroll event the child did not make. Nothing goes up until they go
     * further down than the segment opened showing.
     */
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const page = pageScrolledColumn(container, LONG);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    page.scrollPageTo(0); // the event, with the page where Next left it

    expect(marks()).toEqual([]);

    page.scrollPageTo(700); // and now the child scrolls
    expect(sent(SIGNAL_EVENT_TYPES.SCROLL)).toEqual([
      { segmentId: "seg-2", depthRatio: 0.25 },
      { segmentId: "seg-2", depthRatio: 0.5 },
    ]);
  });

  it("sends nothing for a segment that fits, however the page moves", () => {
    // A segment all on one screen cannot be scrolled within, so a page that
    // moves under it - the header scrolling away - is not a depth reached.
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const page = pageScrolledColumn(container, { height: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    page.scrollPageTo(100);

    expect(marks()).toEqual([]);
  });

  it("sends no scroll for a segment nobody scrolled", () => {
    // "The child scrolls within a segment." A segment that fits was never
    // scrolled, and a depth for it would be a scroll that did not happen.
    const { unmount } = render(<LessonPlayer lesson={LESSON} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    unmount();

    expect(marks()).toEqual([]);
  });

});

/*
 * HOW FAR DOWN A SEGMENT THE CHILD SAW, ON THE TIME SPENT ON IT (B90, 8 Oct).
 *
 * `time_on_segment` takes `[depthRatio]` now: the furthest down the segment
 * that was on screen, measured where the marks are. Unlike a `scroll` mark it
 * needs no scroll - a segment that fits on one screen was seen whole, which is
 * most of them, and is 1.
 */
describe("depthRatio on the time spent on a segment", () => {
  const timeOn = (segmentId: string) =>
    sent(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT).find(
      (t) => t.segmentId === segmentId,
    );

  it("is all of a segment that fits on one screen, scrolled or not", () => {
    const { container, unmount } = render(
      <LessonPlayer lesson={LESSON} plan={null} />,
    );
    pageScrolledColumn(container, { height: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    unmount();

    expect(timeOn("seg-2")?.depthRatio).toBe(1);
  });

  it("is the furthest down a long segment has been, not where it was left", () => {
    const { container, unmount } = render(
      <LessonPlayer lesson={LESSON} plan={null} />,
    );
    const page = pageScrolledColumn(container, LONG);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    page.scrollPageTo(1400); // 2092 of 2665px has been on screen
    page.scrollPageTo(0); // and back up, which unreads nothing

    unmount();

    expect(timeOn("seg-2")?.depthRatio).toBeCloseTo(2092 / 2665, 6);
  });

  it("is as much as opened on screen, for a long segment never scrolled", () => {
    const { container, unmount } = render(
      <LessonPlayer lesson={LESSON} plan={null} />,
    );
    pageScrolledColumn(container, LONG);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    unmount();

    // 812px of screen less the 120px above the column.
    expect(timeOn("seg-2")?.depthRatio).toBeCloseTo(692 / 2665, 6);
  });

  it("belongs to the segment it was measured on", () => {
    const { container } = render(<LessonPlayer lesson={LESSON} plan={null} />);
    const page = pageScrolledColumn(container, LONG);
    page.scrollPageTo(2100); // all of seg-1

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(timeOn("seg-1")?.depthRatio).toBe(1);
  });

  it("is left off where nothing was laid out to measure, rather than sent as 0", () => {
    const { unmount } = render(<LessonPlayer lesson={LESSON} plan={null} />);

    unmount();

    const [time] = sent(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT);
    expect(time.segmentId).toBe("seg-1");
    expect(time).not.toHaveProperty("depthRatio");
    expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
  });
});
