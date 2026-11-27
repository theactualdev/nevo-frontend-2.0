import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BreakOfferCard } from "./BreakOfferCard";

/**
 * 17d S5's break card in place of frame 38's pill (Lydia, 25 Oct, SCRUM-282;
 * built on her 19 Nov L2). Two cards by the break's weight (26 Oct), her
 * 7 Nov line for the two kinds that have one, and an offer that never goes by
 * itself.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const offer = (kind: string | null, handlers: Partial<{ onAccept: () => void; onDismiss: () => void; onShown: () => void }> = {}) => {
  render(
    <BreakOfferCard
      kind={kind}
      onAccept={handlers.onAccept ?? (() => {})}
      onDismiss={handlers.onDismiss ?? (() => {})}
      onShown={handlers.onShown}
    />,
  );
  act(() => {
    vi.advanceTimersByTime(1_600);
  });
};

describe("the break card", () => {
  it.each([
    ["micro", "Want to pause for a moment?", "A slow breath, then straight back to where you are.", "Take a short pause"],
    ["consolidation", "Want to pause for a moment?", "Let's go back over what you just did.", "Take a short pause"],
    ["movement", "This might be a good moment for a break.", "Stand up and stretch for a moment.", "Take a break"],
    ["full", "This might be a good moment for a break.", "Step away and come back when you're ready. Your place is kept for you.", "Take a break"],
  ])("draws a %s break as its weight's card", (kind, title, body, take) => {
    offer(kind);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: take })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not just now" })).toBeInTheDocument();
  });

  it("waits a beat before it appears, and says when it has", () => {
    const onShown = vi.fn();
    render(<BreakOfferCard kind="micro" onAccept={() => {}} onDismiss={() => {}} onShown={onShown} />);
    expect(screen.queryByText("Want to pause for a moment?")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1_600);
    });

    expect(screen.getByText("Want to pause for a moment?")).toBeInTheDocument();
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it("never goes by itself (SCRUM-282: no timer)", () => {
    offer("full");
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    expect(screen.getByText("This might be a good moment for a break.")).toBeInTheDocument();
  });

  it("takes the break, or carries on, at the child's word", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    offer("movement", { onAccept, onDismiss });

    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));
    fireEvent.click(screen.getByRole("button", { name: "Not just now" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("draws nothing for a kind this player does not take", () => {
    const onShown = vi.fn();
    offer("nap", { onShown });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/stop here for today/i)).toBeNull();
    expect(onShown).not.toHaveBeenCalled();
  });
});

/**
 * L60 (Lydia, 25 Nov): 17d S5's third card, with her body in place of the
 * frame's, which claimed the latest place is kept (D88).
 */
describe("stopping for today", () => {
  it("is the frame's third card, in Lydia's words", () => {
    offer("stop_for_day");

    expect(screen.getByText("It's okay to stop here for today.")).toBeInTheDocument();
    expect(
      screen.getByText("Your last saved point is kept, and this lesson will be here when you come back."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop for today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stay a little longer" })).toBeInTheDocument();
  });

  it("never claims the place itself is kept (D88)", () => {
    offer("stop_for_day");

    expect(document.body.textContent).not.toMatch(/right where you are|nothing is lost/i);
  });
});
