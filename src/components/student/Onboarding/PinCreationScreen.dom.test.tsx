import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PinCreationScreen } from "./PinCreationScreen";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A child's PIN must go to the child it belongs to.
 *
 * `PinCreationScreen` chose between two calls by asking `getToken()`. That is
 * not the question. Both calls post to `/api/v1/auth/pin` and the server tells
 * them apart by the BODY: `completeAccount` (reached through the `storePin`
 * callback) carries an `onboardingToken` and creates the account it names;
 * `setPin` carries only `{pin}` and sets it on whoever's Bearer token is on the
 * device.
 *
 * So any session at all diverted a child creating their FIRST account into
 * "change the signed-in user's PIN". Two ways that lands, both real:
 *
 *  - Signed in as a teacher or admin, the server refuses - a live 403,
 *    `{"detail":"PIN is for student accounts"}` - and the child is told their
 *    PIN did not save. True, but not why.
 *  - Signed in as ANOTHER CHILD on a shared classroom tablet, it SUCCEEDS, and
 *    the new child's PIN lands on the previous child's account.
 *
 * The second is the one that matters. It locks a child out behind a PIN they
 * have never seen, creates no account for the new child, and says nothing to
 * anybody. These tests assert on WHICH call was made, because both paths render
 * the identical screen.
 */

/*
 * The first test wears the cold import of the screen and the keyboard. On a
 * contended worker that passed 5s, and the timeout then cascaded into every
 * later test because cleanup never ran.
 */
vi.setConfig({ testTimeout: 30_000 });

const { setPin, storePin } = vi.hoisted(() => ({
  setPin: vi.fn(),
  storePin: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ authApi: { setPin } }));

/** Tap four digits, then settle past the 1200ms commit beat. */
async function enterPinTwice() {
  for (let round = 0; round < 2; round++) {
    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }
  }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
}

const signedInAs = (role: string, userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role,
  });

beforeEach(() => {
  vi.useFakeTimers();
  setPin.mockReset();
  setPin.mockResolvedValue({});
  storePin.mockReset();
  storePin.mockResolvedValue(undefined);
  clearSession();
});

afterEach(() => {
  vi.useRealTimers();
  clearSession();
});

describe("PinCreationScreen — onboarding, with someone else signed in", () => {
  it("creates the child's own account when a teacher is signed in", async () => {
    // The deployed 403. The flow sent the admin's Bearer token and no
    // onboardingToken, so the server saw a non-student setting a PIN.
    signedInAs("teacher", "teacher-1");
    render(<PinCreationScreen storePin={storePin} onComplete={() => {}} />);

    await enterPinTwice();

    expect(storePin).toHaveBeenCalledWith("1234");
    expect(setPin).not.toHaveBeenCalled();
  });

  it("does the same for an admin", async () => {
    signedInAs("senco_admin", "admin-1");
    render(<PinCreationScreen storePin={storePin} onComplete={() => {}} />);

    await enterPinTwice();

    expect(setPin).not.toHaveBeenCalled();
  });

  it("does not write the new child's PIN onto the previous child's account", async () => {
    // The shared classroom tablet, and the one that fails SILENTLY. Child B is
    // still signed in; child A is creating their first account.
    signedInAs("student", "child-b");
    render(<PinCreationScreen storePin={storePin} onComplete={() => {}} />);

    await enterPinTwice();

    expect(setPin).not.toHaveBeenCalled();
    expect(storePin).toHaveBeenCalledWith("1234");
  });

  it("creates the account when nobody is signed in", async () => {
    render(<PinCreationScreen storePin={storePin} onComplete={() => {}} />);

    await enterPinTwice();

    expect(storePin).toHaveBeenCalledWith("1234");
  });
});

describe("PinCreationScreen — a student changing their own PIN", () => {
  it("sets it on their account", async () => {
    // ChangePinScreen passes no `storePin`; here the signed-in student IS the
    // subject, and this is the only case `setPin` is correct for.
    signedInAs("student", "child-a");
    render(<PinCreationScreen onComplete={() => {}} />);

    await enterPinTwice();

    expect(setPin).toHaveBeenCalledWith("1234");
  });

  it("stores nothing when the signed-in user is not a student", async () => {
    // Behind the student route guard, so defensive - but silently posting a
    // child's PIN to a teacher's account is the failure being prevented.
    signedInAs("teacher", "teacher-1");
    render(<PinCreationScreen onComplete={() => {}} />);

    await enterPinTwice();

    expect(setPin).not.toHaveBeenCalled();
  });
});

describe("PinCreationScreen — the number pad (ruling D)", () => {
  /*
   * Design ruled the PIN frame's pad DOCKED and focus-driven: "a focus-driven
   * pad is transient, and a docked tray reads as transient". It was a
   * permanent block pad, which is 28c's exception and nobody else's.
   */
  const pinField = () =>
    screen.getByLabelText("Your PIN") as HTMLInputElement;

  it("is up from the start, because the boxes are focused on arrival", () => {
    render(<PinCreationScreen onComplete={() => {}} />);

    expect(document.activeElement).toBe(pinField());
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
  });

  it("goes away when focus leaves the boxes, and comes back on a tap", async () => {
    render(
      <>
        <PinCreationScreen onComplete={() => {}} />
        <button type="button">elsewhere</button>
      </>,
    );

    act(() => screen.getByRole("button", { name: "elsewhere" }).focus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole("button", { name: "5" })).toBeNull();

    act(() => pinField().focus());
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
  });

  it("does not take the digits twice when a keyboard types into the focused field", async () => {
    // The field is a focus target only; the window listener is what reads
    // keys. A field that also took them would double every digit.
    render(<PinCreationScreen storePin={storePin} onComplete={() => {}} />);

    for (const d of "12341234") {
      fireEvent.keyDown(pinField(), { key: d });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(storePin).toHaveBeenCalledWith("1234");
  });
});

/**
 * D115, "the returning-child opening line on PIN creation": 15's "New PIN
 * after a clear" (`Nevo PIN Frame`, `reset`). "Same screen and components;
 * only the opening line changes, so it reads as choosing a new PIN rather
 * than starting again." The routing to it waits on backend (B67).
 */
describe("PinCreationScreen - a new PIN after a clear (D115)", () => {
  it("opens on Choose a new PIN, with everything else as on a first PIN", () => {
    render(<PinCreationScreen reset storePin={storePin} onComplete={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Choose a new PIN" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create a PIN" })).toBeNull();
    expect(
      screen.getByText("You'll use this to log in next time"),
    ).toBeInTheDocument();
  });

  it("says Create a PIN on a first PIN", () => {
    render(<PinCreationScreen storePin={storePin} onComplete={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Create a PIN" }),
    ).toBeInTheDocument();
  });
});
