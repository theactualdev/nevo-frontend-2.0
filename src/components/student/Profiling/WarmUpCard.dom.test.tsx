import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WARM_UP_CHIPS, WarmUpCard } from "./WarmUpCard";

/**
 * The card once today's warm-up is behind them. Design's words, 24 Sep.
 *
 * **THE BEHAVIOUR IS HALF THE RULING.** *"It stops being an action. No tap, no
 * navigation into the done state, because a card that looks tappable and lands
 * somewhere inert is worse than a card that plainly says it has finished."*
 *
 * This existed because the run became once-a-day and the card did not: it kept
 * saying "Begin warm-up" and led to a screen that said the opposite.
 */

afterEach(() => {
  cleanup();
});

describe("before today's warm-up", () => {
  it("offers it", () => {
    render(<WarmUpCard dimension="wmc" />);

    expect(
      screen.getByRole("link", { name: /Begin warm-up/i }),
    ).toBeInTheDocument();
  });
});

describe("once it is done", () => {
  it("says so, in design's words", () => {
    render(<WarmUpCard dimension="wmc" done />);

    expect(screen.getByText(/Today's warm-up is done\./)).toBeInTheDocument();
    expect(screen.getByText(/Come back tomorrow\./)).toBeInTheDocument();
  });

  it("stops being an action - nothing to tap, nowhere to go", () => {
    /*
     * THE DECISIVE ONE. A disabled-looking button or a greyed link would both
     * still be a control; the ruling is that the control is gone.
     */
    render(<WarmUpCard dimension="wmc" done />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("no longer offers the warm-up it cannot give", () => {
    render(<WarmUpCard dimension="wmc" done />);

    expect(screen.queryByText(/Begin warm-up/i)).toBeNull();
    expect(screen.queryByText(/A quick warm-up to begin/i)).toBeNull();
  });

  it("drops the chip naming a task that is no longer on offer", () => {
    // "Quick patterns today" describes something the child cannot now do.
    render(<WarmUpCard dimension="wmc" done />);

    expect(screen.queryByText(/Quick patterns today/i)).toBeNull();
  });

  it("says nothing about how it went", () => {
    /*
     * Ruled explicitly - no praise, no score - and it is the same line the
     * run's own done state holds. "Today's warm-up is done" is a fact about
     * the day, not a verdict on the child.
     */
    render(<WarmUpCard dimension="wmc" done />);

    expect(document.body.textContent).not.toMatch(
      /well done|great|nice|score|correct|streak|you got|%/i,
    );
  });
});

describe("before the engine has named a task", () => {
  it("names none", () => {
    // The chip named the weekday rotation's task, which the run no longer
    // falls back to for a signed-in child.
    render(<WarmUpCard dimension={null} />);

    for (const chip of Object.values(WARM_UP_CHIPS)) {
      expect(screen.queryByText(chip)).toBeNull();
    }
    expect(
      screen.getByRole("link", { name: /Begin warm-up/i }),
    ).toBeInTheDocument();
  });
});
