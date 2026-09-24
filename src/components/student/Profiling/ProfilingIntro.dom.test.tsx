import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
