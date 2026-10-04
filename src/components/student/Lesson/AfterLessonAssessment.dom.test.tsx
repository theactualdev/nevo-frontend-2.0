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
