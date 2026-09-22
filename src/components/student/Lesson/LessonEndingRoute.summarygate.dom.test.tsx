import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LessonEndingRoute } from "./LessonEndingRoute";

/**
 * THE SUMMARY ROUTE DREW A PAGE OF HEADINGS WITH NOTHING UNDER THEM.
 *
 * `LessonPlayer` offers "See summary" only when `lesson.summary` exists, so
 * from inside the app the screen is unreachable without one. The ROUTE carried
 * no such gate: typed, bookmarked, or opened from a shared link, it rendered
 * `LessonSummaryScreen` for any lesson at all - and every block in that screen
 * is `summary?.…`, so a lesson without one produced empty chrome.
 *
 * Review is deliberately NOT gated the same way: it reads the child's own
 * answers, which exist whether or not anybody wrote a summary.
 */

const state = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/useStudentLesson", () => ({
  useStudentLesson: () => state.value,
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const lessonWith = (summary: unknown) => ({
  lesson: {
    id: "l-1",
    title: "Adding Fractions",
    segments: [],
    ...(summary ? { summary } : {}),
  },
  live: true,
  loading: false,
  failed: false,
  empty: false,
});

const body = () => document.body.textContent ?? "";

beforeEach(() => {
  state.value = lessonWith({ recap: "You added fractions.", covered: [] });
});

afterEach(() => {
  cleanup();
});

describe("opening a summary directly", () => {
  it("shows it when the lesson has one", () => {
    render(<LessonEndingRoute lessonId="l-1" screen="summary" />);

    expect(body()).toMatch(/You added fractions/);
  });

  it("says it is not ready when the lesson has none", () => {
    // Rather than empty chrome: every block on that screen is optional, so a
    // lesson with no summary rendered a page of nothing.
    state.value = lessonWith(null);

    render(<LessonEndingRoute lessonId="l-1" screen="summary" />);

    expect(body()).toMatch(/isn.t ready yet/i);
    expect(body()).toMatch(/Back to my lessons/i);
  });
});

describe("review is not gated on the summary", () => {
  it("opens for a lesson that has no summary", () => {
    // It reads the child's own answers, which exist regardless of whether
    // anybody wrote a summary for the lesson.
    state.value = lessonWith(null);

    render(<LessonEndingRoute lessonId="l-1" screen="review" />);

    expect(body()).not.toMatch(/isn.t ready yet/i);
  });
});
