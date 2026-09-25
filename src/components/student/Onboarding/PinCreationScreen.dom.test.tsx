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
