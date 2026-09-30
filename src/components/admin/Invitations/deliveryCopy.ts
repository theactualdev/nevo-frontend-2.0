import type { InvitationDeliveryStatus } from "@/lib/api/invites";
import type { ConsentStatus } from "@/lib/api/consents";

/**
 * What we are allowed to tell an admin after an invite goes out.
 *
 * Two separate things were being claimed here, and neither was checked.
 *
 * 1. THE INVITE EMAIL. The backend reports `deliveryStatus`, and is explicit
 *    in the spec that `email_not_configured` is "deliberately distinct from
 *    sent: the invitation exists and its link is valid, but nobody was
 *    emailed, so the caller has to deliver it another way". The screen used to
 *    interpolate that value raw - a real admin read "Delivery:
 *    email_not_configured." - which names the condition without telling them
 *    the one thing it means for them: send the link yourself.
 *
 * 2. THE PARENT CONSENT REQUEST. Both invite flows told the admin a consent
 *    request had been sent to the parent, and nothing supported that. The
 *    claim was produced from the parent contact the admin had just typed.
 *
 *    TWO SENTENCES THAT USED TO JUSTIFY THIS ARE NOW FALSE, and both were the
 *    kind that stop a future reader from looking again:
 *
 *      - "`InvitationResponse` carries no consent field." It carries
 *        `consentStatus: ConsentStatus | null` - not_sent | pending |
 *        confirmed | withdrawn - which is exactly the state this file said no
 *        screen could honestly report.
 *      - "`consentsApi.requestParentConsent` is typed in this repo with NO
 *        CALLER anywhere." It has callers now: the roster row and the
 *        student's own record, via `useConsentRequests`.
 *
 *    TODO (client, not api): thread `consentStatus` onto `Invitation` in
 *    `lib/api/invites.ts` and branch `parentConsentLine` on it - nobody asked
 *    yet / asked and no reply / recorded - falling back to today's no-claim
 *    sentence on null, exactly as `deliveryLine` already handles a null
 *    `deliveryStatus`.
 *
 * THE STATE IS REPORTED NOW. `InvitationResponse.consentStatus` is threaded
 * onto `Invitation` and read by `consentNote` and `parentConsentLine` below, so
 * a screen can finally say where a consent request has got to.
 *
 * WHAT IT STILL MUST NOT DO IS OFFER TO SEND ONE. No call queues a consent
 * request against an invitation: `POST /students/{id}/parent-consent-requests`
 * needs a student uuid, and the contract never links an invite to one before it
 * is accepted. `requestParentConsent` also needs a `ParentLink` with a parent
 * NAME, which an invite's bare `parentContact` cannot produce - so for exactly
 * the students these flows create, the Students screen already answers "there's
 * nobody to send this to". Copy here promises no action for that reason.
 *
 * TODO(api): a call that queues a consent request for an invited student, or a
 * way to mint a parent link from an invitation's contact.
 */

/** The invite email's outcome, in the admin's language. */
export function deliveryLine(status: InvitationDeliveryStatus | null): string {
  switch (status) {
    case "sent":
      return "We emailed the invite. You can share this link as well.";
    case "email_not_configured":
      return "No email was sent - this school has no mail set up in Nevo, so the link above is the only way in. Share it yourself.";
    case "not_requested":
      return "No email was sent. Share the link above yourself.";
    default:
      // Older invitations predate the field; say only what holds either way.
      return "You can share this link yourself if it doesn't reach them.";
  }
}

/**
 * True ONLY when the backend said it emailed them.
 *
 * The claim sites used to ask `!needsManualDelivery(status)`, which treats
 * "not known to be manual" as delivered - and `deliveryStatus` is nullable in
 * the contract, with `client.ts` casting the JSON unchecked, so an absent field
 * arrives as null or undefined and took the confident arm. The console then
 * said "Invite resent to <name>" and "N invites sent" over a response that
 * established no delivery at all.
 *
 * Delivery is a claim about the outside world. Assert it only when told.
 */
export function confirmedSent(
  status: InvitationDeliveryStatus | null | undefined,
): boolean {
  return status === "sent";
}

/** True when the invite definitely did not reach anyone by email. */
export function needsManualDelivery(
  status: InvitationDeliveryStatus | null | undefined,
): boolean {
  return status === "email_not_configured" || status === "not_requested";
}

/**
 * After a resend the backend did NOT confirm emailing: the short message, and
 * the lead of the link handout that sits in the row below it.
 *
 * Shared by the Invitations list and the Teachers list, which both offer
 * Resend, so the same answer from the same endpoint reads the same on both.
 * `name` is who the invite is for; `hasLink` whether the resend carried a
 * token to hand over.
 */
export function unconfirmedResendToast(
  status: InvitationDeliveryStatus | null | undefined,
  hasLink: boolean,
): string {
  return needsManualDelivery(status)
    ? hasLink
      ? "No email went out - their link is in the row below"
      : "No email went out, and no link came back"
    : hasLink
      ? "We couldn't confirm an email - their link is in the row below"
      : "We couldn't confirm an email went out";
}

export function unconfirmedResendLead(
  status: InvitationDeliveryStatus | null | undefined,
  hasLink: boolean,
  name: string,
): string {
  return needsManualDelivery(status)
    ? hasLink
      ? `No email was sent to ${name} - this school has no mail set up in Nevo, so this link is the only way in.`
      : `No email was sent to ${name}, and this resend carried no link.`
    : `We couldn't confirm an email reached ${name}.`;
}

/**
 * Where the parent's consent has actually got to, in a few words.
 *
 * Short by design: it sits under a name in a list, beside the expiry date. The
 * full sentence is `parentConsentLine`.
 *
 * NULL MEANS THE INVITE CARRIED NO CONSENT RECORD, which is not `not_sent` -
 * older invitations predate the field entirely. It returns null and the caller
 * renders nothing, rather than reporting that nobody has been asked.
 */
export function consentNote(status: ConsentStatus | null): string | null {
  switch (status) {
    case "confirmed":
      return "Parent consent recorded";
    case "pending":
      return "Parent asked · no reply yet";
    case "not_sent":
      return "No consent request sent";
    case "withdrawn":
      return "Parent withdrew consent";
    default:
      return null;
  }
}

/**
 * What is true about the parent after a student invite.
 *
 * TWO CLAIMS HAVE BEEN CUT FROM THIS LINE, both of which were false:
 *
 * 1. "{who} can't begin lessons until consent is confirmed". SCRUM-80 says the
 *    school warrants consent through the DSA and the child proceeds; only a
 *    withdrawal stops anything.
 * 2. "confirming creates the parent account". It did once. The backend replaced
 *    parent password auth with a code flow on 11 Sep - `POST /consents/parent/
 *    {token}/account` is GONE, and a parent now signs in through
 *    `/auth/parent/request-code`. Confirming records consent; it does not mint
 *    an account.
 *
 * Nothing here offers to SEND a request, because nothing can - see the note at
 * the top of this file.
 */
export function parentConsentLine(
  parentContact: string,
  studentName: string | null,
  consentStatus: ConsentStatus | null,
): string {
  const who = studentName ?? "this student";
  const contact = `${parentContact} is recorded as the parent contact.`;
  switch (consentStatus) {
    case "confirmed":
      return `${contact} Their consent is already recorded.`;
    case "pending":
      return `${contact} A consent request has gone to them, and they haven’t replied yet.`;
    case "withdrawn":
      // States the record, and claims no consequence. Whether processing has
      // actually stopped is the backend's to answer - see
      // docs/open-questions-consent.md.
      return `${contact} They have withdrawn consent, so your school’s record shows a withdrawal rather than an agreement.`;
    case "not_sent":
      return `${contact} No consent request has been sent to them yet.`;
    default:
      // Older invitations predate the field. Say only what holds either way -
      // the shape `deliveryLine` uses for a null `deliveryStatus`.
      return `${contact} Your school still needs to record consent for ${who}.`;
  }
}
