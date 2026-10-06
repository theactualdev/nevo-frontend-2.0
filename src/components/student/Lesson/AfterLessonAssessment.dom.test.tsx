import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AfterLessonAssessment } from "./AfterLessonAssessment";
import type { Assessment } from "@/lib/types";

/**
 * THE CHECK-IN INTRO SAID HOW LONG IT WOULD TAKE, AND NOTHING SAID SO.
 *
 * "4 questions · about 2 minutes" - the minutes were `round(questions / 2)`
 * presented to a child as fact. No field carries a duration, so it goes; the
 * count is real and stays.
 */

const question = (n: number) => ({
  prompt: `Question ${n}?`,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correctId: "a",
});

const ASSESSMENT: Assessment = {
  questions: [question(1), question(2), question(3), question(4)],
};

afterEach(() => {
  cleanup();
});

describe("the check-in intro", () => {
  it("says how many questions there are", () => {
    render(<AfterLessonAssessment assessment={ASSESSMENT} onFinish={() => {}} />);

    expect(screen.getByText("4 questions")).toBeInTheDocument();
  });

  it("does not say how long it will take", () => {
    render(<AfterLessonAssessment assessment={ASSESSMENT} onFinish={() => {}} />);

    expect(document.body.textContent).not.toMatch(/minute/i);
  });
});

const start = () => fireEvent.click(screen.getByRole("button", { name: "Start" }));
const pick = (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

describe("a way out of the check (D36)", () => {
  it("is offered before the first question", () => {
    const onLeave = vi.fn();
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        onLeave={onLeave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("is offered part way, and leaves at once with no warning", () => {
    const onLeave = vi.fn();
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        onLeave={onLeave}
      />,
    );
    start();
    pick("A");

    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

    // Straight out: no dialog to confirm, nothing asking "are you sure".
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("never names leaving as quitting", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        onLeave={() => {}}
      />,
    );
    start();

    expect(document.body.innerHTML).not.toMatch(/quit|give up/i);
  });

  it("is not drawn where nobody handles it", () => {
    render(<AfterLessonAssessment assessment={ASSESSMENT} onFinish={() => {}} />);
    expect(screen.queryByRole("button", { name: "Leave for now" })).toBeNull();
    start();
    expect(screen.queryByRole("button", { name: "Leave for now" })).toBeNull();
  });
});

describe("the recovery note (D40)", () => {
  it("makes no promise to bring the question back", () => {
    // Nothing here asks the scheduler anything, so "We'll bring it back
    // later" had no next-review signal behind it.
    render(<AfterLessonAssessment assessment={ASSESSMENT} onFinish={() => {}} />);
    start();

    pick("B");

    const note = screen.getByRole("status").textContent ?? "";
    expect(note).toBe(
      "That one didn't land - and that's okay. Nothing to fix right now.",
    );
    expect(note).not.toMatch(/bring it back/i);
  });

  it("makes none on the result either, when nothing landed", () => {
    render(<AfterLessonAssessment assessment={ASSESSMENT} onFinish={() => {}} />);
    start();
    for (let i = 0; i < 4; i++) {
      pick("B");
      fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    }

    expect(screen.getByText(/didn.t land yet/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/bring it back/i);
  });
});

describe("the reading accommodation on the check (D30)", () => {
  it("sets the question's answers in 37c's reading type", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        reading
      />,
    );
    start();

    const label = screen.getByText("A");
    expect(label.className).toContain("text-[18px]");
    expect(label.className).toContain("leading-[2]");
    expect(
      screen.getByRole("heading", { name: "Question 1?" }).className,
    ).toContain("tracking-[0.01em]");
  });

  it("sets the intro's words in it too", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        reading
      />,
    );

    expect(screen.getByText(/helps Nevo see what landed/).className).toContain(
      "text-[18px]",
    );
  });

  it("leaves the check alone when it is off", () => {
    render(<AfterLessonAssessment assessment={ASSESSMENT} onFinish={() => {}} />);
    start();

    expect(screen.getByText("A").className).not.toContain("text-[18px]");
  });
});

describe("a spoken question (B16)", () => {
  it("offers its recording above the printed question", () => {
    render(
      <AfterLessonAssessment
        assessment={{
          questions: [
            { ...question(1), promptAudio: "https://cdn.example/q1.mp3" },
            question(2),
          ],
        }}
        onFinish={() => {}}
      />,
    );
    start();

    expect(document.querySelector("audio")?.getAttribute("src")).toBe(
      "https://cdn.example/q1.mp3",
    );
    expect(screen.getByRole("heading", { name: "Question 1?" })).toBeTruthy();

    // The next question was not made spoken, so it is not.
    pick("A");
    expect(document.querySelector("audio")).toBeNull();
  });
});


describe("where a child left the check (B49)", () => {
  const leaveWith = () => {
    const onLeave = vi.fn();
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        onLeave={onLeave}
      />,
    );
    return onLeave;
  };
  const leave = () =>
    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

  it("is no place at all from the intro - the check has not begun", () => {
    const onLeave = leaveWith();

    leave();

    expect(onLeave).toHaveBeenCalledWith();
  });

  it("is the question on screen when it has not been answered", () => {
    const onLeave = leaveWith();
    start();

    leave();

    expect(onLeave).toHaveBeenCalledWith(0);
  });

  it("is the next question once one has been answered", () => {
    const onLeave = leaveWith();
    start();
    pick("A"); // right: on to question 2

    leave();

    expect(onLeave).toHaveBeenCalledWith(1);
  });

  it("is past an answer already confirmed, even while its note shows", () => {
    // A wrong answer stays on screen with its recovery note. It is given, so
    // coming back to it would ask the child the same question twice.
    const onLeave = leaveWith();
    start();
    pick("B");

    leave();

    expect(onLeave).toHaveBeenCalledWith(1);
  });
});

describe("picking the check back up (B49)", () => {
  it("opens on the question it was left at, past the intro", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        resumeAt={2}
      />,
    );

    expect(screen.getByRole("heading", { name: "Question 3?" })).toBeTruthy();
    expect(screen.getByText("Question 3 of 4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("opens on the result when every question had been answered", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        resumeAt={4}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("counts what landed before the exit", () => {
    // Two right before leaving, two wrong after: something landed.
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        resumeAt={2}
        landedBefore={2}
      />,
    );
    for (let i = 0; i < 2; i++) {
      pick("B");
      fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    }

    expect(
      screen.getByRole("heading", { name: "You’re getting the hang of this" }),
    ).toBeTruthy();
  });

  it("claims nothing landed only when it knows", () => {
    // What landed before could not be read back, so "nothing" is unknown.
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        resumeAt={4}
        landedBefore={null}
      />,
    );

    expect(screen.queryByText(/didn.t land yet/)).toBeNull();
  });

  it("holds the heading while that is still being read", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        resumeAt={4}
        landedBefore={null}
        landedPending
      />,
    );

    // Kept in place, unseen, so one heading is not swapped for another.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector("h2")?.closest(".invisible")).toBeTruthy();
  });
});

describe("the end of the check", () => {
  it("is told once, as the result appears", () => {
    const onComplete = vi.fn();
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        onComplete={onComplete}
      />,
    );
    start();
    pick("A");
    pick("A");
    pick("A");
    expect(onComplete).not.toHaveBeenCalled();

    pick("B");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("from the check-in (B26)", () => {
  const AUTHORED: Assessment = {
    ...ASSESSMENT,
    masteredConcepts: ["Sample concept"],
    resultNote: "Sample note.",
  };
  const finish = () => {
    start();
    for (let i = 0; i < 4; i++) pick("A");
  };

  it("draws the server's concepts and note, by name", () => {
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        outcome={{
          mastered: ["Adding like fractions"],
          revisit: ["Unlike denominators"],
          note: "You showed you can add fractions with the same bottom.",
        }}
      />,
    );
    finish();

    expect(screen.getByText("Adding like fractions")).toBeTruthy();
    expect(screen.getByText(/Unlike denominators/)).toBeTruthy();
    expect(
      screen.getByText("You showed you can add fractions with the same bottom."),
    ).toBeTruthy();
  });

  it("draws nothing where the server sent nothing", () => {
    // Rule 5: an empty answer is not a gap to fill from the sample.
    render(
      <AfterLessonAssessment
        assessment={AUTHORED}
        onFinish={() => {}}
        outcome={{ mastered: [], revisit: [], note: "" }}
      />,
    );
    finish();

    expect(screen.queryByText("Sample concept")).toBeNull();
    expect(screen.queryByText("Sample note.")).toBeNull();
  });

  it("keeps a concept the server counted as landed where it put it", () => {
    // The client's own count moved concepts to "revisit" when nothing landed.
    // The server's split is its answer, not ours to rearrange.
    render(
      <AfterLessonAssessment
        assessment={ASSESSMENT}
        onFinish={() => {}}
        outcome={{ mastered: ["Halves"], revisit: [], note: "" }}
      />,
    );
    start();
    for (let i = 0; i < 4; i++) {
      pick("B");
      fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    }

    expect(screen.getByText("Halves").textContent).toBe("Halves");
    expect(screen.queryByText(/revisit soon/)).toBeNull();
  });
});
