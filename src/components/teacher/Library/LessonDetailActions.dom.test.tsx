import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LessonDetailActions } from "./LessonDetailActions";

/**
 * SCRUM-153, LR-04: assign is visible but inactive while a review is
 * outstanding, and says what is left.
 *
 * THE GATE IS REAL. The backend answers 409 `lesson_not_approved` at both
 * assignment doors, so a pressable button here is an invitation to a failure
 * the screen already knows about - and the teacher then meets that refusal in
 * a takeover, two steps from the cards that would clear it.
 *
 * WHOSE ANSWER "READY" IS, and this changed on 21 Sep. This component decided
 * it from a count of outstanding sections. Backend then made the rule its own
 * - *"enable Assign on `readyToAssign`, not by counting the list yourself.
 * Client and server disagreeing about ready is how this started"* - because
 * outstanding now means a flagged segment nobody approved OR an ungrounded key
 * point, and only the server sees both. So the verdict and the numbers arrive
 * separately here, and the tests below pin that they cannot be confused: a
 * server that says ready wins over a count, and a server that says no wins
 * over an empty one.
 */

describe("whose answer ready is", () => {
  it("takes the server's yes even while cards are still listed", () => {
    /*
     * The case that would have been wrong before. A lesson can carry key
     * points a teacher has not opened and still be assignable - only an
     * UNSURE point blocks, and "a lesson nobody doubted assigns with no
     * clicking" is the scope ruling this whole ticket turns on. A client
     * counting cards would tax the common case right back.
     */
    render(
      <LessonDetailActions lessonId="l-1" ready outstandingKeyPoints={4} />,
    );

    expect(
      screen.getByRole("link", { name: "Assign to a class" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/still to check/)).not.toBeInTheDocument();
  });

  it("takes the server's no even when it cannot itemise why", () => {
    // `readyToAssign` is false and neither count explains it. Saying nothing
    // would leave a dead button with no reason beside it.
    render(<LessonDetailActions lessonId="l-1" ready={false} />);

    expect(
      screen.queryByRole("link", { name: "Assign to a class" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Still being checked.")).toBeInTheDocument();
  });

  it("assumes ready when nobody says", () => {
    // Every other caller draws these actions for a lesson that is not under
    // review. A default of false would silently disable Assign console-wide.
    render(<LessonDetailActions lessonId="l-1" />);

    expect(
      screen.getByRole("link", { name: "Assign to a class" }),
    ).toHaveAttribute("href", "/teacher/lessons/assign?lesson=l-1");
  });
});

describe("what is left to check", () => {
  it("names key points, in the plural that fits", () => {
    const { rerender } = render(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        outstandingKeyPoints={2}
      />,
    );
    expect(screen.getByText("2 key points still to check below.")).toBeInTheDocument();

    rerender(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        outstandingKeyPoints={1}
      />,
    );
    expect(screen.getByText("1 key point still to check below.")).toBeInTheDocument();
  });

  it("names sections when a section is what is holding it", () => {
    render(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        outstandingSections={1}
      />,
    );

    expect(screen.getByText("1 section still to check below.")).toBeInTheDocument();
  });

  it("names both when both are outstanding", () => {
    /*
     * Two numbers rather than one total, because they are settled in
     * different places on the page. A teacher told "3 things" would not know
     * which three, or where.
     */
    render(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        outstandingKeyPoints={2}
        outstandingSections={1}
      />,
    );

    expect(
      screen.getByText("2 key points and 1 section still to check below."),
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
     * Still true on 21 Sep after the key-point routes landed: those amend a
     * key point, not the lesson. Design owes the field list.
     *
     * This test is here so that putting it back is a decision with a failing
     * test attached, rather than a quiet restoration of the defect.
     */
    render(<LessonDetailActions lessonId="l-1" ready />);

    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });
});
