import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * The UDL accommodations were computed, shown to the teacher as active, and
 * never applied to the child.
 *
 * `AdaptationPlan.accommodations` is read by the player — a spacious body for
 * `reading`, a chunked flow and dimmed chrome for `attention` — and
 * `toAdaptationPlan` never set the field. It was permanently undefined for
 * every signed-in child. The only plan that ever carried one was the authored
 * mock, which only a signed-OUT visitor sees: the demo had the accommodation
 * and the SEND learner it was built for did not, while the teacher's screen
 * said "Support Nevo has turned on".
 *
 * THE SECOND HALF, AND THE REASON THIS COULD NOT SIMPLY BE SWITCHED ON. The
 * player decides a segment was fully read when its column has no room to
 * scroll. That is right for a whole segment and false for one chunk of one,
 * because a chunk always fits — so turning `attention` on would have reported
 * every chunked segment as fully read the instant it opened, however little of
 * it the child saw. It would have corrupted the signal for exactly the children
 * the accommodation exists to help, since only they are ever chunked.
 *
 * jsdom reports every element as 0×0, so `scrollHeight - clientHeight` is 0 and
 * a segment is "non-scrolling" by default — which is the case under test, and
 * the case that used to report a false 100.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
  useBreakMonitor: () => ({ due: false, dismiss: vi.fn() }),
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

/*
 * THREE SENTENCES, DELIBERATELY. `chunk()` returns the body unsplit when it
 * holds fewer than two sentences, which takes the single-part branch and
 * renders a plain paragraph with no parts, no pause and no continue control.
 * The factory the sibling suites use produces a one-sentence body, so an
 * attention test built on it would exercise none of this and quietly assert
 * nothing.
 */
const THREE = "One idea here. A second idea here. A third idea here.";

const segment = (id: string, heading: string) => ({
  id,
  modalities: ["text"] as const,
  text: { heading, body: { default: THREE } },
});

const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [segment("seg-1", "Numerators"), segment("seg-2", "Denominators")],
} as unknown as Lesson;

const planWith = (
  accommodations: AdaptationPlan["accommodations"],
): AdaptationPlan => ({ lessonId: "frac-3", segments: [], accommodations });

/** The hold before the pause's Continue becomes usable. */
const PAUSE_MS = 4_000;

/**
 * Move to the next part the way a child does: ask, wait out the breathing
 * pause, continue. The wait is not optional — Continue is `disabled` until the
 * pause has passed, so a test that skips the clock clicks a dead control and
 * then fails somewhere else entirely.
 */
const nextPart = () => {
  fireEvent.click(screen.getByRole("button", { name: "Tap to continue" }));
  act(() => {
    vi.advanceTimersByTime(PAUSE_MS);
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

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

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("an accommodation the plan carries reaches the child", () => {
  it("chunks the body when attention is on", () => {
    // The whole defect in one assertion: this is what the teacher is told is
    // happening, and what never happened.
    render(
      <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
    );

    expect(screen.getByText("Part 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("One idea here.")).toBeInTheDocument();
    expect(screen.queryByText(/A third idea here/)).not.toBeInTheDocument();
  });

  it("leaves the body whole when it is not", () => {
    // The other half of the same claim — without this, a test that always
    // chunked would pass against a build that always chunked.
    render(
      <LessonPlayer lesson={LESSON} plan={planWith({ attention: false })} />,
    );

    expect(screen.queryByText("Part 1 of 3")).not.toBeInTheDocument();
    expect(screen.getByText(THREE)).toBeInTheDocument();
  });

  it("leaves the body whole when the plan carries no accommodations at all", () => {
    // The state every signed-in child was actually in.
    render(<LessonPlayer lesson={LESSON} plan={planWith(undefined)} />);

    expect(screen.queryByText("Part 1 of 3")).not.toBeInTheDocument();
  });
});

describe("what a chunked segment reports having been read", () => {
  it("reports a third when the child saw one part of three", () => {
    /*
     * THE ONE THAT MATTERS. Before this, the body fitted on screen — because a
     * chunk always does — so the player recorded 100 the moment the segment
     * opened, and a child who read a third was reported as having read all of
     * it.
     */
    const { unmount } = render(
      <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
    );

    unmount();

    expect(depthFor("seg-1")).toBe(33);
  });

  it("rises as the child works through the parts", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
      );

      nextPart();
      unmount();

      expect(depthFor("seg-1")).toBe(67);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports all of it once the last part is showing", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
      );

      nextPart();
      nextPart();
      unmount();

      expect(depthFor("seg-1")).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still reports an unchunked segment as fully read", () => {
    /*
     * The behaviour this fix must not break: a segment that fits and is NOT
     * chunked is genuinely all on screen, and reporting it as unread was its
     * own bug, fixed separately. The chunk report must not leak into the
     * ordinary path.
     */
    const { unmount } = render(<LessonPlayer lesson={LESSON} plan={null} />);

    unmount();

    expect(depthFor("seg-1")).toBe(100);
  });

  it("does not carry one segment's chunk count onto the next", () => {
    /*
     * The report is stamped with a segment id rather than cleared on change,
     * because React runs child effects before parent ones — a reset here would
     * wipe the incoming segment's fresh report instead of the outgoing one's.
     * This is the test that a stale report cannot be read as the new segment's.
     *
     * Read to the end first, because Next is only there on the last part now
     * (37c) - which makes the outgoing report 100 and a carry easier to see.
     */
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
      );

      nextPart();
      nextPart();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      unmount();

      expect(depthFor("seg-1")).toBe(100);
      expect(depthFor("seg-2")).toBe(33);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the way on under the attention accommodation (37c)", () => {
  /*
   * The frame draws no chevron row while parts are left: "Tap to continue" is
   * the only way on. The row was only dimmed, so Next skipped Parts 2 and 3.
   */
  it("offers no Next while parts are left", () => {
    vi.useFakeTimers();
    try {
      render(
        <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
      );
      expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

      nextPart();
      expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("brings Next back on the last part, which has no continue of its own", () => {
    vi.useFakeTimers();
    try {
      render(
        <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
      );

      nextPart();
      nextPart();

      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves Next alone when attention is off", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={planWith({ attention: false })} />,
    );

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});

describe("the chrome dim", () => {
  const header = () =>
    screen.getByRole("button", { name: "Exit lesson" }).closest("header")!;

  it("is the attention accommodation's 30%", () => {
    render(
      <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
    );

    expect(header()).toHaveClass("opacity-30");
  });

  it("is applied by no instruction now that modulate_density is gone (SCRUM-180)", () => {
    render(
      <LessonPlayer
        lesson={LESSON}
        plan={
          {
            ...planWith(undefined),
            adjustment: "modulate_density",
          } as unknown as AdaptationPlan
        }
      />,
    );

    expect(header().className).not.toMatch(/opacity-\d/);
  });
});

describe("the breathing pause", () => {
  it("does not offer Continue before the pause has passed", () => {
    /*
     * It was hidden with `opacity-0` and `pointer-events-none`, which stops a
     * mouse and stops nothing else: the control stayed in the tab order and a
     * screen reader announced a live "Continue" immediately. A child on a
     * keyboard or switch access could skip the pause without knowing it was
     * there.
     *
     * Asserted through `disabled` rather than visibility on purpose — jsdom
     * loads no stylesheet, so an opacity class is invisible to the test and an
     * assertion on it would pass either way.
     */
    vi.useFakeTimers();
    try {
      render(
        <LessonPlayer lesson={LESSON} plan={planWith({ attention: true })} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Tap to continue" }));

      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
