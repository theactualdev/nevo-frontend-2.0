import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalculationSolver, type StepGiven } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import {
  MARK_WAIT_LINE,
  SEND_AGAIN,
  SLOW_MARK_MS,
  type PendingVerdict,
  type Verdict,
  type VerdictReply,
} from "@/lib/lessons/verdict";
import type { CalculationSegment } from "@/lib/types";

/**
 * TEST 9 IN THE CALCULATION SOLVER: a committed step moves on the mark its
 * host gives back (`onStepGiven`), never on the step's stored answers, and is
 * held quietly until it lands. The stored answers mark it only where the host
 * gives nothing back - offline.
 */

afterEach(cleanup);

const STEP = {
  stepId: "s1",
  stepNumber: 1,
  prompt: "What is 1 + 2?",
  expectedInput: "numeric",
  input: "number",
  options: [],
  answer: "3",
  targets: [],
  hint: "",
  confirmationText: "",
  visualUpdate: "",
  assembles: "1 + 2 = 3",
  equationState: "1 + 2 = 3",
  unit: null,
  narrationAudio: null,
};

const calc = (): CalculationSegment => {
  const built = calculationFromVariant({
    type: "co_construction",
    conceptId: "c-1",
    fullEquation: "1 + 2 = 3",
    expression: "1 + 2 = ?",
    answer: "3",
    steps: [STEP],
    completionStatement: "Done.",
  } as unknown as CalculationVariant);
  if (!built) throw new Error("the fixture did not build");
  return built;
};

const show = (
  onStepGiven: (given: StepGiven, packageMark: Verdict) => VerdictReply | undefined,
) => {
  const props = {
    onSolved: vi.fn(),
    onStepCommitted: vi.fn(),
    onStepAnswered: vi.fn(),
    onStepGiven: vi.fn(onStepGiven),
  };
  render(<CalculationSolver calculation={calc()} {...props} />);
  return props;
};
const answer = (typed: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: typed } });
  fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));
};

describe("a calculation step moves on its host's mark", () => {
  it("is not solved by the stored answer when the mark says wrong", () => {
    const props = show(() => false);
    answer("3");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", false);
    expect(props.onSolved).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("3");
  });

  it("is solved by an answer the stored ones miss, when the mark says right", () => {
    const props = show(() => true);
    answer("6/2");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
    expect(props.onSolved).toHaveBeenCalled();
  });

  it("goes on, counting nothing, for an answer the server could not mark", () => {
    const props = show(() => null);
    answer("4");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", null);
    expect(props.onSolved).toHaveBeenCalled();
  });

  it("hands its host the stored answers' mark, for offline only", () => {
    const props = show(() => undefined);
    answer("3");

    expect(props.onStepGiven).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "s1", answer: "3" }),
      true,
    );
    // Nothing given back: the stored answers decide, as offline.
    expect(props.onSolved).toHaveBeenCalled();
  });
});

describe("while a step's mark is on its way", () => {
  it("signals the commit at once, holds the step, takes no second commit and no new key", async () => {
    let land: (mark: Verdict) => void = () => {};
    const props = show(
      () =>
        new Promise<Verdict>((resolve) => {
          land = resolve;
        }),
    );
    answer("3");

    // The signal goes as the child commits, before any mark.
    expect(props.onStepCommitted).toHaveBeenCalledWith("s1");
    expect(props.onStepAnswered).not.toHaveBeenCalled();
    expect(props.onSolved).not.toHaveBeenCalled();
    // Typing and a second Check do nothing while it is marked.
    answer("5");
    expect(screen.getByRole("textbox")).toHaveValue("3");
    expect(props.onStepGiven).toHaveBeenCalledOnce();

    await act(async () => land(true));
    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
    expect(props.onSolved).toHaveBeenCalled();
  });
});

/** A reply that never lands on its own, can be sent again, and can fail. */
function failingReply() {
  const reply: PendingVerdict = new Promise<Verdict>(() => {});
  const listeners = new Set<() => void>();
  reply.retry = vi.fn();
  reply.onFailure = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const fail = () =>
    act(() => {
      for (const hear of [...listeners]) hear();
    });
  return { reply, fail };
}

describe("the wait for a mark (SCRUM-315; Lydia, 9 Nov, restated 10 Nov)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says her line under the step past two seconds, and never retries on a timer", () => {
    vi.useFakeTimers();
    const { reply } = failingReply();
    show(() => reply);
    answer("3");

    expect(screen.queryByText(MARK_WAIT_LINE)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });
    expect(screen.getByText(MARK_WAIT_LINE)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS * 30);
    });
    expect(screen.queryByRole("button", { name: SEND_AGAIN })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers Send again under the step on a real failure, which sends the same answer again", async () => {
    vi.useFakeTimers();
    const { reply, fail } = failingReply();
    show(() => reply);
    answer("3");

    await fail();
    fireEvent.click(screen.getByRole("button", { name: SEND_AGAIN }));

    expect(reply.retry).toHaveBeenCalledOnce();
  });
});
