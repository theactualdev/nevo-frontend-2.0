import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CalculationSolver,
  FEWER_LABEL,
  SLOWER_LINE,
} from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { CalculationSegment } from "@/lib/types";

/**
 * FEWER STEPS (8c67353; the Hub, 4 Nov: the reduced build). A step a teacher
 * broke into answerable mini-steps offers Fewer steps: its mini-steps one at
 * a time under "ONE PIECE AT A TIME", each answer going up under its own
 * `questionId`, and then the same step whole - the server needs the step
 * itself answered. Nowhere else.
 */

afterEach(cleanup);

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
  {
    id: "m2",
    questionId: "mini-bbb",
    prompt: "Now 2/4. What number is on top?",
    input: "number",
    answer: 2,
  },
];

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "s1",
  stepNumber: 1,
  prompt: "What do we add together?",
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "tops", label: "The numerators: 1 and 2" },
    { value: "bottoms", label: "The denominators: 4 and 4" },
  ],
  answer: "tops",
  targets: [],
  hint: "Look at the top numbers.",
  confirmationText: "",
  visualUpdate: "",
  assembles: "1 + 2 = ?",
  equationState: "1 + 2 = ?",
  unit: null,
  narrationAudio: null,
  miniSteps: MINIS,
  ...over,
});

const build = (steps = [step(), step({ stepId: "s2", prompt: "So what is 1 + 2?", miniSteps: [] })]): CalculationSegment => {
  const calc = calculationFromVariant({
    type: "co_construction",
    conceptId: "c-1",
    fullEquation: "1/4 + 2/4 = 3/4",
    expression: "1/4 + 2/4 = ?",
    answer: "3/4",
    scaffold: null,
    manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
    steps,
    completionStatement: "",
  } as unknown as CalculationVariant);
  if (!calc) throw new Error("the fixture did not build");
  return calc;
};

const show = (
  calc: CalculationSegment = build(),
  extra: Partial<React.ComponentProps<typeof CalculationSolver>> = {},
) => {
  const props = {
    onSolved: vi.fn(),
    onStepGiven: vi.fn(),
    onStepAnswered: vi.fn(),
    onAct: vi.fn(),
  };
  render(<CalculationSolver calculation={calc} {...props} {...extra} />);
  return props;
};

const tap = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const enter = (value: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  tap("Check my answer");
};
const fewer = () => screen.queryByRole("button", { name: "Fewer steps" });

describe("Fewer steps on the calculation", () => {
  it("is offered as a pill on a step with mini-steps, and nowhere else", () => {
    show();
    expect(fewer()).toHaveAttribute("aria-pressed", "false");
    cleanup();

    show(build([step({ miniSteps: [] })]));
    expect(fewer()).toBeNull();
  });

  it("puts the first mini-step in the step's place, under the frame's label", () => {
    const props = show();
    tap("Fewer steps");

    expect(fewer()).toHaveAttribute("aria-pressed", "true");
    expect(FEWER_LABEL).toBe("ONE PIECE AT A TIME");
    expect(screen.getByText(FEWER_LABEL)).toBeInTheDocument();
    expect(screen.getByText(MINIS[0].prompt)).toBeInTheDocument();
    expect(screen.queryByText("What do we add together?")).toBeNull();
    expect(screen.queryByRole("button", { name: "The numerators: 1 and 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(props.onAct).toHaveBeenCalled();
  });

  it("sends each mini-step's answer under its own id, and moves on when it is right", () => {
    const props = show();
    tap("Fewer steps");

    pick("1");

    expect(props.onStepGiven).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "mini-aaa", answer: "1" }),
    );
    // The mini-step is never the step's own signal.
    expect(props.onStepAnswered).not.toHaveBeenCalled();
    expect(screen.getByText(MINIS[1].prompt)).toBeInTheDocument();
  });

  it("asks the same mini-step again after a miss, with that answer sent too", () => {
    const props = show();
    tap("Fewer steps");

    pick("4");

    expect(props.onStepGiven).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "mini-aaa", answer: "4" }),
    );
    expect(screen.getByText(MINIS[0].prompt)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "false");
  });

  it("asks a number mini-step on the step's own field", () => {
    const props = show();
    tap("Fewer steps");
    pick("1");

    enter("2");

    expect(props.onStepGiven).toHaveBeenLastCalledWith(
      expect.objectContaining({ stepId: "mini-bbb", answer: "2" }),
    );
  });

  it("asks the step itself again, whole, after the last mini-step", () => {
    const props = show();
    tap("Fewer steps");
    pick("1");
    enter("2");

    expect(screen.queryByText(FEWER_LABEL)).toBeNull();
    expect(screen.getByText("What do we add together?")).toBeInTheDocument();
    expect(fewer()).toHaveAttribute("aria-pressed", "false");

    pick("The numerators: 1 and 2");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
    expect(props.onStepGiven).toHaveBeenLastCalledWith(
      expect.objectContaining({ stepId: "s1", answer: "tops" }),
    );
  });

  it("times each answer from when it was put to the child (rule 4)", () => {
    let now = 1_000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const props = show();
      now = 2_000;
      tap("Fewer steps");
      now = 5_000;
      pick("1");
      now = 6_500;
      enter("2");
      now = 10_000;
      pick("The numerators: 1 and 2");

      const times = props.onStepGiven.mock.calls.map(([g]) => [
        g.stepId,
        g.responseTimeMs,
      ]);
      expect(times).toEqual([
        ["mini-aaa", 3_000],
        ["mini-bbb", 1_500],
        // The step whole, from when it came back.
        ["s1", 3_500],
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it("brings the step back whole when pressed off part-way", () => {
    show();
    tap("Fewer steps");
    pick("1");

    tap("Fewer steps");

    expect(screen.queryByText(FEWER_LABEL)).toBeNull();
    expect(screen.getByText("What do we add together?")).toBeInTheDocument();
  });

  it("starts from the first mini-step each time it is pressed on", () => {
    show();
    tap("Fewer steps");
    pick("1");
    tap("Fewer steps");
    tap("Fewer steps");

    expect(screen.getByText(MINIS[0].prompt)).toBeInTheDocument();
  });

  it("holds the Slower line back while a mini-step is asked", () => {
    show(build(), { slower: true, onSlower: vi.fn() });
    tap("Tap to continue");
    tap("Fewer steps");

    expect(screen.queryByText(SLOWER_LINE)).toBeNull();
    expect(screen.getByText(MINIS[0].prompt)).toBeInTheDocument();
  });

  it("is not offered on the next step, which has none", () => {
    show(build([step(), step({ stepId: "s2", prompt: "So what is 1 + 2?", miniSteps: [], confirmationText: "" })]));
    pick("The numerators: 1 and 2");

    expect(fewer()).toBeNull();
  });
});
