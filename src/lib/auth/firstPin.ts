import { ApiError, apiErrorCode } from "@/lib/api/client";
import {
  studentEntryApi,
  type StudentEntrySession,
} from "@/lib/api/studentEntry";
import { setSession } from "./session";

/**
 * The pair 05 Entry matched a child on: the school's code and their own
 * Student ID / Admission Number. Until the first PIN is stored it is all this
 * flow knows about who the child is, and it is what that PIN is stored
 * against.
 */
export interface EntryIdentity {
  schoolCode: string;
  admissionNumber: string;
}

/**
 * Bind the PIN a child chose on 15 PIN Creation to the child 05 Entry found,
 * and start their session.
 *
 * `POST /api/v1/student-entry/pin`, which backend built for SCRUM-216 and
 * confirmed as this flow's route (B64). The lookup returns no session and no
 * token, so the pair it matched on goes again with the PIN, and the answer is
 * the child's first session.
 *
 * WHY NOT `POST /auth/pin`. That sets a PIN on whoever's Bearer token is on
 * the device, and this child has none. On a shared tablet the token that IS
 * there may be the previous child's, which is exactly the account this must
 * never write to. This route is keyed on the pair and opens only while the
 * child has no PIN, so it cannot overwrite anybody's.
 *
 * THE SAME ROUTE STORES THE PIN AFTER A TEACHER'S CLEAR (B67): a cleared
 * child has no session either, and the pair is all that names them.
 *
 * ## A refusal is a refusal
 *
 * The route is gated on consent and the age check, and it refuses a child who
 * already has a PIN. Any rejection reaches the caller as it came; what 15
 * does with it is `entryPinRefusal`'s. Nothing here turns a refusal into a
 * session, and nothing retries on its own.
 *
 * Neither half of the pair, nor the PIN, goes into a URL or an error message:
 * together they are a credential. `ApiError` carries a status and the
 * server's body, never the request.
 *
 * ## The baseline
 *
 * The baseline a child sits between 05 and 15 is parked on the device under
 * the run that captured it (`pendingBaseline`), because the baseline routes
 * need a session. The session this returns is that session, and the sequence
 * then delivers that run's vector and no other.
 */
export function bindFirstPin(
  entry: EntryIdentity,
  pin: string,
): Promise<StudentEntrySession> {
  return studentEntryApi.setPin({
    schoolCode: entry.schoolCode,
    admissionNumber: entry.admissionNumber,
    pin,
  });
}

/**
 * Sign the child in on the session the PIN route started - the first PIN's
 * and the new PIN's alike, so the two doors cannot store it differently.
 */
export function startEntrySession(res: StudentEntrySession): void {
  setSession({
    token: res.session.accessToken,
    expiresAt: res.session.expiresAt,
    userId: res.session.userId,
    role: res.session.role,
  });
}

/**
 * What `POST /student-entry/pin` refused, as something 15 can act on (B68).
 *
 * Since 8 Oct the spec names each refusal, and each tells the child something
 * different. "That didn't save - that's on us" was true of none of them:
 *
 * - `throttled`: 429 (`too_many_attempts`). D68's wait line, in place of
 *   "That's on us - try again", which tells a child to do the one thing that
 *   extends a lockout.
 * - `has-pin`: 409 (`pin_not_cleared`, `pin_already_set`). The child has a
 *   PIN, so the honest door is sign-in, with what they typed carried over.
 * - `not-found`: 404 (`entry_not_found`). The pair no longer names anyone,
 *   which is 05's miss.
 * - `consent`, `age-check`: 403 (`consent_pending`, `age_check_pending`). The
 *   holds 05 would have drawn for the same child.
 * - `failed`: everything else - the network, a 5xx, a 422 - and 15's own
 *   not-saved state, with the PIN kept.
 *
 * BY CODE, EXCEPT THE 429. A 404 from a deploy that lost the route, or a 409
 * with no code, says nothing about this child, and reading it as "no such
 * child" or "already has a PIN" would tell them something false about
 * themselves - so those fall to `failed`. HTTP 429 means "too many requests"
 * whoever sends it, so waiting is true of every one.
 */
export type EntryPinRefusal =
  | "throttled"
  | "has-pin"
  | "not-found"
  | "consent"
  | "age-check"
  | "failed";

/** The refusals 15 does not show itself: each takes the child to another screen. */
export type EntryPinElsewhere = Exclude<EntryPinRefusal, "throttled" | "failed">;

export function entryPinRefusal(cause: unknown): EntryPinRefusal {
  if (!(cause instanceof ApiError)) return "failed";
  if (cause.status === 429) return "throttled";
  const code = apiErrorCode(cause.detail);
  switch (cause.status) {
    case 409:
      return code === "pin_not_cleared" || code === "pin_already_set"
        ? "has-pin"
        : "failed";
    case 404:
      return code === "entry_not_found" ? "not-found" : "failed";
    case 403:
      return code === "consent_pending"
        ? "consent"
        : code === "age_check_pending"
          ? "age-check"
          : "failed";
    default:
      return "failed";
  }
}
