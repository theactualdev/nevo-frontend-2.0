import { api } from "./client";

/**
 * Consent endpoints (NDPA; SCRUM-80 family) - wired to the live backend.
 *
 * **THE 7 SEP RULING APPEARS TO HAVE BEEN REVERSED, AND THIS FILE STILL
 * IMPLEMENTS IT. RAISED 23 SEP, NOT YET RESOLVED - read this before you rely
 * on anything below.**
 *
 * What this header used to assert, and what the code still does: *"NEVO IS NOT
 * THE CONSENT GATE. Design ruled on SCRUM-80 (7 Sep): the school warrants
 * consent through the DSA, so `granted: false` means the school has not
 * recorded it yet - an administrative task of theirs, not a blocker for the
 * child. The child proceeds normally."*
 *
 * Two things now say the opposite:
 *
 *  - `admin/D25 Consent (Written Route)`, PC-03, 20 Sep: **"A child stays out
 *    of lessons until they're cleared."**
 *  - `ConsentGateResponse` carries a REQUIRED `blocked: boolean` that this
 *    interface did not declare, so it has been arriving on every read and
 *    being discarded. A gate that reports whether a child is blocked is not
 *    the shape of a thing that never blocks anyone.
 *
 * `AgeCheckResponse.blocksAccess` is the same shape from the other direction.
 *
 * NOTHING HERE ENFORCES EITHER READING YET, deliberately. Turning consent into
 * a gate decides whether a child can open a lesson, it lands in the student
 * lane rather than this one, and it is the kind of change that must not be
 * inferred from a frame caption by the session that happened to notice. The
 * FIELD is declared below so it stops being erased; the BEHAVIOUR waits for
 * the ruling to be confirmed in words.
 *
 * The ONE exception is withdrawal. If a parent explicitly withdraws, that
 * child's data must stop being processed. So `granted` is not the field that
 * matters here - `status` is, and the two must not be conflated:
 *
 *   not_sent   granted:false   school has not asked yet      -> proceed
 *   pending    granted:false   asked, parent has not replied -> proceed
 *   confirmed  granted:true    parent granted                -> proceed
 *   withdrawn  granted:false   parent actively withdrew      -> STOP
 *
 * Three of those four are `granted: false`, which is exactly why reading
 * `granted` alone cannot implement the ruling. Read `status`.
 */

/**
 * What a consent record grants. FOUR values, not three — `cross_border_transfer`
 * was added on 21 Sep and this type did not have it.
 *
 * A union that omits a value the API sends does not prevent the value, it
 * erases it: a `cross_border_transfer` consent would have arrived, failed every
 * comparison, and rendered as nothing. That is the `fromContent` defect and it
 * is the third time this shape has cost something here.
 *
 * It is also the member that matters most. The contract's own description:
 * *"Each is asked and answered on its own. A parent agreeing to their child
 * using Nevo has not thereby agreed to anything else, which is the whole point
 * of the fourth one below."* Cross-border transfer of a Nigerian child's data
 * is precisely the thing a parent must agree to separately or not at all.
 */
export type ConsentType =
  | "data_processing"
  | "camera"
  | "offline_storage"
  | "cross_border_transfer";

/**
 * All four values the deployed `ConsentStatus` schema carries.
 *
 * This was previously declared as `"pending" | "confirmed"` - two of the four -
 * which made `status === "withdrawn"` a TYPE ERROR and the withdrawal rule
 * literally inexpressible. Checked against the deployed OpenAPI document 7 Sep.
 */
export type ConsentStatus = "not_sent" | "pending" | "confirmed" | "withdrawn";

/**
 * How Nevo reaches a parent. EMAIL, AND NOTHING ELSE.
 *
 * The backend half of SCRUM-162 landed on 20 Sep and we did not notice for a
 * day. Three separate comments in this codebase - here, in `parent.ts` and in
 * `useConsentRequests.ts` - each said *"the deployed enum is still
 * `["email","sms"]` (re-checked 21 Sep)"*. It was not. `ParentContactMethod` is a
 * one-member enum and has been since the ruling.
 *
 * That reasoning was sound when written, which is why it survived: keeping a
 * value the API still sends is correct, and deleting one it still sends is the
 * `fromContent` defect exactly. The PREMISE expired, not the logic. A comment
 * stating a fact about the contract is a claim with a shelf life, and nothing
 * re-checks it when the contract moves.
 *
 * Backend's own reason for keeping the member rather than deleting the enum:
 * *"a contact method is still a fact a consent record states, and a record
 * that states nothing cannot say how a parent was reached."*
 *
 * The ruling: *"You cannot collect personal data you have no use for. Four
 * hundred parents' phone numbers that nothing ever sends to are four hundred
 * pieces of personal data with no lawful purpose."*
 */
export type ParentContactMethod = "email";

/**
 * GET /students/me/consent-gate.
 *
 * Named for the endpoint, not for a gate we implement - see the header. Kept
 * wired because withdrawal enforcement needs exactly this read; see
 * `processingWithdrawn`.
 */
export interface ConsentGateStatus {
  studentId: string;
  granted: boolean;
  /**
   * **REQUIRED ON THE WIRE, AND UNDECLARED HERE UNTIL 23 SEP.**
   *
   * The server's own answer to "may this child proceed?", arriving on every
   * read and discarded by an interface that did not name it - the
   * `fromContent` defect, on the field that decides a child's access.
   *
   * Declared now so it is no longer erased. NOT read by anything yet: see the
   * header. It is deliberately NOT folded into `processingWithdrawn`, because
   * that function encodes one specific ruling and quietly widening it would be
   * how a gate gets built by accident.
   */
  blocked: boolean;
  requiredType: ConsentType;
  status: ConsentStatus;
}

/**
 * The only consent question the frontend is entitled to act on.
 *
 * Deliberately a named function rather than an inline `=== "withdrawn"`: it is
 * the single place the ruling is encoded, so a future status value (or a
 * change of mind about `not_sent`) is one edit, and every caller is greppable.
 */
export function processingWithdrawn(
  gate: Pick<ConsentGateStatus, "status"> | null | undefined,
): boolean {
  return gate?.status === "withdrawn";
}

/**
 * The server's own verdict on whether this child may proceed.
 *
 * SEPARATE FROM `processingWithdrawn` ON PURPOSE. That function encodes the
 * 7 Sep ruling - withdrawal, and nothing else, stops a child - and folding
 * `blocked` into it would silently turn one rule into another under a name
 * that still says "withdrawn".
 *
 * **NO CALLER YET.** It exists so that the field has a reader the moment the
 * ruling is confirmed, and so that the reader is a named function rather than
 * an inline `gate.blocked` scattered across the student lane. Absence of a
 * caller is the honest state while the question is open; see the header.
 */
export function accessBlocked(
  gate: Pick<ConsentGateStatus, "blocked"> | null | undefined,
): boolean {
  return gate?.blocked === true;
}

export interface ConsentConfirmation {
  id: string;
  studentId: string;
  consentType: ConsentType;
  status: ConsentStatus;
  confirmationSource: "school" | "parent" | null;
  confirmedVia: "written" | "verbal" | "email" | "digital" | null;
  confirmedAt: string | null;
}

/**
 * `ConsentDeliveryStatus` is `queued | processing | sent | failed`.
 *
 * This was narrowed to three - `processing` was missing - so a real value
 * would have fallen through every branch that switched on it. The response
 * SHAPE check in `scripts/contract-check.mjs` compares property names, not
 * enum members, so it cannot see this class; it was caught by reading the
 * document.
 */
export type ConsentDeliveryStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed";

export interface ParentConsentRequestReceipt {
  invitationId: string;
  parentLinkId: string;
  studentId: string;
  consentTypes: ConsentType[];
  deliveryStatus: ConsentDeliveryStatus;
  expiresAt: string;
}

export interface ParentLink {
  id: string;
  schoolId: string;
  studentId: string;
  parentId: string | null;
  parentName: string;
  parentContact: string;
  contactMethod: ParentContactMethod;
  accountCreated: boolean;
}

export const consentsApi = {
  /**
   * The student's own consent record. NOT an onboarding gate - onboarding no
   * longer calls this, because under the ruling it has nothing to decide.
   * Read it where withdrawal has to be honoured.
   */
  myConsentGate: () =>
    api.get<ConsentGateStatus>("/api/v1/students/me/consent-gate"),

  /** Admin surface: record school-collected consent (DSA warranty). */
  confirmBySchool: (payload: {
    studentId: string;
    consentTypes: ConsentType[];
    confirmedVia: "written" | "verbal" | "email" | "digital";
  }) =>
    api.post<ConsentConfirmation[]>(
      "/api/v1/consents/school-confirmations",
      payload,
    ),

  /** Admin surface: send a parent the consent request (SCRUM-80). */
  requestParentConsent: (
    studentId: string,
    payload: {
      parentName: string;
      parentContact: string;
      contactMethod: ParentContactMethod;
      consentTypes?: ConsentType[];
    },
  ) =>
    api.post<ParentConsentRequestReceipt>(
      `/api/v1/students/${studentId}/parent-consent-requests`,
      payload,
    ),

  /**
   * Parent action page (public, tokenised link - no session).
   *
   * `grantedTypes` became REQUIRED on 21 Sep and this sent `{token}` alone, so
   * the call 422'd and no consent was recorded. The long version is on
   * `parentApi.completeConsent`, which is the caller that actually runs; this
   * is its admin-surface twin and is kept in step deliberately, because two
   * clients of one endpoint drifting apart is how the first gets fixed and the
   * second does not.
   */
  completeParentConsent: (token: string, grantedTypes: ConsentType[]) =>
    api.post("/api/v1/consents/parent/complete", { token, grantedTypes }),

  /** Admin surface: a student's parent/guardian links. */
  listParentLinks: (studentId: string) =>
    api.get<ParentLink[]>(`/api/v1/students/${studentId}/parent-links`),
};
