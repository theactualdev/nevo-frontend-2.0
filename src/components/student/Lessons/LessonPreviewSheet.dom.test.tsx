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
