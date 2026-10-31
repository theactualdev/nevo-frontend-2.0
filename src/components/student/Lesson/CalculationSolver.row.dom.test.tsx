import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalculationSolver, SLOWER_BEAT_MS, SLOWER_LINE } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { CalculationSegment } from "@/lib/types";

/**
 * THE CHILD'S OWN ROW ON THE CALCULATION (Lydia, 29 Oct: "Do not remove it. A
 * gap on the backend should not cost a child a control on their screen"):
 * Slower and More support, as the frame's gate controls draw them, and no
 * Fewer steps until the server can send answerable parts. And the engine's
 * support after a miss: the step at the strong level, with no card and no
 * words (Hub, 29 Oct).
 */

afterEach(cleanup);

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
  hint: "Look at the bottom number of each fraction.",
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
  scaffold: { kind: "bar", parts: 4, rows: 2, marks: [1, 2], labels: ["1/4", "2/4"] },
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
  completionStatement: "",
};

const build = (over: Record<string, unknown> = {}): CalculationSegment => {
  const calc = calculationFromVariant({ ...QUARTERS, ...over } as unknown as CalculationVariant);
  if (!calc) throw new Error("the fixture did not build");
  return calc;
};

const show = (
  calc: CalculationSegment = build(),
  extra: Partial<React.ComponentProps<typeof CalculationSolver>> = {},
) => {
  const props = { onSolved: vi.fn(), onHintShown: vi.fn() };
  const view = render(<CalculationSolver calculation={calc} {...props} {...extra} />);
  return { props, view };
};

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const HINT = "Look at the bottom number of each fraction.";
/** The drawing, which a light level takes away and a strong one draws. */
const card = () => screen.queryByText("Picture it");
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("the child's own row", () => {
  it("offers Slower and More support as pills, pressed or not, and no Fewer steps", () => {
    show(build(), { onSlower: vi.fn(), level: "light" });

    expect(pressed("Slower")).toBe("false");
    expect(pressed("More support")).toBe("false");
    const slower = screen.getByRole("button", { name: "Slower" });
    expect(slower.className).toContain("rounded-full");
    expect(slower.className).toContain("h-10");
    expect(slower.className).toContain("bg-nevo-cream-elevated");
    expect(screen.queryByRole("button", { name: "Fewer steps" })).toBeNull();
  });

  it("draws Slower navy while it is on", () => {
    show(build(), { onSlower: vi.fn(), slower: true });
    expect(pressed("Slower")).toBe("true");
    expect(screen.getByRole("button", { name: "Slower" }).className).toContain("bg-nevo-navy");
  });

  it("has no Slower where the host gives it no way to keep the pace", () => {
    show();
    expect(screen.queryByRole("button", { name: "Slower" })).toBeNull();
    expect(screen.getByRole("button", { name: "More support" })).toBeInTheDocument();
  });

  it("hands Slower to the host, which holds the lesson's pace", () => {
    const onSlower = vi.fn();
    show(build(), { onSlower });
    tap("Slower");
    expect(onSlower).toHaveBeenCalledTimes(1);
  });

  it("is gone once the solve is done", () => {
    show(build(), { onSlower: vi.fn() });
    pick("4 and 4");
    tap("Next step");
    pick("The numerators: 1 and 2");
    expect(screen.queryByRole("button", { name: "Slower" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
  });
});

describe("More support, and the engine's support after a miss", () => {
  it("puts this step at the strong level - the drawing and the step's hint, unasked", () => {
    const { props } = show(build(), { level: "light" });
    expect(card()).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();

    tap("More support");

    expect(pressed("More support")).toBe("true");
    expect(card()).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(props.onHintShown).toHaveBeenCalledWith("step", "s1");

    // Pressed again, the step is back at the engine's level.
    tap("More support");
    expect(pressed("More support")).toBe("false");
    expect(card()).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("is for this step only: the next opens at the engine's level", () => {
    show(build(), { level: "light" });
    tap("More support");
    pick("4 and 4");
    tap("Next step");

    expect(screen.getByText("What do we add together?")).toBeInTheDocument();
    expect(pressed("More support")).toBe("false");
    expect(card()).toBeNull();
  });

  it("puts the step the engine named at the strong level, with nothing said about it", () => {
    const { props } = show(build(), { level: "light", engineSupportStep: "s1" });

    expect(card()).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(props.onHintShown).toHaveBeenCalledWith("step", "s1");
    // No card and no words of its own; the row's More support is the child's.
    expect(pressed("More support")).toBe("false");
    expect(document.body.textContent).not.toMatch(/more support in this step/i);
  });

  it("leaves a step the engine did not name at the engine's level", () => {
    show(build(), { level: "light", engineSupportStep: "s2" });
    expect(card()).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe("Slower on the calculation", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());
  const beat = () => act(() => void vi.advanceTimersByTime(SLOWER_BEAT_MS));
  const options = () => screen.queryByRole("button", { name: "4 and 4" });

  it("puts the frame's line above the question, and the answer a beat after it", () => {
    show(build(), { slower: true, onSlower: vi.fn() });

    const line = screen.getByText(SLOWER_LINE);
    const question = screen.getByText("What are the denominators?");
    expect(line.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(options()).toBeNull();

    act(() => void vi.advanceTimersByTime(SLOWER_BEAT_MS - 1));
    expect(options()).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(options()).toBeInTheDocument();
  });

  it("paces on the calm-entry motion token (provisional)", () => {
    expect(SLOWER_BEAT_MS).toBe(550);
  });

  it("shows a step with parts as its parts, one a beat, then the answer", () => {
    const calc = build({
      steps: [
        step({
          parts: [
            "Look at the two fractions.",
            "Each has a number on the bottom.",
            "Those are the denominators.",
          ],
        }),
      ],
    });
    show(calc, { slower: true });

    // The step as its parts, in the question's place.
    expect(screen.queryByText("What are the denominators?")).toBeNull();
    expect(screen.getByText("Look at the two fractions.")).toBeInTheDocument();
    expect(screen.queryByText("Each has a number on the bottom.")).toBeNull();
    expect(options()).toBeNull();

    beat();
    expect(screen.getByText("Each has a number on the bottom.")).toBeInTheDocument();
    expect(screen.queryByText("Those are the denominators.")).toBeNull();
    beat();
    expect(screen.getByText("Those are the denominators.")).toBeInTheDocument();
    expect(options()).toBeNull();
    beat();
    expect(options()).toBeInTheDocument();
  });

  it("shows the question whole, no parts and no line, without Slower", () => {
    const calc = build({
      steps: [step({ parts: ["Look at the two fractions.", "Those are the denominators."] })],
    });
    show(calc);

    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
    expect(screen.queryByText("Look at the two fractions.")).toBeNull();
    expect(options()).toBeInTheDocument();
    expect(screen.queryByText(SLOWER_LINE)).toBeNull();
  });

  it("paces the next step too, after the child's Next step", () => {
    show(build(), { slower: true });
    beat();
    pick("4 and 4");
    tap("Next step");

    expect(screen.getByText("What do we add together?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "The numerators: 1 and 2" })).toBeNull();
    beat();
    expect(screen.getByRole("button", { name: "The numerators: 1 and 2" })).toBeInTheDocument();
  });

  it("never takes away an answer area the child is already in when Slower comes on", () => {
    const { view, props } = show();
    expect(options()).toBeInTheDocument();

    view.rerender(<CalculationSolver calculation={build()} {...props} slower />);

    expect(options()).toBeInTheDocument();
    expect(screen.getByText(SLOWER_LINE)).toBeInTheDocument();
  });

  it("brings everything at once when Slower goes off part-way", () => {
    const { view, props } = show(build(), { slower: true });
    expect(options()).toBeNull();

    view.rerender(<CalculationSolver calculation={build()} {...props} />);

    expect(options()).toBeInTheDocument();
  });
});
