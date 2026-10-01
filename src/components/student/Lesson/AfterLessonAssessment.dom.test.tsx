import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
