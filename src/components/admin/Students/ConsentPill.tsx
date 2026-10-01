"use client";

import type { ConsentState, StudentConsent } from "@/lib/api/students";
import { cn } from "@/lib/utils";

/**
 * D07's consent state, in the four values SCRUM-40 asks for.
 *
 * This is the screen's whole reason for existing - which students the school
 * has a recorded consent for - and until the backend carried consent (7 Sep)
 * it could not be shown at all. It was deliberately never derived from
 * `status`: an active account is not a granted consent, and a school reading
 * this is reading a legal position.
 *
 * IT IS NOT A GATE, AND THIS FILE USED TO CALL IT ONE. The reason for existing
 * above read "which students cannot yet begin lessons". Per SCRUM-80 that is
 * false of three of these four states - see `withoutRecordedConsent`.
 *
 * DESIGN LAW: no red. `withdrawn` is the state that most wants an alarm colour
 * and gets violet instead; `not_sent` is quiet rather than accusing, because a
 * school that has not sent a request yet has done nothing wrong.
 *
 * An ABSENT consent object is not `not_sent`. Older reads may omit the field,
 * and "we don't know" must not render as "nobody asked" - so it says so.
 */

const LABEL: Record<ConsentState, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  not_sent: "Not sent",
  withdrawn: "Withdrawn",
};

const TONE: Record<ConsentState, string> = {
  confirmed: "bg-nevo-navy/10 text-nevo-navy",
  pending: "bg-nevo-violet/25 text-nevo-navy",
  not_sent: "bg-nevo-near-black/[0.07] text-nevo-near-black/70",
  withdrawn: "bg-nevo-violet/40 text-nevo-navy",
};

export function ConsentPill({
  consent,
  className,
}: {
  consent: StudentConsent | null | undefined;
  className?: string;
}) {
  if (!consent) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-full border border-dashed border-nevo-near-black/20 px-3 py-1 text-[12.5px] font-medium text-nevo-near-black/45",
          className,
        )}
        title="This read didn't carry a consent state"
      >
        Unknown
      </span>
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold",
        TONE[consent.status],
        className,
      )}
    >
      {LABEL[consent.status]}
    </span>
  );
}

/**
 * Students whose consent this school has not RECORDED yet.
 *
 * THIS WAS `blockedByConsent` AND IT COUNTED THE WRONG THING - or rather, it
 * counted the right thing under a name and a header sentence that made a claim
 * nobody is entitled to make. SCRUM-80 (7 Sep) ruled that Nevo is not the
 * consent gate: the school warrants consent through the DSA, so `not_sent` and
 * `pending` are administrative states and the child proceeds. Only `withdrawn`
 * stops processing. `lib/api/consents.ts` holds the ruling and the deployed
 * `ConsentGateResponse` agrees with it, carrying `granted` and `blocked` as two
 * separate required booleans.
 *
 * So the COUNT is unchanged and still useful - a school does need to know how
 * many records are outstanding - but it is no longer described as a set of
 * children who cannot begin lessons, because they can.
 *
 * `withdrawnCount` below is the one that really does stop a child, and it is
 * deliberately a second function rather than a flag: conflating the two is the
 * exact mistake this pair exists to prevent.
 */
/**
 * Whether a consent request may be offered for this learner.
 *
 * NOT "anything but confirmed", which is what both screens asked. That
 * included WITHDRAWN - so a parent who had explicitly refused could be sent a
 * fresh request by an admin pressing a button next to their child's name.
 * SCRUM-40 forbids it outright, and it reads as nagging a family who have
 * already said no.
 *
 * It matters more since 15 Sep, when backend began enforcing withdrawal on the
 * four processing endpoints: the child is genuinely stopped now, so a request
 * to the parent who stopped them is both futile and pointed.
 */
export function mayRequestConsent(
  consent: { status: StudentConsent["status"] } | null | undefined,
): boolean {
  return consent?.status === "pending" || consent?.status === "not_sent";
}

export function withoutRecordedConsent(
  rows: { consent?: StudentConsent | null }[],
): number {
  return rows.filter(
    (r) => r.consent && r.consent.status !== "confirmed",
  ).length;
}

/**
 * Students a parent has actively withdrawn.
 *
 * The only consent state that stops processing, per SCRUM-80 and
 * `processingWithdrawn`. An absent consent object is never counted here: not
 * knowing is not a withdrawal.
 */
export function withdrawnCount(
  rows: { consent?: StudentConsent | null }[],
): number {
  return rows.filter((r) => r.consent?.status === "withdrawn").length;
}

/**
 * The sentence under a student's consent state, when there is one to tell.
 *
 * SCRUM-40 line 354 wants the actor and the date on a withdrawal - "Mrs. Eze
 * withdrew consent on 14 July" - and the same shape reads correctly for a
 * confirmation, so both are built from the one record.
 */
export function consentDetailLine(consent: StudentConsent): string | null {
  const when = consent.timestamp
    ? new Date(consent.timestamp).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const who = consent.actorName;
  const via = consent.channel ? ` by ${consent.channel}` : "";

  if (consent.status === "confirmed") {
    if (who && when) return `${who} confirmed on ${when}${via}.`;
    if (when) return `Confirmed on ${when}${via}.`;
    return null;
  }
  if (consent.status === "withdrawn") {
    if (who && when) return `${who} withdrew consent on ${when}.`;
    if (when) return `Withdrawn on ${when}.`;
    return "Consent has been withdrawn.";
  }
  if (consent.status === "pending") {
    return when ? `Requested on ${when}${via}.` : "A request has been sent.";
  }
  return null;
}

/**
 * D07's line under the pill - "Responded 8 Sep", "Invited 14 Sep" - from the
 * `timestamp` every row already carries and nothing rendered. Only the two
 * states the frame dates; a missing or unreadable date says nothing.
 */
export function consentDateLine(
  consent: { status: string; timestamp: string | null } | null | undefined,
): string | null {
  if (!consent?.timestamp) return null;
  const d = new Date(consent.timestamp);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (consent.status === "confirmed") return `Responded ${day}`;
  if (consent.status === "pending") return `Invited ${day}`;
  return null;
}
