import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LessonDetailActions } from "./LessonDetailActions";

/**
 * SCRUM-319 (Lydia, 7 Nov), replacing SCRUM-153 LR-04's inactive button: the
 * control STAYS PRESSABLE while the server holds the lesson, and the refusal
 * is explained after the tap - naming the step that holds it, with the way
 * back to it. Never a disabled button.
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

/** A held Assign is a real button; pressing it is how the reason is asked for. */
const press = () => fireEvent.click(screen.getByRole("button", { name: "Assign to a class" }));

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
    press();
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
    press();
    expect(screen.getByText("2 key points still to check")).toBeInTheDocument();

    rerender(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        outstandingKeyPoints={1}
      />,
    );
    expect(screen.getByText("1 key point still to check")).toBeInTheDocument();
  });

  it("names sections when a section is what is holding it", () => {
    render(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        outstandingSections={1}
      />,
    );
    press();

    expect(screen.getByText("1 segment still to check")).toBeInTheDocument();
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
    press();

    expect(
      screen.getByText("2 key points and 1 segment still to check"),
    ).toBeInTheDocument();
  });
});

describe("Edit", () => {
  /*
   * PUT BACK DELIBERATELY (backlog item 15, 4 Nov). It was withdrawn because
   * it routed into the upload flow and asked for a different file - item 4 of
   * SCRUM-153. It returns as C06b draws it, beside Assign, opening the
   * committed lesson's structure page (C07d), which edits this lesson's title
   * and sections. These tests are what stop it drifting back to the upload.
   */
  it("opens this lesson's structure page, never the upload flow", () => {
    render(<LessonDetailActions lessonId="l-1" ready editHref="/teacher/lessons/l-1/structure" />);

    const edit = screen.getByRole("link", { name: "Edit the lesson" });
    expect(edit).toHaveAttribute("href", "/teacher/lessons/l-1/structure");
    expect(edit.getAttribute("href")).not.toMatch(/upload/);
  });

  it("is absent where a caller has nowhere for it to go", () => {
    render(<LessonDetailActions lessonId="l-1" ready />);

    expect(screen.queryByRole("link", { name: /^Edit/ })).not.toBeInTheDocument();
  });
});

/**
 * C06b's way to C06c Lesson Media (design 82c213b): "Pictures and narration",
 * only where the lesson has live media to look at.
 */
describe("the way to the lesson's pictures and narration", () => {
  it("is offered when the lesson has live media", () => {
    render(<LessonDetailActions lessonId="l-1" ready mediaHref="/teacher/lessons/l-1/media" />);

    expect(screen.getByRole("link", { name: "Pictures and narration" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/media",
    );
  });

  it("is not offered when there is none", () => {
    render(<LessonDetailActions lessonId="l-1" ready />);

    expect(screen.queryByRole("link", { name: "Pictures and narration" })).not.toBeInTheDocument();
  });
});

/**
 * ASSIGN WAITS FOR THE LESSON-WIDE SIGN-OFF (Lydia, 25 Oct): "Assign waits for
 * the lesson-wide sign-off. Assigning a lesson whose media and checks have not
 * been approved puts unreviewed content in front of children."
 *
 * `readyToAssign` alone let such a lesson go, so the server's `reviewComplete`
 * is the second half of the verdict, taken here beside `ready` where these
 * tests can see it.
 */
describe("the lesson-wide sign-off", () => {
  it("holds Assign when the server says the lesson is not signed off", () => {
    render(<LessonDetailActions lessonId="l-1" ready signedOff={false} />);

    expect(screen.queryByRole("link", { name: "Assign to a class" })).not.toBeInTheDocument();
    // SCRUM-319: pressable, never disabled - and the reason comes with the tap.
    const assign = screen.getByRole("button", { name: "Assign to a class" });
    expect(assign).toBeEnabled();
    expect(assign).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Review this lesson to assign it.")).not.toBeInTheDocument();
    press();
    // The teacher's review is what waits, not Nevo.
    expect(screen.getByText("Review this lesson to assign it.")).toBeInTheDocument();
    expect(screen.queryByText("Still being checked.")).not.toBeInTheDocument();
  });

  it("lets Assign go once it is signed off", () => {
    render(<LessonDetailActions lessonId="l-1" ready signedOff />);

    expect(screen.getByRole("link", { name: "Assign to a class" })).toBeInTheDocument();
  });

  it("holds nothing over a review that could not be read", () => {
    // Null is our outage, not the lesson's state. The server refuses with a
    // reason if it must.
    render(<LessonDetailActions lessonId="l-1" ready signedOff={null} />);

    expect(screen.getByRole("link", { name: "Assign to a class" })).toBeInTheDocument();
  });

  it("names what is left when there is something to count", () => {
    render(
      <LessonDetailActions
        lessonId="l-1"
        ready={false}
        signedOff={false}
        outstandingKeyPoints={2}
      />,
    );
    press();

    expect(screen.getByText("2 key points still to check")).toBeInTheDocument();
  });
});

/*
 * SCRUM-319: "names the outstanding step ... The route from the refusal back
 * to the outstanding step is part of this." The step comes from SCRUM-307's
 * `outstandingReviewSteps`, in the server's own words.
 */
describe("the step that holds it", () => {
  it("names the step after the tap, and goes back to it", () => {
    render(
      <LessonDetailActions lessonId="l-1" ready={false} signedOff={false} outstandingSteps={["rewrites", "checks"]} />,
    );
    press();

    expect(
      screen.getByText("It can’t be assigned until its review is done: checks and rewrites still to sign off."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the checks" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review?step=3",
    );
  });

  it("calls the media step the pictures, and opens step 1", () => {
    render(<LessonDetailActions lessonId="l-1" ready={false} outstandingSteps={["media"]} />);
    press();

    expect(screen.getByRole("link", { name: "Go to the pictures" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review?step=1",
    );
  });

  it("says nothing until it is pressed", () => {
    render(<LessonDetailActions lessonId="l-1" ready={false} outstandingSteps={["checks"]} />);

    expect(screen.queryByText(/still to sign off/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Go to the/ })).toBeNull();
  });

  it("says nothing while the verdict is still on its way, even pressed", () => {
    render(<LessonDetailActions lessonId="l-1" ready={false} checking outstandingSteps={["checks"]} />);
    press();

    expect(screen.queryByText(/still to sign off|still to check|Still being checked/)).toBeNull();
  });
});
