/**
 * THE CARD AFTER A CALCULATION MISS (Lydia, 2 Nov: "Yes, a card appears. The
 * screen changing under a child with no explanation makes them think they did
 * something wrong"; her lines, 4 Nov). The server's `calculation_scaffold`
 * route names a step and a level; the step goes to that level and the card
 * says only what changed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CALC_SUPPORT_LINES, CalculationSolver } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { CalculationSegment } from "@/lib/types";
import type { ScaffoldLevel } from "@/lib/constants";

afterEach(cleanup);

const HINT = "Look at the bottom number of each fraction.";

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "s1",
  stepNumber: 1,
  prompt: "What are the denominators?",
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "4 and 4", label: "4 and 4" },
    { value: "1 and 2", label: "1 and 2" },
  ],
  answer: "4 and 4",
  targets: [],
  hint: HINT,
  confirmationText: "Both denominators are 4.",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?/4",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const QUARTERS = {
  type: "co_construction",
  conceptId: "c-1",
  fullEquation: "1/4 + 2/4 = 3/4",
  expression: "1/4 + 2/4 = ?",
  answer: "3/4",
  scaffold: {
    kind: "bar",
    parts: 4,
    rows: 2,
    marks: [1, 2],
    labels: ["1/4", "2/4"],
  },
  manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
  steps: [
    step(),
    step({
      stepId: "s2",
      prompt: "What do we add together?",
      options: [
        { value: "tops", label: "The numerators: 1 and 2" },
        { value: "bottoms", label: "The denominators: 4 and 4" },
      ],
      answer: "tops",
      confirmationText: "",
      hint: "",
      assembles: "1 + 2 = ?",
      equationState: "1 + 2 = ?",
    }),
  ],
  completionStatement: "When fractions share a denominator, add the numerators.",
};

const build = (over: Record<string, unknown> = {}): CalculationSegment => {
  const calc = calculationFromVariant({
    ...QUARTERS,
    ...over,
  } as unknown as CalculationVariant);
  if (!calc) throw new Error("the fixture did not build");
  return calc;
};

const show = ({
  calc = build(),
  level = "light",
  engineSupport,
}: {
  calc?: CalculationSegment;
  level?: ScaffoldLevel | null;
  engineSupport?: { stepId: string; level: "standard" | "strong" } | null;
}) =>
  render(
    <CalculationSolver
      calculation={calc}
      onSolved={vi.fn()}
      level={level}
      engineSupport={engineSupport}
    />,
  );

const card = () =>
  screen
    .queryAllByRole("status")
    .find((s) =>
      (Object.values(CALC_SUPPORT_LINES) as string[]).includes(
        s.textContent ?? "",
      ),
    ) ?? null;

describe("the card after a calculation miss", () => {
  it("draws the picture at standard, and says so in Lydia's words", () => {
    show({ engineSupport: { stepId: "s1", level: "standard" } });

    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Here it is as a picture.");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("draws the picture and the step's hint at strong, and says both", () => {
    show({ engineSupport: { stepId: "s1", level: "strong" } });

    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(card()).toHaveTextContent(
      "Here it is as a picture, with a hint on the question.",
    );
  });

  it("puts the card above everything else in the step", () => {
    const { container } = show({
      engineSupport: { stepId: "s1", level: "standard" },
    });

    const column = container.firstElementChild!;
    expect(column.firstElementChild).toContainElement(card());
  });

  it("is not shown without the server's support - the dots' level alone changes nothing", () => {
    show({ engineSupport: null });

    expect(screen.queryByText("Picture it")).toBeNull();
    expect(card()).toBeNull();
  });

  it("says nothing when the picture was already on screen", () => {
    // No dots, or dots at moderate: the picture is drawn before the miss.
    show({ level: null, engineSupport: { stepId: "s1", level: "standard" } });
    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(card()).toBeNull();
    cleanup();

    show({
      level: "moderate",
      engineSupport: { stepId: "s1", level: "standard" },
    });
    expect(card()).toBeNull();
  });

  it("gives the hint at strong with the picture already there, and no line - Lydia's lines name the picture", () => {
    show({ level: null, engineSupport: { stepId: "s1", level: "strong" } });

    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(card()).toBeNull();
  });

  it("never lowers the support the dots already give", () => {
    show({ level: "full", engineSupport: { stepId: "s1", level: "standard" } });

    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(card()).toBeNull();
  });

  it("says nothing when the calculation has no picture to draw", () => {
    show({
      calc: build({ scaffold: null }),
      engineSupport: { stepId: "s1", level: "strong" },
    });

    expect(screen.queryByText("Picture it")).toBeNull();
    expect(card()).toBeNull();
  });

  it("says only the picture at strong when the step's hint has no words", () => {
    show({
      calc: build({ steps: [QUARTERS.steps[1]] }),
      engineSupport: { stepId: "s2", level: "strong" },
    });

    expect(card()).toHaveTextContent("Here it is as a picture.");
  });

  it("changes nothing in a step the server did not name", () => {
    show({ engineSupport: { stepId: "s2", level: "strong" } });

    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
    expect(screen.queryByText("Picture it")).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(card()).toBeNull();
  });

  it("goes once the step it named is answered", () => {
    show({ engineSupport: { stepId: "s1", level: "standard" } });
    expect(card()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "4 and 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));

    expect(card()).toBeNull();
  });
});
