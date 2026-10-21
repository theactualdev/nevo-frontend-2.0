import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InteractiveSegment } from "./InteractiveSegment";

/**
 * A step card is a button whose text sits only in nested spans - the pattern
 * the 20 Oct production run's accessibility read found unnamed on the
 * key-term chips. It is named on the button itself, as the card reads.
 */

afterEach(() => cleanup());

const CONTENT = {
  heading: "Grow a bean",
  steps: ["Fold a wet paper towel.", "Put the bean inside."],
  outcome: { pending: "Wait a few days.", done: "A root appears." },
};

describe("the step cards", () => {
  it("are named on the button, step number and all", () => {
    render(<InteractiveSegment content={CONTENT} />);

    const first = screen.getByRole("button", {
      name: "Step 1: Fold a wet paper towel.",
    });
    expect(first).toHaveAttribute("aria-label", "Step 1: Fold a wet paper towel.");
    expect(
      screen.getByRole("button", { name: "Step 2: Put the bean inside." }),
    ).toHaveAttribute("aria-label", "Step 2: Put the bean inside.");
  });

  it("still say which are ticked", () => {
    render(<InteractiveSegment content={CONTENT} />);

    const first = screen.getByRole("button", {
      name: "Step 1: Fold a wet paper towel.",
    });
    expect(first).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
  });
});

/*
 * SCRUM-268, BUILT REDUCED (21 Oct). The frame draws a guide line while the
 * steps are under way and the result once they are done; the contract
 * carries one `outcome`, the result. So a live activity's card waits for the
 * last tick, and nothing is written to stand in for the guide line.
 */
describe("what you should see, for a live activity", () => {
  const LIVE = {
    heading: "Grow a bean",
    steps: ["Fold a wet paper towel.", "Put the bean inside."],
    outcome: { done: "A root appears." },
  };
  const tick = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name }));

  it("is not shown before every step is ticked", () => {
    render(<InteractiveSegment content={LIVE} />);

    expect(screen.queryByText("What you should see")).toBeNull();
    tick("Step 1: Fold a wet paper towel.");
    expect(screen.queryByText("What you should see")).toBeNull();
    expect(screen.queryByText("A root appears.")).toBeNull();
  });

  it("shows the server's outcome once they are, with the frame's tick", () => {
    const { container } = render(<InteractiveSegment content={LIVE} />);

    tick("Step 1: Fold a wet paper towel.");
    tick("Step 2: Put the bean inside.");

    expect(screen.getByText("What you should see")).toBeInTheDocument();
    const outcome = screen.getByText("A root appears.");
    // The navy disc with the tick sits beside it.
    expect(outcome.previousElementSibling?.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toMatch(/once you've done/i);
  });

  it("draws no card for an activity with no outcome at all", () => {
    render(
      <InteractiveSegment content={{ heading: "Grow a bean", steps: ["Fold it."] }} />,
    );
    tick("Step 1: Fold it.");

    expect(screen.queryByText("What you should see")).toBeNull();
  });
});

describe("what you should see, for the authored walkthrough", () => {
  it("keeps its guide line before the steps are done, as before", () => {
    render(<InteractiveSegment content={CONTENT} />);

    expect(screen.getByText("What you should see")).toBeInTheDocument();
    expect(screen.getByText("Wait a few days.")).toBeInTheDocument();
  });
});
