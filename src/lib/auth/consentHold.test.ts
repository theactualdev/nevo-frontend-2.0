import { describe, expect, it } from "vitest";
import { WAITING_ROUTE as ENTRY_WAITING_ROUTE } from "./entryGate";
import { WAITING_ROUTE, withdrawnDoor } from "./consentHold";

/**
 * B7: a withdrawn child signs in, and starting a lesson, recording progress,
 * taking one offline or asking Nevo answers 403 `consent_withdrawn`. Lydia
 * ruled the child sees a suspended screen, so that refusal goes to the held
 * screen rather than to each caller's generic failure. The half that can be
 * wrong is who goes, on what, and from where.
 */
describe("withdrawnDoor", () => {
  const LESSON = "/student/lessons/les-1";

  it("sends a withdrawn child to the held screen", () => {
    expect(withdrawnDoor("student", 403, "consent_withdrawn", LESSON)).toBe(
      "/student/waiting",
    );
  });

  it("is the same screen every sign-in door holds a child at", () => {
    // Design, 23 Sep: a child in the same state meets the same screen
    // whichever door they use.
    expect(WAITING_ROUTE).toBe(ENTRY_WAITING_ROUTE);
  });

  it("does not reload the held screen from the held screen", () => {
    // A held position flushing, or the signal outbox, can be refused while
    // the child is already there.
    for (const here of ["/student/waiting", "/student/waiting/"]) {
      expect(
        withdrawnDoor("student", 403, "consent_withdrawn", here),
      ).toBeNull();
    }
  });

  it("leaves staff where they are", () => {
    for (const role of [
      "teacher",
      "senco_admin",
      "other_admin",
      null,
      undefined,
    ]) {
      expect(
        withdrawnDoor(role, 403, "consent_withdrawn", "/teacher"),
      ).toBeNull();
    }
  });

  it("leaves every other refusal to the caller that met it", () => {
    // An ordinary 403 is a scope, not a withdrawal; a 401 has its own doors.
    expect(withdrawnDoor("student", 403, "forbidden", LESSON)).toBeNull();
    expect(withdrawnDoor("student", 403, null, LESSON)).toBeNull();
    expect(
      withdrawnDoor("student", 401, "consent_withdrawn", LESSON),
    ).toBeNull();
    expect(
      withdrawnDoor("student", 400, "consent_withdrawn", LESSON),
    ).toBeNull();
  });
});
