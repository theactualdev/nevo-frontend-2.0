import type { StudentEntrySession } from "@/lib/api/studentEntry";

/**
 * The pair 05 Entry matched a child on: the school's code and their own
 * Student ID / Admission Number. It is all this flow knows about who the child
 * is until a first-PIN route gives it more.
 */
export interface EntryIdentity {
  schoolCode: string;
  admissionNumber: string;
}

/**
 * Why a first PIN cannot be saved yet. Typed, so a caller or a test can tell
 * "backend has not shipped this" apart from a write that was tried and failed.
 */
export class AwaitingBackendB64Error extends Error {
  readonly code = "awaiting_backend_b64";

  constructor() {
    super(
      "First-PIN binding is waiting on backend B64: the entry lookup returns no session and no token, so nothing can attach a PIN to the child it found.",
    );
    this.name = "AwaitingBackendB64Error";
  }
}

/**
 * Bind the PIN a child chose on 15 PIN Creation to the child 05 Entry found.
 *
 * **IT THROWS, ON PURPOSE, UNTIL BACKEND ANSWERS B64.** This is the one place
 * the gap lives, so closing it is a change to this body and nothing else.
 *
 * ## The gap
 *
 * `POST /student-entry/lookup` says which child has arrived and returns no
 * session and no token. Every route that can set a PIN needs one of those:
 *
 * - `POST /student-entry/{token}/pin` sets a first PIN and starts a session,
 *   but its token came from the entry LINK, which was retired (B2) because it
 *   never resolved for anyone. There is no token to put in the path.
 * - `POST /auth/pin` sets a PIN for whoever's Bearer token is on the device, and
 *   this child has none. On a shared tablet the token that IS there may be the
 *   previous child's, which is exactly the account this must never write to.
 *
 * So nothing can attach this PIN to this child, and the honest answer is a
 * failure: 15 shows its not-saved line and keeps both rows as typed, rather
 * than celebrating a PIN the next sign-in would refuse.
 *
 * ## What would close it (asked as B64)
 *
 * Either is enough, and backend chooses:
 *
 * 1. **A lookup-scoped PIN route** that takes `{schoolCode, admissionNumber,
 *    pin}`, refuses a child whose consent is not given, and answers like
 *    `POST /student-entry/{token}/pin` does - a `StudentEntrySession`.
 * 2. **A short-lived onboarding token on the lookup's 200**, spent here at the
 *    PIN step - either in `POST /student-entry/{token}/pin`, or as the
 *    `onboardingToken` that `PinUpdateRequest` on `POST /auth/pin` still
 *    carries. It would have to outlive the baseline, which takes a child
 *    several minutes; the old class-code token lived twenty.
 *
 * ## The baseline in the meantime
 *
 * The baseline a child sits between 05 and 15 is parked on the device, under
 * the run that captured it, exactly as it is today (`pendingBaseline`). It
 * goes nowhere without a session and nothing here pretends otherwise: once
 * this returns a session, the sequence delivers that run's vector and no
 * other.
 */
export async function bindFirstPin(
  entry: EntryIdentity,
  pin: string,
): Promise<StudentEntrySession> {
  // Neither is sent anywhere, and neither goes into the error: an admission
  // number and a PIN are a credential.
  void entry;
  void pin;
  throw new AwaitingBackendB64Error();
}
