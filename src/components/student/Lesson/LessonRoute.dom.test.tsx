import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonRoute } from "./LessonRoute";
import { LessonLoadingSkeleton } from "./LessonLoadingSkeleton";

/**
 * What a child sees when a lesson does not simply open.
 *
 * A 404 dropped them on the app's developer-worded "This page doesn't exist";
 * a failed read showed words the frame never drew; the loading skeleton drew a
 * grey square where the frame keeps Exit, on a load nothing times out; and a
 * dashboard read that failed opened the lesson anyway - at segment 0, over the
 * child's real place, whether or not their teacher had called it off.
 */

const { push, notFound } = vi.hoisted(() => ({
  push: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  notFound,
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));

const lessonState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/useStudentLesson", () => ({
  useStudentLesson: () => lessonState.value,
}));

const playerProps = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./LessonPlayer", () => ({
  LessonPlayer: (props: unknown) => {
    playerProps.value = props;
    return <div data-testid="player" />;
  },
}));

const LESSON = { id: "les-1", title: "Fractions", segments: [{ id: "s1" }] };

const state = (over: Record<string, unknown>) => {
  lessonState.value = {
    lesson: null,
    live: true,
    plan: null,
    loading: false,
    missing: false,
    failed: false,
    empty: false,
    resumeAt: null,
    lastWorkedAt: null,
    adaptSegments: undefined,
    unavailable: null,
    opensAt: null,
    placeUnknown: false,
    fromShelf: false,
    ...over,
  };
};

beforeEach(() => {
  push.mockReset();
  notFound.mockReset();
  playerProps.value = null;
});

afterEach(() => cleanup());

describe("a lesson that is not there", () => {
  it("is said in the child's words with a way back, not the app's 404", () => {
    state({ missing: true });
    render(<LessonRoute lessonId="les-1" />);

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText("We couldn’t find that lesson")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to my lessons" }));
    expect(push).toHaveBeenCalledWith("/student/lessons");
  });
});

describe("a lesson that would not load", () => {
  it("uses the player frame's own error words", () => {
    state({ failed: true });
    render(<LessonRoute lessonId="les-1" />);

    expect(
      screen.getByText("Something went wrong. We're on it."),
    ).toBeTruthy();
    expect(screen.getByText(/Nothing you did caused it/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(push).toHaveBeenCalledWith("/student/lessons");
  });
});

describe("a lesson whose saved place could not be read", () => {
  it("does not open over the place the child really reached", () => {
    state({ lesson: LESSON, placeUnknown: true });
    render(<LessonRoute lessonId="les-1" />);

    expect(screen.queryByTestId("player")).toBeNull();
    expect(screen.getByText(/Nothing you did caused it/)).toBeTruthy();
  });

  it("still opens from the offline shelf, without writing where it opened", () => {
    // Offline the dashboard was never going to answer; the child saved this
    // lesson so it would open.
    state({ lesson: LESSON, placeUnknown: true, fromShelf: true });
    render(<LessonRoute lessonId="les-1" />);

    expect(screen.getByTestId("player")).toBeTruthy();
    expect(playerProps.value).toMatchObject({ placeUnknown: true });
  });

  it("still opens a review, which writes no place", () => {
    state({ lesson: LESSON, placeUnknown: true });
    render(<LessonRoute lessonId="les-1" review />);

    expect(screen.getByTestId("player")).toBeTruthy();
  });

  it("opens normally when the place is known", () => {
    state({ lesson: LESSON, resumeAt: 0 });
    render(<LessonRoute lessonId="les-1" />);

    expect(screen.getByTestId("player")).toBeTruthy();
    expect(playerProps.value).toMatchObject({ placeUnknown: false });
  });
});

describe("a lesson the child already finished", () => {
  // Design D22: it opens for review, and the player is told so, because the
  // player is what would otherwise write it back as unfinished.
  it("tells the player it is finished", () => {
    state({ lesson: LESSON, finished: true });
    render(<LessonRoute lessonId="les-1" />);

    expect(playerProps.value).toMatchObject({ finished: true });
  });

  it("does not tell it so for a lesson still to do", () => {
    state({ lesson: LESSON, finished: false });
    render(<LessonRoute lessonId="les-1" />);

    expect(playerProps.value).toMatchObject({ finished: false });
  });
});

describe("the loading skeleton", () => {
  it("keeps a real Exit, because a stalled load has no other way off it", () => {
    render(<LessonLoadingSkeleton />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });

  it("does not read its bar out as a percentage", () => {
    render(<LessonLoadingSkeleton />);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuetext")).toBe("Loading lesson");
  });
});
