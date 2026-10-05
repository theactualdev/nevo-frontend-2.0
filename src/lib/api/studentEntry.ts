import { api } from "./client";

/**
 * `POST /api/v1/student-entry/lookup` - 05 Entry's one screen (SCRUM-208).
 *
 * **PUBLIC, and that is the point.** The child has no account yet, and the
 * school's code plus their own Student ID / Admission Number is what says who
 * they are. The school code comes first because an admission number is only
 * unique within one school.
 *
 * WHAT CHANGED, AND WHY IT IS NOT A RE-SKIN. The old sequence asked a child for
 * their name, age, school and class, sat them through the whole baseline, and
 * only then found out who they were. The roster already knew all of it, so the
 * lookup states `firstName`, `className` and `age` rather than asking - and says
 * where consent stands before the first activity.
 *
 * IT REPLACED THE ENTRY LINK. `GET /student-entry/{token}` never resolved for
 * anyone - nothing ever wrote a grant naming a child, so every token 404'd -
 * and backend retired it (B2). Its client went with it.
 *
 * **THIS MODULE IS TRANSPORT AND NOTHING ELSE.** It declares what the wire
 * carries so the fields stop being erased. Who may proceed is decided in one
 * place, `entryRoute` in `lib/auth/entryGate`.
 */

/**
 * Where the school's consent for this child stands, at entry.
 *
 * THREE VALUES, NOT THE FOUR `ConsentStatus` CARRIES, and it must not be
 * narrowed to it: `not_sent` and `pending` are a distinction the school cares
 * about and the child cannot see, and the wire collapses them deliberately.
 * `withdrawn` arrived with the lookup; the entry link had only two.
 */
export type EntryConsentState = "given" | "pending" | "withdrawn";

/** What a child types on 05: the school's code, then their own ID. */
export interface StudentEntryLookup {
  /** Four characters since SCRUM-201; the contract still bounds it 2-50. */
  schoolCode: string;
  /** Matched against `admission_number` on that school's roster. 1-60. */
  admissionNumber: string;
}

/** 200 of `POST /api/v1/student-entry/lookup`. */
export interface StudentEntryState {
  /** The school recorded it. Not asked for, and not editable here. */
  firstName: string;
  className: string | null;
  consentState: EntryConsentState;
  /** Computed server-side from the roster's date of birth. Null is possible. */
  age: number | null;
  /**
   * Read as "this child already has an account and a PIN", which sends them to
   * sign back in rather than through a first run that would make a second
   * account. The spec gives the field no description, so that reading is
   * ASKED, not known - see `entryRoute`.
   */
  accountReady: boolean;
  /**
   * A disputed date of birth, which is NOT a missing consent.
   *
   * The spec gives it no description. `AgeCheckResponse.blocksAccess` is the
   * same fact from the other direction, and `AgeCheckState` (`matched |
   * mismatch | resolved | awaiting_parent`) says why. **RULED 23 SEP: it holds
   * the child at the SAME screen as a missing consent, with the same words,
   * and the child is told neither reason** (`docs/RULINGS_23_SEP.md` §2c).
   * Optional because the contract gives it a default rather than requiring it.
   */
  ageCheckPending?: boolean;
}

/**
 * What a first-PIN route answers with, once there is one this flow can reach.
 *
 * The shape of `POST /api/v1/student-entry/{token}/pin`'s 200, kept because
 * whichever way backend closes B64 is expected to hand this back - see
 * `bindFirstPin`. The PIN length that route also returns is deliberately not
 * declared: nothing may build against it until SCRUM-179 settles the
 * six-digit case.
 */
export interface StudentEntrySession {
  userId: string;
  /** The only identifier the next sign-in will recognise. Null is possible. */
  loginIdentifier: string | null;
  /** Identical to `SessionResponse`, and required here rather than optional. */
  session: {
    accessToken: string;
    tokenType: string;
    expiresAt: string;
    userId: string;
    role: string;
  };
}

export const studentEntryApi = {
  /**
   * PUBLIC. Which child has arrived, from the school's code and their own ID.
   *
   * ONE CALL PER PRESS OF CONTINUE, never a poll. Frame 00d replaced a gate
   * that polled, and a held child is told to come back rather than kept at a
   * spinner for a decision an adult makes on another day.
   *
   * The spec declares only the 200 and a 422. What a pair that names nobody
   * answers with is not written down - see the entry step, which reads any
   * other 4xx as the server's answer about the pair.
   */
  lookup: (payload: StudentEntryLookup) =>
    api.post<StudentEntryState>("/api/v1/student-entry/lookup", payload),
};
