import { describe, expect, it } from "vitest";
import type { SsoStatus } from "@/lib/api/sso";
import type { AdminStudentRow, StudentConsent } from "@/lib/api/students";
import { consentRequestsSent, signInChosen } from "./overviewGettingStarted";

/**
 * The last two getting-started rows that could never tick.
 *
 * Three of five were signal-backed; "Choose how everyone signs in" and "Send
 * parent consent requests" rendered an OPEN circle for every school for ever —
 * including a school that had connected Microsoft and sent every request it
 * owed. An open circle here reads as "you have not done this", so the screen
 * was telling finished schools they were unfinished.
 *
 * Both predicates follow `teachersOnRoster`'s discipline, and that discipline
 * is the thing under test: a tick is a POSITIVE CLAIM about this school, so
 * unknown must never tick, and nothing may be inferred from an absence.
 */

const sso = (status: SsoStatus["status"]): SsoStatus =>
  ({ provider: "microsoft", status }) as SsoStatus;

const consent = (status: StudentConsent["status"]): StudentConsent => ({
  status,
  actorId: null,
  actorName: null,
  timestamp: null,
  channel: null,
});

const student = (status: StudentConsent["status"]): AdminStudentRow =>
  ({
    id: "s",
    name: "A child",
    loginIdentifier: null,
    status: "active",
    ageBand: null,
    consent: consent(status),
  }) as AdminStudentRow;

describe("signInChosen", () => {
  it("ticks on a connected provider", () => {
    expect(signInChosen(sso("connected"))).toBe(true);
  });

  it("ticks when the connection needs attention, because the school still chose", () => {
    // The row asks how everyone signs in, not whether the connection is
    // healthy. A row that un-ticked itself when a certificate wobbled would
    // tell a school it had not done something it did; D15 reports the health.
    expect(signInChosen(sso("needs_attention"))).toBe(true);
  });

  it("stays open on a disconnected provider", () => {
    expect(signInChosen(sso("disconnected"))).toBe(false);
  });

  it("stays open when the read failed, rather than claiming anything", () => {
    expect(signInChosen(null)).toBe(false);
    expect(signInChosen(undefined)).toBe(false);
  });

  it("never claims a school has NOT chosen — only that we cannot see it", () => {
    // The sub-copy is an OR: "connect a provider, or share your school code".
    // Nothing records that a code was shared, so `false` here is ignorance,
    // and this test exists so the next edit does not turn it into a negative
    // claim rendered as "not done".
    expect(signInChosen(sso("disconnected"))).toBe(false);
  });
});

describe("consentRequestsSent", () => {
  it("ticks when every student on the roster has been asked", () => {
    expect(
      consentRequestsSent([student("confirmed"), student("pending")]),
    ).toBe(true);
  });

  it("counts withdrawn as sent, because the row asks whether it went out", () => {
    // The row asks whether the request went out. A parent who withdrew was
    // unambiguously asked.
    expect(consentRequestsSent([student("withdrawn")])).toBe(true);
  });

  it("stays open while any student is still not_sent", () => {
    expect(
      consentRequestsSent([student("confirmed"), student("not_sent")]),
    ).toBe(false);
  });

  it("DOES NOT TICK ON AN EMPTY ROSTER", () => {
    // `[].every(...)` is true, so an `.every()` at the call site would
    // congratulate a school that has enrolled nobody for having sent every
    // request it owes — a vacuous truth presented as an achievement, on the
    // screen a brand-new school sees first. This is the whole reason the
    // predicate is a function.
    expect(consentRequestsSent([])).toBe(false);
  });

  it("stays open when the roster read failed", () => {
    expect(consentRequestsSent(null)).toBe(false);
    expect(consentRequestsSent(undefined)).toBe(false);
  });

  it("is unmoved by a single unasked child in a large roster", () => {
    const roster = [
      ...Array.from({ length: 40 }, () => student("confirmed")),
      student("not_sent"),
    ];
    expect(consentRequestsSent(roster)).toBe(false);
  });
});
