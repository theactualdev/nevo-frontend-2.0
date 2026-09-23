import { api } from "./client";

/**
 * `GET|POST /api/v1/student-entry/*` - the entry link, re-sequenced.
 *
 * **PUBLIC, and that is the point.** Both paths are addressed by a token and
 * neither needs a session, because this is the flow in which a session comes to
 * exist. Same shape as `invitesApi.lookupJoin`.
 *
 * WHAT CHANGED, AND WHY IT IS NOT A RE-SKIN. The old sequence collected a
 * child's name, school and class, sat them through the whole baseline, and only
 * then redeemed the link. This one resolves the child FROM THE TOKEN - the
 * school already recorded them - so `firstName`, `className` and `age` arrive
 * before the first screen rather than being asked for. Frame 31 (22 Sep):
 * *"Consent is checked at entry, before the sequence - never here."*
 *
 * **THIS MODULE IS TRANSPORT AND NOTHING ELSE.** It declares what the wire
 * carries so the fields stop being erased. It decides nothing about who may
 * proceed - see `consents.ts`, where the same restraint is written down at
 * greater length, and the 23 Sep note about the ruling that has not landed.
 */

/**
 * Where the school's consent for this child stands, at entry.
 *
 * TWO VALUES, NOT THE FOUR `ConsentStatus` CARRIES. This is not the same field
 * as `ConsentRecord.status` and must not be narrowed to it: `not_sent` and
 * `pending` are a distinction the school cares about and the child cannot see,
 * and the wire collapses them here deliberately. A child is waiting or they are
 * not.
 *
 * `withdrawn` is absent, and that absence is real rather than an omission: a
 * withdrawal concerns a child who already has an account, which is the state
 * this endpoint exists to precede. Withdrawal enforcement stays where it is,
 * on `processingWithdrawn`.
 */
export type EntryConsentState = "given" | "pending";

/** `GET /api/v1/student-entry/{token}`. */
export interface StudentEntryState {
  /** The school recorded it. Not asked for, and not editable here. */
  firstName: string;
  className: string | null;
  consentState: EntryConsentState;
  age: number | null;
  /**
   * Whether an account exists for this child yet.
   *
   * **NOT READ BY ANYTHING, PENDING AN ANSWER.** Declared so it is not erased.
   * The name admits two readings - "no account yet, so create a PIN" and "not
   * cleared to have one" - and they route a child to different screens. Asked
   * 23 Sep; until it is answered, nothing branches on it.
   */
  accountReady: boolean;
  /**
   * A disputed date of birth, which is NOT a missing consent.
   *
   * `AgeCheckResponse.blocksAccess` is the same fact from the other direction,
   * and `AgeCheckState` (`matched | mismatch | resolved | awaiting_parent`)
   * says why. The adults disagree with each other here, rather than one of them
   * not having answered - a different situation and, on current frames, no
   * screen. Declared, unread, raised to design 23 Sep.
   */
  ageCheckPending?: boolean;
}

/** 200 of `POST /api/v1/student-entry/{token}/pin`. */
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
   * PUBLIC. What an entry link resolves to.
   *
   * **A SINGLE RESOLVE, NEVER A POLL**, and that is a design instruction rather
   * than an efficiency: frame 00d says *"no progress, no countdown, no refresh,
   * no door held shut... when consent arrives, opening the link again goes
   * straight to the assessment."* The screen this feeds is the one that
   * replaced a gate which polled. Anything that re-checks on a timer re-creates
   * it.
   */
  resolve: (token: string) =>
    api.get<StudentEntryState>(
      `/api/v1/student-entry/${encodeURIComponent(token)}`,
    ),

  /**
   * PUBLIC. Set the PIN and become an account.
   *
   * **THE SERVER ACCEPTS 4-8 DIGITS HERE AND 6 EXACTLY AT THE UNLOCK DOOR.**
   * `PinChoice` is `minLength 4, maxLength 8, ^\d+$`; `PinLoginRequest.pin` is
   * still `^\d{6}$`. So a four-digit PIN set here would be refused on every
   * later sign-in with a 422, and `classifyLoginFailure` maps a non-401/403 to
   * "ours" - the child is told *"we couldn't check that just now"* and never
   * learns why. `STUDENT_PIN_LENGTH` therefore stays at 6 until the unlock door
   * is relaxed to match. Raised to backend 23 Sep.
   */
  setPin: (token: string, pin: string) =>
    api.post<StudentEntrySession>(
      `/api/v1/student-entry/${encodeURIComponent(token)}/pin`,
      { pin },
    ),
};
