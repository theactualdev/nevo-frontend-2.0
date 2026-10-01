import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TodaysWarmUpCard, WARM_UP_CHIPS, WarmUpCard } from "./WarmUpCard";
import type { WarmUpPrompt } from "@/hooks/useWarmUpDimension";
import { clearSession, setSession } from "@/lib/auth/session";
import { markWarmUpDone } from "@/lib/profiling/warmUpDone";

const engine = vi.hoisted(() => ({
  prompt: { state: "waiting" } as WarmUpPrompt,
}));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => engine.prompt,
}));

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

beforeEach(() => {
  engine.prompt = { state: "waiting" };
  window.localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
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

describe("the words on the card (D13, 1 Oct)", () => {
  it("drops the word the architecture keeps from a child", () => {
    // "No score, it just keeps Nevo tuned..." - design ruled it reworded and
    // gave no words, so the claim goes and nothing is added.
    render(<WarmUpCard dimension="wmc" />);

    expect(document.body.textContent).not.toMatch(/score|test|ability/i);
    expect(
      screen.getByText(/About 45 seconds\. It just keeps Nevo tuned/),
    ).toBeInTheDocument();
  });
});

describe("the card as Home places it - whose answer is done (B10)", () => {
  const signIn = () =>
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId: "child-1",
      role: "student",
    });
  const ready = (doneToday?: boolean): WarmUpPrompt => ({
    state: "ready",
    dimension: "wmc",
    item: null,
    live: true,
    ...(doneToday === undefined ? {} : { doneToday }),
  });

  it("is done on a second tablet when the account says so", () => {
    // Nothing remembered on this device - which was the whole of B10.
    signIn();
    engine.prompt = ready(true);
    render(<TodaysWarmUpCard />);

    expect(screen.getByText(/Today's warm-up is done\./)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("stays done on the tablet that watched it finish, even when the account says not", () => {
    // A device-task day may not set the account's doneToday. Offering it
    // again would be a second run on the same tablet.
    signIn();
    markWarmUpDone("child-1");
    engine.prompt = ready(false);
    render(<TodaysWarmUpCard />);

    expect(screen.getByText(/Today's warm-up is done./)).toBeInTheDocument();
  });

  it("is offered when neither the account nor this tablet has seen it", () => {
    signIn();
    engine.prompt = ready(false);
    render(<TodaysWarmUpCard />);

    expect(
      screen.getByRole("link", { name: /Begin warm-up/i }),
    ).toBeInTheDocument();
  });

  it("leans on this device while the prompt is on its way, so it does not flash", () => {
    signIn();
    markWarmUpDone("child-1");
    render(<TodaysWarmUpCard />);

    expect(screen.getByText(/Today's warm-up is done\./)).toBeInTheDocument();
  });

  it("names the engine's task, and none before it has named one", () => {
    signIn();
    engine.prompt = ready(false);
    const { unmount } = render(<TodaysWarmUpCard />);
    expect(screen.getByText(WARM_UP_CHIPS.wmc)).toBeInTheDocument();
    unmount();

    engine.prompt = { state: "waiting" };
    render(<TodaysWarmUpCard />);
    expect(screen.queryByText(WARM_UP_CHIPS.wmc)).toBeNull();
  });
});
