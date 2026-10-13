import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useLessonDetail, notFound } = vi.hoisted(() => ({
  useLessonDetail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/hooks/useLessonDetail", () => ({ useLessonDetail }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./LessonDetail", () => ({ LessonDetail: () => <p>sample lesson</p> }));
vi.mock("./LiveLessonDetail", () => ({
  LiveLessonDetail: ({ assignmentsFailed }: { assignmentsFailed?: boolean }) => (
    <p>{assignmentsFailed ? "live page: who has it unknown" : "live page"}</p>
  ),
}));

import { LessonRoute } from "./LessonRoute";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * WHICH ANSWER THE LESSON ROUTE GIVES - and it had no test at all.
 *
 * The page underneath can only tell "never assigned" from "we could not find
 * out" if the route passes the difference down, and a route that dropped it
 * would put every failed read back to "Ready when you are" with every page
 * test still green.
 */

const LESSON = { id: "l-1", title: "Fractions", classes: [] };

const state = (over: Record<string, unknown> = {}) =>
  useLessonDetail.mockReturnValue({
    lesson: null,
    modules: [],
    assignments: [],
    assignmentsFailed: false,
    progress: null,
    loading: false,
    missing: false,
    failed: false,
    ...over,
  });

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  notFound.mockClear();
  state();
});

describe("a lesson that loaded", () => {
  it("hands the page the failed assignments read", () => {
    state({ lesson: LESSON, assignmentsFailed: true });
    render(<LessonRoute fixture={null} lessonId="l-1" />);

    expect(screen.getByText("live page: who has it unknown")).toBeInTheDocument();
  });

  it("hands the page nothing of the kind when the read landed", () => {
    state({ lesson: LESSON });
    render(<LessonRoute fixture={null} lessonId="l-1" />);

    expect(screen.getByText("live page")).toBeInTheDocument();
  });
});

describe("a lesson that did not", () => {
  it("is not-found when it does not exist", () => {
    state({ missing: true });

    expect(() => render(<LessonRoute fixture={null} lessonId="nope" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("is a retry when it could not be loaded", () => {
    state({ failed: true });
    render(<LessonRoute fixture={null} lessonId="l-1" />);

    expect(screen.getByText(/couldn’t load this lesson/)).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

/**
 * T243. The designed lesson is the walkthrough's, and only ever its: a
 * signed-in teacher's lesson that is loading, failed or missing is never
 * answered with it.
 */
describe("the designed lesson", () => {
  const FIXTURE = { id: "photosynthesis", title: "Photosynthesis" } as never;

  it("is the walkthrough's, marked as a sample", () => {
    clearSession();
    const { container } = render(<LessonRoute fixture={FIXTURE} lessonId="photosynthesis" />);

    expect(screen.getByText("sample lesson")).toBeInTheDocument();
    expect(container.querySelector("[data-nevo-sample]")).not.toBeNull();
  });

  it("is not shown while a signed-in teacher's lesson loads", () => {
    state({ loading: true });
    render(<LessonRoute fixture={FIXTURE} lessonId="photosynthesis" />);

    expect(screen.queryByText("sample lesson")).not.toBeInTheDocument();
  });

  it("is not shown in place of a lesson that failed to load", () => {
    state({ failed: true });
    render(<LessonRoute fixture={FIXTURE} lessonId="photosynthesis" />);

    expect(screen.queryByText("sample lesson")).not.toBeInTheDocument();
    expect(screen.getByText(/couldn’t load this lesson/)).toBeInTheDocument();
  });

  it("is not shown in place of a lesson that does not exist", () => {
    state({ missing: true });

    expect(() => render(<LessonRoute fixture={FIXTURE} lessonId="photosynthesis" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(screen.queryByText("sample lesson")).not.toBeInTheDocument();
  });
});
