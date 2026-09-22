import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PinCreationScreen } from "./PinCreationScreen";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

/**
 * THE SCREEN BLAMED A CHILD FOR A FAILURE THAT WAS NEVER THEIRS.
 *
 * Two different things shared one line. `error` is the child's: the two
 * entries did not match, and typing again is exactly the fix.
 *
 * `saveFailed` never is. By the time it can fire the two entries have ALREADY
 * matched - what failed is the write. That can be a 403 because a teacher is
 * signed in on the tablet, a network that dropped, or a shape the server
 * refused, and not one of them is fixed by retyping. "Type it again to
 * confirm" sent a child round a loop that could not end, and told them it was
 * their mistake.
 *
 * The same distinction the login screen already draws between "that PIN didn't
 * match" and "that's on us, not you".
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ authApi: { setPin: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getSession: () => null }));

/** The screen waits this long before it writes. */
const SAVE_DELAY_MS = 1200;

/** Type a PIN twice - the entry and the confirmation. */
const enter = (pin: string) => {
  for (const digit of [...pin, ...pin]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
};

const alertText = () =>
  document.querySelector('[role="alert"]')?.textContent ?? "";

const SIX = "123456".slice(0, STUDENT_PIN_LENGTH).padEnd(STUDENT_PIN_LENGTH, "7");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("when the write fails", () => {
  const renderFailing = async () => {
    const storePin = vi.fn().mockRejectedValue(new Error("403"));
    render(<PinCreationScreen storePin={storePin} onComplete={vi.fn()} />);
    enter(SIX);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 50);
    });
    return storePin;
  };

  it("does not ask the child to retype something retyping cannot fix", async () => {
    await renderFailing();

    expect(alertText()).not.toMatch(/type it again/i);
  });

  it("says the failure is ours, and points at who can help", async () => {
    // A child cannot clear a 403 or a dropped network. Their teacher can.
    await renderFailing();

    expect(alertText()).toMatch(/that.s on us, not you/i);
    expect(alertText()).toMatch(/teacher can help/i);
  });

  it("did try to store the PIN before saying so", async () => {
    // Guards the test itself: without this the assertions above would pass
    // against a screen that never attempted the write at all.
    const storePin = await renderFailing();

    expect(storePin).toHaveBeenCalled();
  });
});

describe("when the two entries do not match", () => {
  it("still says so, because that one IS the child's to fix", async () => {
    render(<PinCreationScreen storePin={vi.fn()} onComplete={vi.fn()} />);

    for (const digit of [
      ...SIX,
      ...SIX.slice(0, -1),
      SIX.at(-1) === "9" ? "8" : "9",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }

    expect(alertText()).toMatch(/didn.t match/i);
    expect(alertText()).not.toMatch(/on us/i);
  });
});
