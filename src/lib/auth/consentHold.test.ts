import { describe, expect, it } from "vitest";
import { WITHDRAWN_ROUTE as ENTRY_WITHDRAWN_ROUTE } from "./entryGate";
import {
  isHoldDestination,
  UNCHECKED_ROUTE,
  WAITING_ROUTE,
  WITHDRAWN_ROUTE,
  withdrawnDoor,
} from "./consentHold";

/**
 * B7: a withdrawn child signs in, and starting a lesson, recording progress,
 * taking one offline or asking Nevo answers 403 `consent_withdrawn`. Lydia
 * ruled the child sees a suspended screen, so that refusal goes to 00e (D117)
 * rather than to each caller's generic failure - and no longer to 00d, which
 * stood in for it saying "It will be soon". The half that can be wrong is who
 * goes, on what, and from where.
 */
describe("withdrawnDoor", () => {
  const LESSON = "/student/lessons/les-1";

  it("sends a withdrawn child to 00e, not 00d", () => {
    expect(withdrawnDoor("student", 403, "consent_withdrawn", LESSON)).toBe(
      "/student/unavailable",
    );
    expect(WITHDRAWN_ROUTE).not.toBe(WAITING_ROUTE);
  });

  it("is the same screen the sign-in doors hold a withdrawn child at", () => {
    // Design, 23 Sep: a child in the same state meets the same screen
    // whichever door they use.
    expect(WITHDRAWN_ROUTE).toBe(ENTRY_WITHDRAWN_ROUTE);
  });

  it("moves a child on 00d to 00e when a refusal there says withdrawn", () => {
    expect(
      withdrawnDoor("student", 403, "consent_withdrawn", "/student/waiting"),
    ).toBe("/student/unavailable");
  });

  it("does not reload 00e from 00e", () => {
    // A held position flushing, or the signal outbox, can be refused while
    // the child is already there.
    for (const here of ["/student/unavailable", "/student/unavailable/"]) {
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

/**
 * The holds a sign-in door sends a child to without the "Welcome back" beat,
 * and the shell draws without its chrome.
 */
describe("isHoldDestination", () => {
  it("names 00d, 00e and the unchecked hold, with or without a query", () => {
    for (const hold of [
      WAITING_ROUTE,
      WITHDRAWN_ROUTE,
      UNCHECKED_ROUTE,
      `${UNCHECKED_ROUTE}?next=%2Fstudent%2Fdashboard`,
      "/student/unavailable/",
    ]) {
      expect(isHoldDestination(hold), hold).toBe(true);
    }
  });

  it("is not somewhere a child goes to learn", () => {
    for (const place of [
      "/student/dashboard",
      "/student/lessons/frac-1",
      "/student/waiting-room",
      "/teacher/dashboard",
    ]) {
      expect(isHoldDestination(place), place).toBe(false);
    }
  });
});
