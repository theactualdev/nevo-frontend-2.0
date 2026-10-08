import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * The server's reading chunks in the player (SCRUM-234): what the engine is
 * told as a child reads through them, and what the child is offered.
 *
 * `reading_chunk_viewed` is "A stable reading chunk entered view or was
 * passed", carrying `segmentId`, `chunkId`, `action` and `formFactor` - the
 * last because a scroll on a phone is not a scroll on a desktop. Nothing
 * here counts rereads; that is the server's reading of the pairs.
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

const BODY = "One idea here. A second idea here. A third idea here.";

const lessonWith = (readingChunks: { id: string; text: string }[]): Lesson =>
  ({
    id: "photo-1",
    title: "Photosynthesis",
    segments: [
      {
        id: "seg-1",
        modalities: ["text"],
        text: { heading: "Inside a leaf", body: { default: BODY }, readingChunks },
      },
    ],
  }) as unknown as Lesson;
const PLAN: AdaptationPlan = { lessonId: "photo-1", segments: [] };

type Report = (entries: Partial<IntersectionObserverEntry>[]) => void;
let watchers: { report: Report; targets: Element[]; on: boolean }[];

beforeEach(() => {
  trackEvent.mockReset();
  watchers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      w: (typeof watchers)[number];
      constructor(report: Report) {
        this.w = { report, targets: [], on: true };
        watchers.push(this.w);
      }
      observe(el: Element) {
        this.w.targets.push(el);
      }
      disconnect() {
        this.w.on = false;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function see(id: string, where: "in" | "above") {
  const w = watchers.find(
    (x) => x.on && x.targets.some((t) => (t as HTMLElement).dataset.chunkId === id),
  )!;
  const target = w.targets.find((t) => (t as HTMLElement).dataset.chunkId === id)!;
  act(() =>
    w.report([
      {
        target,
        isIntersecting: where === "in",
        boundingClientRect: (where === "in"
          ? { top: 100, bottom: 200 }
          : { top: -300, bottom: -100 }) as DOMRect,
        rootBounds: { top: 0, height: 800 } as DOMRect,
      },
    ]),
  );
}

const viewed = () =>
  trackEvent.mock.calls.filter(
    ([t]) => t === SIGNAL_EVENT_TYPES.READING_CHUNK_VIEWED,
  );

describe("reading through the server's chunks", () => {
  const CHUNKS = [
    { id: "c1", text: "One idea here." },
    { id: "c2", text: "A second idea here. A third idea here." },
  ];

  it("tells the engine which chunk entered view and which was passed", () => {
    render(<LessonPlayer lesson={lessonWith(CHUNKS)} plan={PLAN} />);

    see("c1", "in");
    see("c1", "above");

    expect(viewed().map(([, payload]) => payload)).toEqual([
      { segmentId: "seg-1", chunkId: "c1", action: "entered", formFactor: "desktop" },
      { segmentId: "seg-1", chunkId: "c1", action: "passed", formFactor: "desktop" },
    ]);
  });

  it("sends exactly the catalogue's keys", () => {
    render(<LessonPlayer lesson={lessonWith(CHUNKS)} plan={PLAN} />);
    see("c2", "in");

    expect(viewed()).toHaveLength(1);
    expect(offendingCalls(viewed())).toEqual([]);
  });

  it("offers Slower where the server broke the body", () => {
    render(<LessonPlayer lesson={lessonWith(CHUNKS)} plan={PLAN} />);

    expect(screen.getByRole("button", { name: "Slower" })).toBeInTheDocument();
  });

  it("offers no Slower for a body the server sent as one chunk", () => {
    // Three sentences would split on the device. The server's one chunk wins,
    // so Slower would re-render the same block: a control that does nothing.
    render(
      <LessonPlayer lesson={lessonWith([{ id: "c1", text: BODY }])} plan={PLAN} />,
    );

    expect(screen.queryByRole("button", { name: "Slower" })).toBeNull();
  });
});
