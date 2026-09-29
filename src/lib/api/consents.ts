import { api } from "./client";

/**
 * Consent endpoints (NDPA; SCRUM-80 family) - wired to the live backend.
 *
 * **THE 7 SEP RULING IS SUPERSEDED. CONFIRMED 23 SEP. CONSENT IS A GATE.**
 *
 * A child whose consent is not in **cannot reach the assessment at all** - not
 * a lesson, not the baseline. The gate is at the ENTRY POINT, not mid-flow.
 *
 * The screen exists and is `student/00d Waiting on Consent` (SE-01), which
 * replaced `student/14 Consent Gate` in the 20 Sep drop. Its whole content:
 *
 *   "Nevo isn't quite ready for you yet" / "It will be soon."
 *
 * And its rules, which are as much the design as the words: **no progress, no
 * countdown, no refresh, no door held shut.** When consent arrives, opening the
 * same link goes straight to the assessment with no action from the child.
 * Primary case is a shared classroom tablet at 768x1024.
 *
 * ROUTING IS THE STUDENT LANE'S. This file owns the READ - `accessBlocked`
 * below - and the student console owns where SE-01 sits in its entry flow. See
 * the handoff in docs/BUILD_STATUS.md.
 *
 * What this header used to assert, and what the code still does: *"NEVO IS NOT
 * THE CONSENT GATE. Design ruled on SCRUM-80 (7 Sep): the school warrants
 * consent through the DSA, so `granted: false` means the school has not
 * recorded it yet - an administrative task of theirs, not a blocker for the
 * child. The child proceeds normally."*
 *
 * What this header used to assert, kept because the reversal is the point:
 * *"NEVO IS NOT THE CONSENT GATE... the child proceeds normally."*
 *
 * Three things carry the new ruling:
 *
 *  - `student/00d Waiting on Consent` (SE-01), NEW - the entry gate, sitting
 *    before the assessment.
 *  - `admin/D25 Consent (Written Route)`, PC-03: **"A child stays out of
 *    lessons until they're cleared."**
 *  - `ConsentGateResponse.blocked`, required, and discarded by this interface
 *    until 23 Sep. A gate that reports whether a child is blocked was never
 *    the shape of a thing that never blocks anyone.
 *
 * `AgeCheckResponse.blocksAccess` is the same rule reaching the same place by
 * a different route: a date of birth the school and the parent disagree on
 * also holds a child at the door until a person resolves it.
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
 * **NO CALLER IN THIS LANE, AND THAT IS NOT THE SAME AS NO CALLER WANTED.**
 * The ruling is settled (23 Sep); the routing that acts on it belongs to the
 * student console's entry flow, where SE-01 lives. This is the reader it
 * should call, so that the rule is one named function rather than an inline
 * `gate.blocked` in three places.
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

/**
 * What this console asks a parent for: using Nevo, and nothing else.
 *
 * One type because the student gate names one (`requiredType` on
 * `GET /students/me/consent-gate`), and because the parent page will only
 * render a request that asks one thing - a single "Yes" cannot honestly grant
 * four. Camera, offline storage and cross-border transfer are asked separately
 * or not at all, when counsel and design say how.
 */
export const REQUESTED_CONSENT_TYPES: ConsentType[] = ["data_processing"];

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

  /**
   * Admin surface: send a parent the consent request (SCRUM-80).
   *
   * ALSO HOW A GUARDIAN GETS ONTO A RECORD. There is no endpoint that writes a
   * guardian directly; this one takes a name and contact and answers with a
   * `parentLinkId`, so for a student with nobody on record it creates the
   * guardian and sends them the request in one step. `addGuardian` below is
   * that use, named for what the school is doing.
   *
   * THE TYPES ARE ALWAYS STATED. They were optional here and omitted by every
   * caller, so what a parent was asked came from a backend default the spec
   * does not document - and the parent page refuses any request asking for
   * more than one thing. Sending `REQUESTED_CONSENT_TYPES` means a request
   * this console sends is always one the parent page can render.
   */
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
      { consentTypes: REQUESTED_CONSENT_TYPES, ...payload },
    ),

  /**
   * Put a guardian on a student's record, and send them the consent request.
   * See `requestParentConsent` - it is the same call.
   */
  addGuardian: (studentId: string, guardian: { name: string; email: string }) =>
    api.post<ParentConsentRequestReceipt>(
      `/api/v1/students/${studentId}/parent-consent-requests`,
      {
        parentName: guardian.name,
        parentContact: guardian.email,
        contactMethod: "email" satisfies ParentContactMethod,
        consentTypes: REQUESTED_CONSENT_TYPES,
      },
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
