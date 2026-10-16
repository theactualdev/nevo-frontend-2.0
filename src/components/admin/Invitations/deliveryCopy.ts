import type { InvitationDeliveryStatus } from "@/lib/api/invites";

/**
 * What we are allowed to tell an admin after an invite goes out.
 *
 * THE INVITE EMAIL. The backend reports `deliveryStatus`, and is explicit in
 * the spec that `email_not_configured` is "deliberately distinct from sent:
 * the invitation exists and its link is valid, but nobody was emailed, so the
 * caller has to deliver it another way". The screen used to interpolate that
 * value raw - a real admin read "Delivery: email_not_configured." - which
 * names the condition without telling them the one thing it means for them:
 * send the link yourself.
 *
 * THE PARENT CONSENT LINES ARE GONE. This file also said where a parent's
 * consent had got to after a student invite - `consentNote` under a name in
 * the list, `parentConsentLine` after sending. Children are no longer invited
 * (Lydia's L2, 14 Oct; SCRUM-215), so no invitation carries a parent, and a
 * child's consent is shown on Students, where it can also be requested.
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
