import {
  studentEntryApi,
  type StudentEntrySession,
} from "@/lib/api/studentEntry";

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
 * ## A refusal is a refusal
 *
 * The route is gated on consent and the age check, and it refuses a child who
 * already has a PIN. The spec declares only the 200 and a 422, so none of
 * those refusals has a status or a code this client can rely on, and none
 * needs one: any rejection reaches the caller as it came, and 15 shows its
 * not-saved state with both rows kept as typed. Nothing here turns a refusal
 * into a session, and nothing retries on its own.
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
