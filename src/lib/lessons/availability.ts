import type { Assignment } from "@/lib/api/assignments";
import { deviceClockSkewMs } from "@/lib/api/serverClock";

/**
 * Whether an assignment is a child's to do RIGHT NOW.
 *
 * Two separate things had never been checked anywhere in the student app, and
 * each one shows a child work that is not theirs:
 *
 * 1. CANCELLED ASSIGNMENTS WERE NEVER FILTERED. A teacher calls a lesson off
 *    and the child still sees it on Home, still opens it, still works through
 *    it, and their progress is still written against it.
 *
 * 1b. COMPLETED IS REAL, and finished work is not "to do". This used to say
 *    `AssignmentStatus` had no "completed" member, so a filter against it could
 *    never fire. The deployed enum has carried `completed` since 25 Sep - the
 *    progress route writes it when a child finishes - and treating it as open
 *    kept finished lessons on Home's list and counted in its "N ready". A
 *    completed assignment is still the child's lesson, and can still be opened
 *    and read again, so it is `unavailableReason`'s null; it is just not open
 *    work. The Lessons tab lists it under Completed.
 *
 * 2. `availableFrom` WAS NEVER READ. It is the moment an assignment OPENS - a
 *    different field from `dueAt`, and required on the read since 31 Aug. A
 *    lesson a teacher schedules for Friday appeared on the child's Home the
 *    instant it was scheduled.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it says nothing about a lesson that was
 * never assigned. A child can still open any lesson id their school's library
 * holds, exactly as before. Refusing those would be a much larger product
 * decision about whether the library is browsable, and it is not this fix's to
 * make. This acts only on what the assignment row says - called off, not open
 * yet, or already finished.
 */
export function isOpenToStudent(
  assignment: Pick<Assignment, "status" | "availableFrom">,
  now: number = correctedNow(),
): boolean {
  if (assignment.status === "cancelled") return false;
  if (assignment.status === "completed") return false;
  return !opensLater(assignment.availableFrom, now);
}

/** Why an assignment is not open, for a screen that has to say something. */
export type Unavailable = "cancelled" | "not_yet";

/**
 * The reason, or null when the child may open it - which includes a completed
 * one: finished is not the same as taken away.
 *
 * A screen cannot say the same thing about both: "your teacher took this off
 * your list" and "this opens on Friday" are different facts and a child can act
 * on the second.
 */
export function unavailableReason(
  assignment: Pick<Assignment, "status" | "availableFrom">,
  now: number = correctedNow(),
): Unavailable | null {
  if (assignment.status === "cancelled") return "cancelled";
  return opensLater(assignment.availableFrom, now) ? "not_yet" : null;
}

/**
 * ABSENT IS NOT "LATER", and an unreadable date is not either.
 *
 * `availableFrom` is nullable and null means there is no opening time - the
 * assignment is open now. A malformed date is our problem or the server's, and
 * the child should not lose a lesson over it, so it is treated the same way the
 * session store treats an expiry it cannot parse: keep, do not discard.
 */
function opensLater(availableFrom: string | null, now: number): boolean {
  if (!availableFrom) return false;
  const opens = Date.parse(availableFrom);
  if (Number.isNaN(opens)) return false;
  return opens > now;
}

/**
 * Now, as the SERVER would tell it.
 *
 * `availableFrom` is a server timestamp and `Date.now()` is the device's, so
 * comparing them directly is the same mistake that once locked children out of
 * their sessions entirely: a school tablet that came back from a flat battery
 * on a default date believed every session was already expired. That was fixed
 * by measuring against the skew the api client learns from the `Date` header on
 * every response, and this is the same comparison, so it uses the same
 * correction.
 *
 * The failure it prevents is concrete. A tablet whose clock is a day fast would
 * open Friday's lesson on Thursday; one a day slow would hide a lesson that
 * opened this morning, and the child would have no way to understand why.
 * Before the app has spoken to the server the skew is 0, which is exactly the
 * behaviour with no correction at all.
 */
function correctedNow(): number {
  return Date.now() - deviceClockSkewMs();
}
