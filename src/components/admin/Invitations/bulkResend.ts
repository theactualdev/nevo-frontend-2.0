/**
 * MASS RESEND (Olayinka's TO-DO item 9, 24 Nov: "should be able to mass resend
 * invites in the Invitations tab to teachers").
 *
 * D19 draws no selection, and the contract has no bulk resend (`POST
 * /invites/bulk` creates; `PATCH /invites/{id}/resend` is one at a time). So
 * it is D07's DRAWN bulk pattern - tick rows, the navy selection bar, a
 * confirm, "Resending n of N…", one outcome line - over the same resend each
 * row's own button makes, one invite after another.
 *
 * The outcome reads as D07's bulk consent outcome does (`bulkConsentLines`),
 * in this screen's own words for each answer: D19's "resent", and the single
 * resend's "No email went out" / "We couldn't confirm an email went out".
 */

/** What one mass resend came to, every invite accounted for. */
export interface BulkResendTally {
  /** The server confirmed emailing. */
  resent: number;
  /** The server said no email went: no mail set up, or none asked for. */
  noEmail: number;
  /** Resent, with no word either way on the email. */
  unconfirmed: number;
  /** The resend itself was refused or lost - nothing changed. */
  failed: number;
}

/** Where a row's own Resend is offered: a live invite, or an expired one. */
export function resendable(status: string): boolean {
  return status === "pending" || status === "expired";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function bulkResendLines(t: BulkResendTally): string[] {
  const lines: string[] = [];
  if (t.resent) lines.push(`${t.resent} ${plural(t.resent, "invite", "invites")} resent.`);
  if (t.noEmail) {
    lines.push(
      `No email went out for ${t.noEmail} - ${plural(t.noEmail, "their link is in their row", "their links are in their rows")}.`,
    );
  }
  if (t.unconfirmed) lines.push(`We couldn’t confirm an email went out for ${t.unconfirmed}.`);
  if (t.failed) {
    lines.push(`${t.failed} didn’t resend, and nothing changed for those. Try them again in a moment.`);
  }
  return lines;
}
