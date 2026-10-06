import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LessonEndingRoute } from "./LessonEndingRoute";
import { SAMPLE_ATTR } from "@/lib/sampleData";

/**
 * `/summary` and `/review` resolved `getMockLesson(lessonId)` and `notFound()`.
 *
 * That worked for exactly the two authored demo lessons and dropped every real
 * one out of the app onto "This page doesn't exist" — no nav, no way back, and
 * a sentence written for a developer. It was survivable only because nothing
 * linked to them: the player gates "See summary" on `lesson.summary`, which no
 * real lesson carried.
 *
 * It carries one now. So these had to be rebuilt in the same change as the
 * recap mapping, or the first child to finish a real lesson would have been
 * handed a button that 404s.
 */

const { useStudentLesson } = vi.hoisted(() => ({
  useStudentLesson: vi.fn(),
}));
vi.mock("@/hooks/useStudentLesson", () => ({ useStudentLesson }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [
    {
      id: "s1",
      modalities: ["text"],
      text: { heading: "A", body: { default: "b" } },
    },
  ],
  summary: {
    recap: "You explored what fractions are.",
    covered: "Equivalence",
  },
} as never;

const state = (over: Record<string, unknown> = {}) => ({
  lesson: null,
  live: null,
  plan: null,
  loading: false,
  failed: false,
  empty: false,
  missing: false,
  resumeAt: null,
  lastWorkedAt: null,
  adaptSegments: null,
  ...over,
});

beforeEach(() => {
  useStudentLesson.mockReset();
  push.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LessonEndingRoute", () => {
  it("draws a real lesson's summary", () => {
    useStudentLesson.mockReturnValue(state({ lesson: LESSON, live: LESSON }));

    render(<LessonEndingRoute lessonId="frac-3" screen="summary" />);

    expect(screen.getByText(/You explored what fractions are/)).toBeVisible();
  });

  it("never tells the engine a finished lesson has just started", () => {
    // `useAdaptation` posts `mode: "lesson_load"`. Firing it here would say a
    // child has just BEGUN a lesson they have just finished — a fabricated
    // signal about their learning, which is the one kind this product must not
    // send. Gating on `live` would not catch it: a real lesson's summary IS
    // live.
    useStudentLesson.mockReturnValue(state({ lesson: LESSON, live: LESSON }));

    render(<LessonEndingRoute lessonId="frac-3" screen="summary" />);

    expect(useStudentLesson).toHaveBeenCalledWith("frac-3", { adapt: false });
  });

  it("keeps a child inside the app when the lesson is gone", () => {
    // The old route called `notFound()`, which drops them onto the app's own
    // "This page doesn't exist" — no nav, no Ask Nevo, and a button that calls
    // router.back(), which on a reload leaves the site.
    useStudentLesson.mockReturnValue(state());

    render(<LessonEndingRoute lessonId="ghost" screen="summary" />);

    // The lesson route's own D90 screen, so the two say the same thing.
    expect(screen.getByText("We couldn't open that lesson.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Back to lessons" }),
    ).toBeVisible();
  });

  it("says something different when the lesson exists but is not ready", () => {
    // A parsed lesson with no segments yet. Not the child's doing, and not the
    // same thing as a lesson that has been put away.
    useStudentLesson.mockReturnValue(state({ empty: true }));

    render(<LessonEndingRoute lessonId="frac-3" screen="summary" />);

    expect(screen.getByText(/isn’t ready yet/i)).toBeVisible();
  });

  it("offers a retry when the read failed, rather than blaming the lesson", () => {
    useStudentLesson.mockReturnValue(state({ failed: true }));

    render(<LessonEndingRoute lessonId="frac-3" screen="summary" />);

    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("draws a skeleton while the read is in flight", () => {
    // Not an empty state. A read still running is not a lesson that is missing.
    useStudentLesson.mockReturnValue(state({ loading: true }));

    const { container } = render(
      <LessonEndingRoute lessonId="frac-3" screen="summary" />,
    );

    expect(screen.queryByText(/couldn’t find/i)).toBeNull();
    expect(container.textContent).not.toMatch(/isn’t ready/i);
  });

  it("marks the authored lesson as a sample, and a real one not at all", () => {
    useStudentLesson.mockReturnValue(state({ lesson: LESSON, live: null }));
    const { unmount } = render(
      <LessonEndingRoute lessonId="demo" screen="summary" />,
    );
    expect(document.querySelector(`[${SAMPLE_ATTR}]`)).not.toBeNull();
    unmount();

    useStudentLesson.mockReturnValue(state({ lesson: LESSON, live: LESSON }));
    render(<LessonEndingRoute lessonId="frac-3" screen="summary" />);

    expect(document.querySelector(`[${SAMPLE_ATTR}]`)).toBeNull();
  });

  it("draws the review screen when asked for it, from the same read", () => {
    useStudentLesson.mockReturnValue(state({ lesson: LESSON, live: LESSON }));

    render(<LessonEndingRoute lessonId="frac-3" screen="review" />);

    expect(useStudentLesson).toHaveBeenCalledWith("frac-3", { adapt: false });
    expect(screen.queryByText(/You explored what fractions are/)).toBeNull();
  });
});
