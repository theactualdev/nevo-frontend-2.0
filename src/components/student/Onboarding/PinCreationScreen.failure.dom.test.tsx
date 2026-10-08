import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PinCreationScreen } from "./PinCreationScreen";
import { ApiError } from "@/lib/api/client";
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

// The first render pays for the keypad's import; under a loaded worker that
// alone outran the 5s default, and the timeout took the file down with it.
vi.setConfig({ testTimeout: 30_000 });

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
    // Nothing to type into: frame 15 hides the rows (D61).
    expect(screen.queryByText("Type it again to confirm")).toBeNull();
    expect(screen.queryByLabelText("Your PIN")).toBeNull();
  });

  it("says the failure is ours, and that the PIN is kept", async () => {
    // Frame 15's didn't-save state (D61), verbatim.
    await renderFailing();

    expect(alertText()).toContain("That didn't save");
    expect(alertText()).toContain("Your PIN is kept. That's on us - try again.");
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
    expect(alertText()).not.toMatch(/on us|didn.t save/i);
  });
});

/** A refusal as the PIN route sends it: `{detail: {code, message}}`. */
const refused = (status: number, code?: string) =>
  new ApiError(
    status,
    "refused",
    code ? { detail: { code, message: "said by the server" } } : undefined,
  );

describe("when the PIN route says why (B68)", () => {
  const renderRefused = async (
    cause: unknown,
    onRefused?: (refusal: string) => void,
  ) => {
    const storePin = vi.fn().mockRejectedValue(cause);
    render(
      <PinCreationScreen
        storePin={storePin}
        onRefused={onRefused}
        onComplete={vi.fn()}
      />,
    );
    enter(SIX);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 50);
    });
    return storePin;
  };

  it("asks a throttled child to wait, in D68's words, not to try again now", async () => {
    await renderRefused(refused(429, "too_many_attempts"));

    expect(alertText()).toContain("That didn't save");
    expect(alertText()).toContain("Let's wait a moment before trying again.");
    expect(alertText()).not.toContain("That's on us - try again.");
    // The PIN is still kept: the button sends it again once they have waited.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it.each([
    ["a child who has a PIN", refused(409, "pin_already_set"), "has-pin"],
    ["a pair that names nobody", refused(404, "entry_not_found"), "not-found"],
    ["consent that has not come", refused(403, "consent_pending"), "consent"],
    ["the age check", refused(403, "age_check_pending"), "age-check"],
  ])("hands %s to the caller, and shows no failure of its own", async (_, cause, expected) => {
    const onRefused = vi.fn();
    await renderRefused(cause, onRefused);

    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused).toHaveBeenCalledWith(expected);
    expect(alertText()).not.toContain("That didn't save");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("is the not-saved state for those refusals when no caller takes them", async () => {
    await renderRefused(refused(409, "pin_already_set"));

    expect(alertText()).toContain("Your PIN is kept. That's on us - try again.");
  });

  it("is the not-saved state for a refusal that does not name itself", async () => {
    const onRefused = vi.fn();
    await renderRefused(refused(409), onRefused);

    expect(onRefused).not.toHaveBeenCalled();
    expect(alertText()).toContain("Your PIN is kept. That's on us - try again.");
  });
});
