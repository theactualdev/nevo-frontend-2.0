import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { YoureInScreen } from "./YoureInScreen";

/**
 * "You're In" says one thing: "You're all set. Let's start learning".
 *
 * D71, 6 Oct: the line it added when the device could not remember the child -
 * "Next time you open Nevo, ask your teacher to help you sign in." - comes
 * out. "You're In is a passive moment of success, and a line about asking for
 * help implies something has gone wrong at the exact moment nothing has."
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("YoureInScreen", () => {
  it("celebrates, and says nothing about signing in next time (D71)", () => {
    render(<YoureInScreen onDone={() => {}} />);

    expect(screen.getByText(/You’re all set/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(
      /sign in|ask your teacher|next time/i,
    );
  });

  it("moves on after the celebration's hold", () => {
    const onDone = vi.fn();
    render(<YoureInScreen onDone={onDone} />);

    act(() => void vi.advanceTimersByTime(2399));
    expect(onDone).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("the hold, as the engine is told it", () => {
  it("is one system_busy, sent as the screen goes, with how long it held", () => {
    /*
     * The catalogue's `{ reason, durationMs }`, so the stillness on this
     * screen is never read as hesitation. It went up as a start and an end,
     * each `{ reason, phase }` - two events and no length on either.
     */
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const track = vi.fn();
    const { unmount } = render(
      <YoureInScreen onDone={() => {}} track={track} />,
    );
    expect(track).not.toHaveBeenCalled();

    now = 2_400;
    unmount();

    expect(track.mock.calls).toEqual([
      ["system_busy", { reason: "transition_screen", durationMs: 2_400 }],
    ]);
  });
});
