import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CalculationSolver,
  MORE_SUPPORT_LABEL,
  SLOWER_LINE,
  SLOWER_NEXT,
} from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { CalculationSegment } from "@/lib/types";

/**
 * THE CHILD'S OWN ROW ON THE CALCULATION (Lydia, 29 Oct: "Do not remove it. A
 * gap on the backend should not cost a child a control on their screen"):
 * Slower, as the frame's gate controls draw it, and no Fewer steps until the
 * server can send answerable parts. More support is gone (Lydia, 2 Nov): the
 * support in a step is the server's, after a miss - see
 * `CalculationSolver.supportcard.dom.test.tsx`. And Slower's pieces come when
 * the child taps, never on a timer (Lydia, 2 Nov; Hub, 4 Nov: chunked
 * reading's own "Tap to continue").
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
  const props = { onSolved: vi.fn(), onHintShown: vi.fn(), onAct: vi.fn() };
  const view = render(<CalculationSolver calculation={calc} {...props} {...extra} />);
  return { props, view };
};

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("the child's own row", () => {
  it("offers Slower as a pill, pressed or not, and no More support or Fewer steps", () => {
    show(build(), { onSlower: vi.fn(), level: "light" });

    expect(pressed("Slower")).toBe("false");
    const slower = screen.getByRole("button", { name: "Slower" });
    expect(slower.className).toContain("rounded-full");
    expect(slower.className).toContain("h-10");
    expect(slower.className).toContain("bg-nevo-cream-elevated");
    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fewer steps" })).toBeNull();
  });

  it("draws Slower navy while it is on", () => {
    show(build(), { onSlower: vi.fn(), slower: true });
    expect(pressed("Slower")).toBe("true");
    expect(screen.getByRole("button", { name: "Slower" }).className).toContain("bg-nevo-navy");
  });

  it("has no row at all where the host gives it no way to keep the pace", () => {
    show();
    expect(screen.queryByRole("button", { name: "Slower" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
    // The column opens on the problem itself, with no empty row above it.
    expect(document.querySelector(".mb-4.flex.flex-wrap.gap-2")).toBeNull();
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
  });
});

describe("Slower on the calculation", () => {
  const options = () => screen.queryByRole("button", { name: "4 and 4" });
  const next = () => screen.queryByRole("button", { name: SLOWER_NEXT });

  it("puts the frame's line above a step with pieces, and the answer on the child's tap", () => {
    show(build({ steps: [step({ parts: ["One.", "Two."] })] }), {
      slower: true,
      onSlower: vi.fn(),
    });

    const line = screen.getByText(SLOWER_LINE);
    const first = screen.getByText("One.");
    expect(line.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(options()).toBeNull();

    tap(SLOWER_NEXT);
    tap(SLOWER_NEXT);

    expect(options()).toBeInTheDocument();
    expect(next()).toBeNull();
  });

  /*
   * LYDIA, 7 NOV (copy pass, urgent): "That line is a claim about something
   * that is not going to happen... in front of children." A step with no
   * pieces in the child's read - none made, or pieces still waiting for a
   * teacher, which the server keeps back - is paced without it.
   */
  it("says nothing of a step at a time on a step with no pieces, and still paces it", () => {
    show(build(), { slower: true, onSlower: vi.fn() });

    expect(screen.queryByText(SLOWER_LINE)).toBeNull();
    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
    expect(options()).toBeNull();

    tap(SLOWER_NEXT);

    expect(options()).toBeInTheDocument();
  });

  it("never brings a piece on a timer", () => {
    vi.useFakeTimers();
    try {
      show(build(), { slower: true });
      act(() => void vi.advanceTimersByTime(60_000));
      expect(options()).toBeNull();
      expect(next()).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses chunked reading's own control, in its words and its look", () => {
    show(build(), { slower: true });

    const control = next()!;
    expect(SLOWER_NEXT).toBe("Tap to continue");
    expect(control.className).toContain("bg-nevo-navy/8");
    expect(control.className).toContain("w-full");
  });

  it("shows a step with parts as its parts, one a tap, then the answer", () => {
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
    const { props } = show(calc, { slower: true });

    // The step as its parts, in the question's place.
    expect(screen.queryByText("What are the denominators?")).toBeNull();
    expect(screen.getByText("Look at the two fractions.")).toBeInTheDocument();
    expect(screen.queryByText("Each has a number on the bottom.")).toBeNull();
    expect(options()).toBeNull();

    tap(SLOWER_NEXT);
    expect(screen.getByText("Each has a number on the bottom.")).toBeInTheDocument();
    expect(screen.queryByText("Those are the denominators.")).toBeNull();
    tap(SLOWER_NEXT);
    expect(screen.getByText("Those are the denominators.")).toBeInTheDocument();
    expect(options()).toBeNull();
    tap(SLOWER_NEXT);
    expect(options()).toBeInTheDocument();
    expect(next()).toBeNull();
    // Each tap is the child acting.
    expect(props.onAct).toHaveBeenCalledTimes(3);
  });

  it("reads each new piece out as it arrives", () => {
    show(build({ steps: [step({ parts: ["One.", "Two."] })] }), { slower: true });

    expect(screen.getByText("One.").parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("puts the focus on the answer the last tap brings, never on nothing", () => {
    show(build(), { slower: true });
    next()!.focus();

    tap(SLOWER_NEXT);

    expect(document.activeElement).toBe(options());
  });

  it("leaves the focus where it was on a tap that brings only a piece", () => {
    show(build({ steps: [step({ parts: ["One.", "Two."] })] }), { slower: true });
    const control = next()!;
    control.focus();

    tap(SLOWER_NEXT);

    expect(document.activeElement).toBe(control);
  });

  it("shows the question whole, no parts, no line and no tap, without Slower", () => {
    const calc = build({
      steps: [step({ parts: ["Look at the two fractions.", "Those are the denominators."] })],
    });
    show(calc);

    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
    expect(screen.queryByText("Look at the two fractions.")).toBeNull();
    expect(options()).toBeInTheDocument();
    expect(screen.queryByText(SLOWER_LINE)).toBeNull();
    expect(next()).toBeNull();
  });

  it("paces the next step too, after the child's Next step", () => {
    show(build(), { slower: true });
    tap(SLOWER_NEXT);
    pick("4 and 4");
    tap("Next step");

    expect(screen.getByText("What do we add together?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "The numerators: 1 and 2" })).toBeNull();
    tap(SLOWER_NEXT);
    expect(screen.getByRole("button", { name: "The numerators: 1 and 2" })).toBeInTheDocument();
  });

  it("never takes away an answer area the child is already in when Slower comes on", () => {
    const { view, props } = show();
    expect(options()).toBeInTheDocument();

    view.rerender(<CalculationSolver calculation={build()} {...props} slower />);

    expect(options()).toBeInTheDocument();
    // A step with no pieces: no line (Lydia, 7 Nov).
    expect(screen.queryByText(SLOWER_LINE)).toBeNull();
    expect(next()).toBeNull();
  });

  it("brings everything at once when Slower goes off part-way", () => {
    const { view, props } = show(build(), { slower: true });
    expect(options()).toBeNull();

    view.rerender(<CalculationSolver calculation={build()} {...props} />);

    expect(options()).toBeInTheDocument();
    expect(next()).toBeNull();
  });
});

/*
 * MORE SUPPORT IS THE IDEA BEHIND THE STEP (8c67353 `conceptExplanation`;
 * Lydia, 2 Nov: "help with the concept", never the hint; "Where a step has no
 * explanation to serve, More support is not offered on that step").
 */
describe("More support on the calculation", () => {
  const IDEA = "The denominator is the bottom number of each fraction.";
  const withIdea = () =>
    build({
      steps: [
        step({ conceptExplanation: IDEA }),
        { ...QUARTERS.steps[1] },
      ],
    });

  it("is not offered on a step with no explanation", () => {
    show(build(), { onSlower: vi.fn(), onMoreSupport: vi.fn() });

    expect(screen.getByRole("button", { name: "Slower" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
  });

  it("is offered on a step with one, as a pill beside Slower, and hands the press to the host", () => {
    const onMoreSupport = vi.fn();
    const { props } = show(withIdea(), { onSlower: vi.fn(), onMoreSupport });

    expect(pressed("More support")).toBe("false");
    tap("More support");

    expect(onMoreSupport).toHaveBeenCalledTimes(1);
    expect(props.onAct).toHaveBeenCalled();
  });

  it("makes a row of its own where there is no Slower", () => {
    show(withIdea(), { onMoreSupport: vi.fn() });

    expect(screen.queryByRole("button", { name: "Slower" })).toBeNull();
    expect(screen.getByRole("button", { name: "More support" })).toBeInTheDocument();
  });

  it("shows the frame's card above the question while on: its label and the step's explanation", () => {
    show(withIdea(), { onMoreSupport: vi.fn(), moreSupport: true });

    expect(pressed("More support")).toBe("true");
    const label = screen.getByText(MORE_SUPPORT_LABEL);
    expect(MORE_SUPPORT_LABEL).toBe("LET'S LOOK AT THIS PART TOGETHER");
    const card = label.parentElement!;
    expect(card).toHaveClass("bg-nevo-violet/14", "rounded-[12px]");
    expect(card).toHaveTextContent(IDEA);
    const question = screen.getByText("What are the denominators?");
    expect(
      card.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no card while off", () => {
    show(withIdea(), { onMoreSupport: vi.fn() });

    expect(screen.queryByText(MORE_SUPPORT_LABEL)).toBeNull();
    expect(screen.queryByText(IDEA)).toBeNull();
  });

  it("is never the hint, and changes no level: the drawing and the hint stay as they were", () => {
    show(withIdea(), { onMoreSupport: vi.fn(), moreSupport: true, level: "light" });

    expect(screen.queryByText("Picture it")).toBeNull();
    expect(screen.queryByText("Look at the bottom number of each fraction.")).toBeNull();
    expect(screen.getByRole("button", { name: /need a hint/i })).toBeInTheDocument();
  });

  it("is held on: the next step with no explanation shows no card and no pill", () => {
    show(withIdea(), { onMoreSupport: vi.fn(), moreSupport: true });
    pick("4 and 4");
    tap("Next step");

    expect(screen.getByText("What do we add together?")).toBeInTheDocument();
    expect(screen.queryByText(MORE_SUPPORT_LABEL)).toBeNull();
    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
  });

  it("is not offered where the host gives it no way to hold the choice", () => {
    show(withIdea(), { moreSupport: true });

    expect(screen.queryByRole("button", { name: "More support" })).toBeNull();
    expect(screen.queryByText(MORE_SUPPORT_LABEL)).toBeNull();
  });
});
