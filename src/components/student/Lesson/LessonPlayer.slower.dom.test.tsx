import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { pageScrolledColumn } from "@/test/readingColumn";

/**
 * THE ONE PLACE A CHILD HAS ANY AGENCY, AND IT WAS ABSENT ON EVERY LIVE LESSON.
 *
 * Simplify / Expand / Slower switch between authored reshapes of a segment, and
 * parsed content has one body and no reshapes - so the bar was hidden entirely
 * for every signed-in child. Only the authored demo ever showed it. That is the
 * right behaviour for a rewording nobody wrote, and the wrong behaviour for
 * Slower, because Slower is not a rewording.
 *
 * Design's ruling, 17 Sep: "Slower is about how much arrives at once, which is
 * segmentation and pacing rather than wording." The player already had that
 * mechanism - the chunked flow the `attention` accommodation uses - built from
 * the body the lesson already has. So Slower needs no authored content and
 * reaches live lessons today.
 *
 * WHY IT MATTERS MORE THAN ITS SIZE. Design again: in a system that
 * deliberately tells a child nothing about what it is doing, the control is the
 * only place the child can ask, and asking is not a disclosure about
 * themselves. Without it the child is entirely subject to inference.
 *
 * A chunk fits on screen, so any scroll past it reads as its bottom - which is
 * exactly the case where a chunk's scroll would read as the whole segment's.
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

/** Three sentences. A body with fewer than two chunks to itself. */
const THREE = "One idea here. A second idea here. A third idea here.";
const ONE = "Only one idea here.";

const lessonWith = (text: Record<string, unknown>, second = false): Lesson =>
  ({
    id: "photo-1",
    title: "Photosynthesis",
    segments: [
      { id: "seg-1", modalities: ["text"], text },
      ...(second
        ? [
            {
              id: "seg-2",
              modalities: ["text"],
              text: { heading: "Next", body: { default: THREE } },
            },
          ]
        : []),
    ],
  }) as unknown as Lesson;

/** A live lesson's shape: one body, no reshapes, no accommodations. */
const LIVE = lessonWith({ heading: "Inside a leaf", body: { default: THREE } });
const PLAN: AdaptationPlan = { lessonId: "photo-1", segments: [] };

const slowerChip = () => screen.queryByRole("button", { name: "Slower" });
const continueChip = () =>
  screen.queryByRole("button", { name: "Tap to continue" });

/** Every `scroll` the player sent. */
const scrolls = () =>
  trackEvent.mock.calls.filter((c) => c[0] === SIGNAL_EVENT_TYPES.SCROLL);

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("a child asking for less at a time, on a live lesson", () => {
  it("offers Slower where nothing was authored", () => {
    render(<LessonPlayer lesson={LIVE} plan={PLAN} />);

    expect(slowerChip()).toBeInTheDocument();
  });

  it("offers ONLY Slower, because the other two would be a lie", () => {
    // Simplify and Expand switch to authored text that does not exist here. An
    // offered density that re-renders identical prose is the player telling a
    // child it adapted when it did not.
    render(<LessonPlayer lesson={LIVE} plan={PLAN} />);

    expect(screen.queryByRole("button", { name: "Simplify" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
  });

  it("breaks the body into parts when the child asks", () => {
    render(<LessonPlayer lesson={LIVE} plan={PLAN} />);

    expect(continueChip()).toBeNull();
    fireEvent.click(slowerChip()!);

    expect(continueChip()).toBeInTheDocument();
  });

  it("tells the engine the child asked, and nothing the catalogue lacks", () => {
    // An observed fact, not a parameter. The trigger means the child asked -
    // the catalogue's own definition - so the `source: manual` that rode
    // with it said nothing new, under a key the catalogue does not take.
    render(<LessonPlayer lesson={LIVE} plan={PLAN} />);
    fireEvent.click(slowerChip()!);

    expect(trackEvent).toHaveBeenCalledWith(SIGNAL_EVENT_TYPES.SLOWER_TRIGGER, {
      segmentId: "seg-1",
    });
  });

  it("does not report one part's scroll as the whole segment read", () => {
    /*
     * THE HALF THAT MAKES THIS SAFE TO SHIP.
     *
     * A chunk always fits, so its column has no room to scroll and any scroll
     * reads as the bottom - of a third. Sent as `depthRatio: 1`, a child who
     * asked for less at a time would be reported as having read all of it,
     * and the engine would learn from that. Asking for help must not cost the
     * child the accuracy of what the engine knows about them.
     */
    const { container } = render(<LessonPlayer lesson={LIVE} plan={PLAN} />);
    fireEvent.click(slowerChip()!);

    pageScrolledColumn(container, { height: 300 }).scrollPageTo(2_000);

    expect(scrolls()).toEqual([]);
  });

  it("says how far down it was seen by the parts shown, not one part's fit (B90)", () => {
    // The same trap on `time_on_segment`'s `depthRatio`: Part 1 of 3 fits on
    // screen, and measured as a segment it would read as all of it.
    const { container, unmount } = render(
      <LessonPlayer lesson={LIVE} plan={PLAN} />,
    );
    const page = pageScrolledColumn(container, { height: 300 });
    fireEvent.click(slowerChip()!);
    page.scrollPageTo(2_000);

    unmount();

    const time = trackEvent.mock.calls.find(
      (c) => c[0] === SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT,
    )?.[1] as Record<string, unknown>;
    expect(time.depthRatio).toBe(0.33);
  });

  it("does not offer a control that would do nothing", () => {
    // One sentence chunks to itself. Asking for less at a time and getting the
    // same screen teaches the child the control is a lie.
    render(
      <LessonPlayer
        lesson={lessonWith({ heading: "Inside a leaf", body: { default: ONE } })}
        plan={PLAN}
      />,
    );

    expect(slowerChip()).toBeNull();
  });
});

describe("the choice holds for the lesson, and no further", () => {
  it("is still in force on the next segment", () => {
    /*
     * Design's ruling, 18 Sep: "Resetting it every segment would be maddening,
     * and storing it would make it an accommodation, which is exactly what we
     * just said it is not. It holds for the current lesson and resets after."
     *
     * Before this, the pick was cleared on every segment change - a child who
     * wanted less at a time had to ask again, and again, all the way through.
     */
    render(
      <LessonPlayer
        lesson={lessonWith(
          { heading: "Inside a leaf", body: { default: THREE } },
          true,
        )}
        plan={PLAN}
      />,
    );
    fireEvent.click(slowerChip()!);
    expect(continueChip()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(continueChip()).toBeInTheDocument();
  });

  it("is gone when the next lesson opens", () => {
    // "Resets after." It lives in component state and nowhere else, so a new
    // lesson is a new player - never the profile, never the device.
    const lesson = lessonWith({
      heading: "Inside a leaf",
      body: { default: THREE },
    });
    render(<LessonPlayer lesson={lesson} plan={PLAN} />);
    fireEvent.click(slowerChip()!);
    expect(continueChip()).toBeInTheDocument();

    cleanup();
    render(<LessonPlayer lesson={lesson} plan={PLAN} />);

    expect(continueChip()).toBeNull();
  });

  it("reports no trigger for a density the plan chose, only for the child's", () => {
    /*
     * A trigger is the child asking - the catalogue's definition of all three.
     * The plan's density for the next segment went up as one, with `source:
     * "system"`, whenever the child had not overridden it.
     */
    const planned: AdaptationPlan = {
      lessonId: "photo-1",
      segments: [
        { segmentId: "seg-2", startModality: "text", density: "simplify" },
      ] as unknown as AdaptationPlan["segments"],
    };
    render(
      <LessonPlayer
        lesson={lessonWith(
          { heading: "Inside a leaf", body: { default: THREE } },
          true,
        )}
        plan={planned}
      />,
    );
    trackEvent.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      trackEvent.mock.calls.filter(
        (c) => c[0] === SIGNAL_EVENT_TYPES.SIMPLIFY_TRIGGER,
      ),
    ).toEqual([]);
  });
});

describe("authored Slower still wins where it exists", () => {
  it("renders the numbered cards rather than chunking the body", () => {
    // The richer form. Doing both would make the child read the same idea
    // twice, the second time in pieces.
    render(
      <LessonPlayer
        lesson={lessonWith({
          heading: "Inside a leaf",
          body: { default: THREE, slower: THREE },
          slowerSteps: ["First this", "Then this"],
        })}
        plan={PLAN}
      />,
    );
    fireEvent.click(slowerChip()!);

    expect(screen.getByText("First this")).toBeInTheDocument();
    expect(continueChip()).toBeNull();
  });
});

describe("the accommodation is untouched by any of this", () => {
  it("still chunks for `attention` without the child asking", () => {
    // Engine-owned and applied before the first screen. The child's control is
    // a separate input to the same renderer and must never write to it.
    render(
      <LessonPlayer
        lesson={LIVE}
        plan={{ ...PLAN, accommodations: { attention: true } }}
      />,
    );

    expect(continueChip()).toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalledWith(
      SIGNAL_EVENT_TYPES.SLOWER_TRIGGER,
      expect.anything(),
    );
  });
});
