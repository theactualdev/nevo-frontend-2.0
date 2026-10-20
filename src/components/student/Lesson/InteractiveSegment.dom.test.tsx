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
