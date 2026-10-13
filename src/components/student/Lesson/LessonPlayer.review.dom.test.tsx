import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { LESSON_STATUS } from "@/lib/api/lessons";
import type { Lesson } from "@/lib/types";

/**
 * A review session used to demote the lesson it was reviewing.
 *
 * A review is spaced retrieval on a lesson the child has already FINISHED
 * (37d). But the player's position effect wrote `in_progress` at the current
 * segment on every move, with no regard for whether it was a review — so
 * opening one rewrote a completed lesson as `in_progress, segment 0` on the
 * first frame.
 *
 * Finishing the review put the completion back, which is why this survived.
 * Leaving it partway did not: the lesson stayed demoted, came back on Home as
 * unfinished work to pick up, and the child was invited to redo work they had
 * already done. The record of having completed it was gone.
 *
 * These assert on what is WRITTEN, because nothing on screen differs.
 */

const { report } = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({
    sessionId: null,
    report,
    completionFailed: false,
  }),
}));

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

/** Every status this render reported, in order. */
const statuses = () => report.mock.calls.map((c) => c[0]);

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));

/**
 * A review opens on its own entry screen (37d), not on the segments. Getting
 * past it is part of what the test is exercising: the demotion happened the
 * moment the segments mounted.
 */
const beginReview = () => {
  const begin = screen.queryByRole("button", { name: /begin|start|ready/i });
  if (begin) fireEvent.click(begin);
};

beforeEach(() => {
  report.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("a review session", () => {
  it("does not report the lesson as in progress when it opens", () => {
    // The first frame is where the damage was done: the position effect fired
    // on mount and wrote segment 0 against a completed lesson.
    render(<LessonPlayer lesson={LESSON} plan={null} review />);
    beginReview();

    expect(statuses()).not.toContain(LESSON_STATUS.IN_PROGRESS);
  });

  it("does not report it as in progress as the child moves through it", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} review />);
    beginReview();

    next();
    next();

    expect(statuses()).not.toContain(LESSON_STATUS.IN_PROGRESS);
  });

  it("does not report it as exited when the child leaves part way", () => {
    // The worst case: a child opens a review, changes their mind, and the
    // lesson they finished last week is now "exited" at segment one.
    render(<LessonPlayer lesson={LESSON} plan={null} review />);
    beginReview();
    next();

    // Exit opens the leave dialog; "Leave for now" is what actually reports.
    // Found by role and NOT conditionally clicked - an `if (button)` here made
    // this test pass against a player that still wrote `exited`, because the
    // button was never found and nothing was ever reported either way.
    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(statuses()).not.toContain(LESSON_STATUS.EXITED);
  });
});

describe("a finished lesson, reopened", () => {
  /*
   * Design D22, 1 Oct: reopening a finished lesson never marks it unfinished;
   * it opens for review. It opened as new work, and the first frame wrote
   * `in_progress, 0` over the completion - the same demotion the review fix
   * above closed, reached through the Lessons tab instead.
   */
  it("does not report it as in progress when it opens", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} finished />);

    expect(statuses()).not.toContain(LESSON_STATUS.IN_PROGRESS);
  });

  it("does not report it as in progress as the child moves through it", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} finished />);

    next();
    next();

    expect(statuses()).not.toContain(LESSON_STATUS.IN_PROGRESS);
  });

  it("does not report it as exited when the child leaves part way", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} finished />);
    next();

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(statuses()).not.toContain(LESSON_STATUS.EXITED);
  });

  it("still reports completion when the child finishes it again", () => {
    // Completed over completed is still true; only the demotion is withheld.
    render(<LessonPlayer lesson={LESSON} plan={null} finished />);

    next();
    next();
    next();

    expect(statuses()).toEqual([LESSON_STATUS.COMPLETED]);
  });
});

describe("an ordinary lesson", () => {
  it("still reports where the child has got to", () => {
    // The whole point of the position write, and it must survive the fix.
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(statuses()).toContain(LESSON_STATUS.IN_PROGRESS);
  });

  it("still reports each new segment as the child advances", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    report.mockClear();

    next();

    expect(statuses()).toContain(LESSON_STATUS.IN_PROGRESS);
    expect(report.mock.calls.at(-1)?.[1]).toMatchObject({ segment: 1 });
  });

  it("still reports a deliberate exit", () => {
    // The other half of the guard: `exited` is a status the contract defines
    // and the engine is entitled to it. Only a REVIEW withholds it.
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    next();

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(statuses()).toContain(LESSON_STATUS.EXITED);
  });
});
