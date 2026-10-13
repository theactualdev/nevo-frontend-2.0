import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOpenToStudent, unavailableReason } from "./availability";
import { noteServerClock, resetServerClock } from "@/lib/api/serverClock";

/**
 * A teacher called a lesson off and the child did it anyway.
 *
 * Nothing in the student app had ever read either of the two fields that say
 * whether an assignment is a child's to do:
 *
 * 1. `status`. A cancelled row was never filtered at all. `Assignment` types
 *    the field as a plain `string`, so typecheck never objected and will not
 *    object if it comes back. These tests are the only guard.
 * 2. `availableFrom`. The moment an assignment OPENS, required on the read
 *    since 31 Aug, and read by nobody — so a lesson scheduled for Friday was on
 *    the child's Home the instant it was scheduled.
 *
 * `.dom.test.ts` because this lives under `src/lib/**`, where the node project
 * claims the file unless the suffix opts it into jsdom — and the clock cases
 * below drive `noteServerClock`, which reads a `Response`.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const assignment = (
  over: Partial<{ status: string; availableFrom: string | null }> = {},
) => ({
  status: "assigned",
  availableFrom: null,
  ...over,
});

/** Let the app see one server response, as the api client does for real. */
const serverSays = (whenMs: number) =>
  noteServerClock({
    headers: { get: () => new Date(whenMs).toUTCString() },
  } as unknown as Response);

beforeEach(() => {
  vi.useFakeTimers();
  resetServerClock();
});

afterEach(() => {
  vi.useRealTimers();
  resetServerClock();
});

describe("an assignment a teacher called off", () => {
  it("is not open to the child", () => {
    // THE DEFECT. Everything downstream of this is a consequence.
    expect(isOpenToStudent(assignment({ status: "cancelled" }))).toBe(false);
  });

  it("says which of the two reasons it is", () => {
    // A screen cannot say the same thing about a cancelled lesson and one that
    // simply has not opened yet.
    expect(unavailableReason(assignment({ status: "cancelled" }))).toBe(
      "cancelled",
    );
  });

  it("does not treat an ordinary assignment as cancelled", () => {
    // Without this, a filter that dropped everything would pass the test above.
    expect(isOpenToStudent(assignment())).toBe(true);
    expect(unavailableReason(assignment())).toBeNull();
  });

  it("does not treat an unknown status as a refusal", () => {
    // A value the enum does not list is nothing we were told to withhold.
    expect(isOpenToStudent(assignment({ status: "reassigned" }))).toBe(true);
  });
});

describe("an assignment the child has finished", () => {
  /*
   * `completed` IS in the deployed enum (since 25 Sep), and the progress route
   * writes it when a child finishes. This file's tests used to pin the
   * opposite - that a completed row stays open - on the belief the value could
   * not occur. So a finished lesson stayed on Home's Today list and counted in
   * its "N ready", and the onboarding hand-off could send a child into a
   * lesson they had already done.
   */
  it("is not open work", () => {
    expect(isOpenToStudent(assignment({ status: "completed" }))).toBe(false);
  });

  it("is still the child's to open again", () => {
    // Finished is not taken away. The player and the Lessons tab use this to
    // decide what a child may open, and a finished lesson stays readable.
    expect(unavailableReason(assignment({ status: "completed" }))).toBeNull();
  });
});

describe("an assignment that has not opened yet", () => {
  it("is not open before its time", () => {
    const opensAt = new Date(Date.now() + DAY).toISOString();

    expect(isOpenToStudent(assignment({ availableFrom: opensAt }))).toBe(false);
    expect(unavailableReason(assignment({ availableFrom: opensAt }))).toBe(
      "not_yet",
    );
  });

  it("is open once its time has come", () => {
    const opened = new Date(Date.now() - HOUR).toISOString();

    expect(isOpenToStudent(assignment({ availableFrom: opened }))).toBe(true);
  });

  it("treats no opening time as open now, not as later", () => {
    // `availableFrom` is nullable and null means there is no opening time.
    // Reading absence as "later" would hide every ordinary assignment.
    expect(isOpenToStudent(assignment({ availableFrom: null }))).toBe(true);
  });

  it("does not take a lesson away over a date it cannot read", () => {
    // A malformed date is our problem or the server's, not the child's.
    expect(isOpenToStudent(assignment({ availableFrom: "not-a-date" }))).toBe(
      true,
    );
  });
});

describe("the device clock does not decide when a lesson opens", () => {
  /*
   * `availableFrom` is a SERVER timestamp and `Date.now()` is the DEVICE's.
   * Comparing them directly is the mistake that once locked children out of
   * their sessions entirely — a school tablet back from a flat battery on a
   * default date believed every session was already expired. The api client
   * learns the skew from the `Date` header on every response, and this
   * comparison uses the same correction.
   */

  it("does not open Friday's lesson early on a tablet running fast", () => {
    // The tablet believes it is a day later than it is. Without the
    // correction, tomorrow's lesson is already open.
    const serverNow = Date.now();
    const opensAt = new Date(serverNow + DAY).toISOString();
    // The clock is ALREADY wrong when the response arrives - that is how the
    // skew is learned. Setting it afterwards would measure a skew of zero.
    vi.setSystemTime(serverNow + 2 * DAY);
    serverSays(serverNow);

    expect(isOpenToStudent(assignment({ availableFrom: opensAt }))).toBe(false);
  });

  it("does not hide a lesson that has opened, on a tablet running slow", () => {
    // The mirror failure, and the one a child cannot possibly understand: the
    // lesson their teacher set for this morning is simply not there.
    const serverNow = Date.now();
    const opened = new Date(serverNow - HOUR).toISOString();
    vi.setSystemTime(serverNow - 2 * DAY);
    serverSays(serverNow);

    expect(isOpenToStudent(assignment({ availableFrom: opened }))).toBe(true);
  });

  it("behaves as before when the app has not spoken to the server yet", () => {
    // Skew is 0 until a response has been seen, which is the behaviour that
    // shipped. Nothing about a first paint changes.
    const opensAt = new Date(Date.now() + DAY).toISOString();

    expect(isOpenToStudent(assignment({ availableFrom: opensAt }))).toBe(false);
  });
});
