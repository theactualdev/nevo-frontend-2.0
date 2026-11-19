import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CALC_MISS_LINE, CalculationSolver, type StepGiven } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { Verdict, VerdictReply } from "@/lib/lessons/verdict";
import type { CalculationSegment } from "@/lib/types";

/**
 * THE MISS LINE (Lydia, 10 Nov: "Calculation steps get a miss line"; her
 * words, 11 Nov): "Not quite. Have another go at this step." Said once the
 * server marks a step - or one of its mini-steps - not right; gone with the
 * next answer or the next step; never on a right answer or one the server
 * could not mark.
 */

afterEach(cleanup);

const numberStep = (stepId: string, prompt: string, answer: string) => ({
  stepId,
  stepNumber: 1,
  prompt,
  expectedInput: "numeric",
  input: "number",
  options: [],
  answer,
  targets: [],
  hint: "",
  confirmationText: "",
  visualUpdate: "",
  assembles: "1 + 2 = 3",
  equationState: "1 + 2 = 3",
  unit: null,
  narrationAudio: null,
});

const MINIS = [
  {
    id: "m1",
    questionId: "mini-aaa",
    prompt: "First, just 1/4. What number is on top?",
    input: "choice",
    answer: "1",
    options: [
      { value: "1", label: "1" },
      { value: "4", label: "4" },
    ],
  },
];

const build = (steps: unknown[]): CalculationSegment => {
  const built = calculationFromVariant({
    type: "co_construction",
    conceptId: "c-1",
    fullEquation: "1 + 2 = 3",
    expression: "1 + 2 = ?",
    answer: "3",
    steps,
    completionStatement: "Done.",
  } as unknown as CalculationVariant);
  if (!built) throw new Error("the fixture did not build");
  return built;
};

const TWO_STEPS = [
  numberStep("s1", "What is 1 + 2?", "3"),
  numberStep("s2", "What is 3 + 3?", "6"),
];

const show = (
  steps: unknown[],
  onStepGiven: (given: StepGiven, packageMark: Verdict) => VerdictReply | undefined,
) => {
  const props = { onSolved: vi.fn(), onStepGiven: vi.fn(onStepGiven) };
  render(<CalculationSolver calculation={build(steps)} {...props} />);
  return props;
};

const answer = (typed: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: typed } });
  fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));
};

describe("the miss line", () => {
  it("is her exact words", () => {
    expect(CALC_MISS_LINE).toBe("Not quite. Have another go at this step.");
  });

  it("is said once the server marks the step not right, in a polite live region", () => {
    show(TWO_STEPS, () => false);

    answer("4");

    const line = screen.getByText(CALC_MISS_LINE);
    expect(line).toBeVisible();
    expect(line.parentElement).toHaveAttribute("aria-live", "polite");
    // Still the same step, to try again.
    expect(screen.getByText("What is 1 + 2?")).toBeInTheDocument();
  });

  it("is not said for a right answer, and the next step opens without it", () => {
    const marks = [false, true];
    show(TWO_STEPS, () => marks.shift() ?? true);

    answer("4");
    expect(screen.getByText(CALC_MISS_LINE)).toBeInTheDocument();
    answer("3");

    expect(screen.getByText("What is 3 + 3?")).toBeInTheDocument();
    expect(screen.queryByText(CALC_MISS_LINE)).toBeNull();
  });

  it("is never said for an answer the server could not mark", () => {
    show(TWO_STEPS, () => null);

    answer("4");

    expect(screen.queryByText(CALC_MISS_LINE)).toBeNull();
  });

  it("goes while the next answer is on its way, and is said again on a second miss", async () => {
    let land: (v: Verdict) => void = () => {};
    const replies: (() => VerdictReply)[] = [
      () => false,
      () => new Promise<Verdict>((resolve) => (land = resolve)),
    ];
    show(TWO_STEPS, () => replies.shift()!());

    answer("4");
    expect(screen.getByText(CALC_MISS_LINE)).toBeInTheDocument();
    answer("5");
    expect(screen.queryByText(CALC_MISS_LINE)).toBeNull();

    await vi.waitFor(async () => {
      land(false);
      await Promise.resolve();
      expect(screen.getByText(CALC_MISS_LINE)).toBeInTheDocument();
    });
  });

  it("is said for a missed mini-step under Fewer steps", () => {
    show(
      [
        {
          ...numberStep("s1", "What do we add together?", "3"),
          miniSteps: MINIS,
        },
      ],
      () => false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fewer steps" }));

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));

    expect(screen.getByText(CALC_MISS_LINE)).toBeInTheDocument();
  });
});
