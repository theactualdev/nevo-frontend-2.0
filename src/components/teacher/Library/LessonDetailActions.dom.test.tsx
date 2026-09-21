import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LessonDetailActions } from "./LessonDetailActions";

/**
 * SCRUM-153, LR-04: assign is visible but inactive while a review is
 * outstanding, and says how many are left.
 *
 * THE GATE IS REAL. The backend answers 409 `lesson_not_approved` at both
 * assignment doors, so a pressable button here is an invitation to a failure
 * the screen already knows about - and the teacher then meets that refusal in
 * a takeover, two steps from the sections that would clear it.
 */

describe("while sections are still waiting", () => {
  it("does not offer assignment as something to press", () => {
    render(<LessonDetailActions lessonId="l-1" outstanding={2} />);

    expect(
      screen.queryByRole("link", { name: "Assign to a class" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Assign to a class")).toBeInTheDocument();
  });

  it("says how many, in the plural that fits", () => {
    const { rerender } = render(
      <LessonDetailActions lessonId="l-1" outstanding={2} />,
    );
    expect(screen.getByText(/2 sections still to check/)).toBeInTheDocument();

    rerender(<LessonDetailActions lessonId="l-1" outstanding={1} />);
    expect(screen.getByText(/1 section still to check/)).toBeInTheDocument();
  });
});

describe("once the review is done", () => {
  it("assignment becomes a link to the assignment flow", () => {
    render(<LessonDetailActions lessonId="l-1" outstanding={0} />);

    expect(
      screen.getByRole("link", { name: "Assign to a class" }),
    ).toHaveAttribute("href", "/teacher/lessons/assign?lesson=l-1");
    expect(screen.queryByText(/still to check/)).not.toBeInTheDocument();
  });

  it("assumes nothing outstanding when nobody says", () => {
    // Every other caller of this component passes no count. They must keep
    // the behaviour they had.
    render(<LessonDetailActions lessonId="l-1" />);

    expect(
      screen.getByRole("link", { name: "Assign to a class" }),
    ).toBeInTheDocument();
  });
});

describe("Edit", () => {
  it("is absent until there is a lesson editor to open", () => {
    /*
     * LR-06 wants Edit to open the lesson itself - title, key points, how
     * Nevo should treat it - and no endpoint edits any of those. What the
     * button did instead was route into the upload flow and ask for a
     * different file, which is item 4 of the bug.
     *
     * This test is here so that putting it back is a decision with a failing
     * test attached, rather than a quiet restoration of the defect.
     */
    render(<LessonDetailActions lessonId="l-1" outstanding={0} />);

    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });
});
