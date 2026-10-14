import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilingIntro } from "./ProfilingIntro";

/**
 * The baseline's bookends, and one branch that cannot currently fire.
 *
 * **WHY A TEST FOR DEAD CODE.** `saved === false` renders "we couldn't save it
 * just now", and nothing passes `saved` any more: the reduction is parked and
 * delivered once an account exists, so the run cannot know the answer. The
 * branch is kept on purpose - a flow that submits inline would want it back
 * unchanged, and deleting it makes the next person write the same apology
 * slightly differently.
 *
 * Kept code with no caller is exactly what rots. So these pin the two things
 * that would otherwise drift unnoticed: the branch still says what it is meant
 * to say, and the DEFAULT still does not accidentally claim a failure. If
 * somebody starts passing `saved`, the second one is where they will find out
 * that the settled copy needs looking at too.
 */

afterEach(() => {
  cleanup();
});

describe("the completion screen as it is reached today", () => {
  it("does not claim the save failed, because nothing knows yet", () => {
    /*
     * `ProfilingFlow` renders this with no `saved` prop. A child who has just
     * finished four activities must not be shown an apology for a write that
     * is still on its way.
     */
    render(<ProfilingIntro mode="complete" onContinue={() => {}} />);

    expect(document.body.textContent).not.toMatch(/couldn.t save/i);
  });

  it("says nothing about how the child did", () => {
    // "a settled figure, not a celebration" - no results of any kind.
    render(<ProfilingIntro mode="complete" onContinue={() => {}} />);

    expect(document.body.textContent).not.toMatch(
      /score|correct|well done|result|%/i,
    );
  });
});

describe("the branch that is kept but unreachable", () => {
  it("still admits the failure plainly when something does pass it", () => {
    /*
     * The apology is the child's-fault-free one the daily warm-up uses. If
     * this ever becomes reachable again, it should read the same as it does
     * everywhere else rather than being rewritten from memory.
     */
    render(
      <ProfilingIntro mode="complete" onContinue={() => {}} saved={false} />,
    );

    expect(screen.getByText(/that.s on us, not you/i)).toBeInTheDocument();
  });

  it("reads as settled while the answer is still resolving", () => {
    // Null is the live case: parked, on its way, unknown. It must not flicker
    // a warning at a child mid-flight.
    render(
      <ProfilingIntro mode="complete" onContinue={() => {}} saved={null} />,
    );

    expect(document.body.textContent).not.toMatch(/couldn.t save/i);
  });
});

describe("the intro's words (D13, 1 Oct)", () => {
  it("never says test or score to the child about to be measured", () => {
    // It read "No tests, no scores." - the two words the architecture keeps
    // from a child, in a claim about a run that is measured. Design ruled it
    // reworded and gave no words, so the claim goes and nothing is added.
    render(<ProfilingIntro mode="intro" onContinue={() => {}} />);

    expect(document.body.textContent).not.toMatch(/test|score|ability/i);
    expect(
      screen.getByText(
        "You'll do quick activities. This just helps Nevo work better for you.",
      ),
    ).toBeInTheDocument();
  });

  it("states no number of activities (design, 9 Oct)", () => {
    // "Four quick activities" stopped being true when the probe went, and a
    // count has to be kept in step with every change to the run.
    render(<ProfilingIntro mode="intro" onContinue={() => {}} />);

    expect(document.body.textContent).not.toMatch(
      /\b(one|two|three|four|five|six|\d+)\b/i,
    );
  });
});

describe("while the roster is still being read", () => {
  it("neither asks the age nor lets the run start", () => {
    // A run begun now would be sized by a guess. And no age question, then
    // or ever (D153).
    const onContinue = vi.fn();
    render(<ProfilingIntro mode="intro" onContinue={onContinue} waiting />);

    fireEvent.click(screen.getByRole("button", { name: /let's go/i }));

    expect(screen.queryByText(/how old are you/i)).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("stays pressable and says Nearly ready. in place when pressed (D211)", () => {
    // It was greyed out and inert, which reads as broken.
    render(<ProfilingIntro mode="intro" onContinue={() => {}} waiting />);
    const go = screen.getByRole("button", { name: /let's go/i });

    expect(go).not.toBeDisabled();
    expect(go.className).toContain("cursor-pointer");
    expect(go.className).not.toMatch(/opacity|cursor-not-allowed/);
    expect(screen.queryByText("Nearly ready.")).toBeNull();

    fireEvent.click(go);

    const line = screen.getByRole("status");
    expect(line).toHaveTextContent(/^Nearly ready\.$/);
    // The reference's pressable-not-disabled panel, inside the same card.
    expect(line.className).toContain("bg-nevo-violet/14");
    expect(line.className).toContain("rounded-[10px]");
    expect(line.className).toContain("px-[15px]");
    expect(line.className).toContain("py-[13px]");
    expect(line.parentElement).toBe(go.parentElement);
  });

  it("starts on the next press once the band is known, and the line goes", () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <ProfilingIntro mode="intro" onContinue={onContinue} waiting />,
    );
    fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
    expect(screen.getByText("Nearly ready.")).toBeInTheDocument();

    rerender(<ProfilingIntro mode="intro" onContinue={onContinue} />);
    expect(screen.queryByText("Nearly ready.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /let's go/i }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe("the end-of-baseline button (D171, 13 Oct)", () => {
  it("says Let's finish setting up, since the notice and the PIN come next", () => {
    // "Start my first lesson" is not true: the learning notice and PIN
    // creation come first.
    const onContinue = vi.fn();
    render(<ProfilingIntro mode="complete" onContinue={onContinue} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Let's finish setting up" }),
    );

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toMatch(/first lesson/i);
  });
});

describe("the completion line (SCRUM-180, 1 Oct)", () => {
  it("says what is true when it is read, and claims no save", () => {
    // It said "Your learning space has been personalized" - a past-tense
    // claim about a write this screen cannot see.
    render(<ProfilingIntro mode="complete" onContinue={() => {}} />);

    expect(
      screen.getByText(
        "Nevo has everything it needs to set up your learning space.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/personali[sz]ed/i);
  });
});
