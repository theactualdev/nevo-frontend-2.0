import { describe, expect, it } from "vitest";
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
