import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPreviewSheet } from "./LessonPreviewSheet";

/**
 * The preview opened set work as though it were library reading.
 *
 * It pushed `/student/lessons/{id}` bare, and the player knows which
 * assignment it is playing only from `?assignment=` - so every lesson started
 * from the Lessons tab wrote its progress against no assignment, and the note
 * the teacher wrote when setting it never appeared.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const LESSON = {
  id: "l-1",
  lessonId: "l-1",
  title: "Adding Fractions",
  timeEstimate: "About 12 min",
  status: "not_started" as const,
};

beforeEach(() => push.mockReset());
afterEach(() => cleanup());

describe("starting a lesson from its preview", () => {
  it("carries the assignment it was set as", () => {
    render(
      <LessonPreviewSheet
        lesson={{ ...LESSON, assignmentId: "asg-7" }}
        open
        onOpenChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(push).toHaveBeenCalledWith("/student/lessons/l-1?assignment=asg-7");
  });

  it("carries none for a lesson no teacher set", () => {
    render(<LessonPreviewSheet lesson={LESSON} open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(push).toHaveBeenCalledWith("/student/lessons/l-1");
  });
});

describe("what the preview says about where a child is", () => {
  const sheet = () => screen.getByRole("dialog");

  it("draws the frame's bar to the child's own place, read out in words", () => {
    /*
     * Backend B51 put the true fraction on the progress row, which is D21's
     * condition for drawing one. The bar says the position, never a number.
     */
    render(
      <LessonPreviewSheet
        lesson={{
          ...LESSON,
          status: "in_progress",
          place: { fraction: 0.2, words: "Segment 3 of 10" },
        }}
        open
        onOpenChange={() => {}}
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "Segment 3 of 10" });
    expect(bar).toHaveAttribute("aria-valuetext", "Segment 3 of 10");
    expect(
      screen.getByText("You're partway through this one"),
    ).toBeInTheDocument();
    // Spoken, not printed - and never as a percentage.
    expect(sheet().textContent).not.toMatch(/%|Segment|of 10/);
  });

  it("says a lesson is partway without drawing how far when the row does not say", () => {
    /*
     * Design D21. Without the true fraction a bar is an amount we composed,
     * and a bar is read as an amount just as a ring is.
     */
    render(
      <LessonPreviewSheet
        lesson={{ ...LESSON, status: "in_progress" }}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(
      screen.getByText("You're partway through this one"),
    ).toBeInTheDocument();
    expect(sheet().innerHTML).not.toMatch(/width:\s*\d+%/);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("draws a finished lesson as finished, not as new or partway", () => {
    /*
     * Design D22. It read exactly like a lesson never started. Frame 21 draws
     * no completed state, so this is the minimum: the card's completed mark
     * and the filter's word, with no partway line and no Continue.
     */
    render(
      <LessonPreviewSheet
        lesson={{ ...LESSON, status: "completed", assignmentId: "asg-7" }}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText(/partway/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    // It opens the same lesson, from the top; the player does not write it
    // back as unfinished (see `LessonPlayer.finished`).
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(push).toHaveBeenCalledWith("/student/lessons/l-1?assignment=asg-7");
  });

  it("does not call a lesson never started completed", () => {
    render(<LessonPreviewSheet lesson={LESSON} open onOpenChange={() => {}} />);

    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.queryByText(/partway/)).toBeNull();
  });
});
