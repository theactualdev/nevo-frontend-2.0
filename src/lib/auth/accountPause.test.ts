import { describe, expect, it, vi } from "vitest";
import { pausesInPlace } from "./accountPause";

/**
 * 28b draws a pause that lands mid-lesson OVER the lesson. The half of that
 * which can be wrong is who gets it: only a child, only for a pause, and only
 * where something is mounted to draw the card - otherwise the old door, which
 * at least says something.
 */
describe("pausesInPlace", () => {
  it("shows a child's pause where they are", () => {
    expect(pausesInPlace("student", "account_paused", 1)).toBe(true);
  });

  it("does not, with nothing mounted to draw the card", () => {
    // An event nobody hears would leave the child looking at a lesson that
    // silently stopped saving.
    expect(pausesInPlace("student", "account_paused", 0)).toBe(false);
  });

  it("leaves staff on their own door", () => {
    for (const role of ["teacher", "senco_admin", "other_admin", undefined]) {
      expect(pausesInPlace(role, "account_paused", 1)).toBe(false);
    }
  });

  it("shows a child's closed account where they are too (B58)", () => {
    // Its own code since 5 Oct. Leaving it out would send a removed child to
    // the session-end door, which says to sign in again - the one thing that
    // cannot work.
    expect(pausesInPlace("student", "account_closed", 1)).toBe(true);
    expect(pausesInPlace("teacher", "account_closed", 1)).toBe(false);
    expect(pausesInPlace("student", "account_closed", 0)).toBe(false);
  });

  it("leaves every other ending to the session-end screens", () => {
    // An expired, revoked or replaced session really has ended; there is
    // nothing to stay on the page for.
    for (const code of [
      "session_expired",
      "session_revoked",
      "session_replaced",
      "invalid_session",
      null,
    ]) {
      expect(pausesInPlace("student", code, 1)).toBe(false);
    }
  });
});

/**
 * D53: a removed child reads that their account is closed, not that it is on
 * pause. The flag is sticky per page, so each test takes a fresh module.
 */
describe("which account state landed", () => {
  const fresh = async () => {
    vi.resetModules();
    return import("./accountPause");
  };

  it("is closed for account_closed, never paused", async () => {
    const pause = await fresh();
    pause.announceAccountPause("account_closed");

    expect(pause.accountHold()).toBe("closed");
    expect(pause.isAccountPaused()).toBe(true);
  });

  it("is paused for account_paused, and for a caller that names no code", async () => {
    const a = await fresh();
    a.announceAccountPause("account_paused");
    expect(a.accountHold()).toBe("paused");

    const b = await fresh();
    b.announceAccountPause();
    expect(b.accountHold()).toBe("paused");
  });

  it("is nothing until one lands", async () => {
    const pause = await fresh();

    expect(pause.accountHold()).toBeNull();
    expect(pause.isAccountPaused()).toBe(false);
  });
});
