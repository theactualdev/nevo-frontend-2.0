import { cn } from "@/lib/utils";

/**
 * D19's status vocabulary, and the frame states the palette outright:
 * "Calm status only: soft violet for pending, navy for joined, muted
 * near-black for expired; failures follow gentle recovery, never red."
 *
 * An expired invite is not an error and a revoked one is not a failure - both
 * are ordinary administrative facts, and neither gets an alarm colour.
 *
 * The backend's values are `pending | accepted | revoked | expired` (9 Oct);
 * "accepted" reads as D19's "Joined". Anything else still falls through to a
 * neutral pill showing the backend's own word rather than being forced into
 * one of ours.
 */

export type InviteStatus = "pending" | "joined" | "expired" | "revoked";

/**
 * `now` is passed in rather than read here. React's purity rule forbids
 * `Date.now()` during render, and the deeper reason is the better one: every
 * row in a list should be judged against the SAME instant, not against
 * whenever each one happened to be evaluated.
 */
export function normaliseStatus(
  status: string | null,
  expiresAt: string,
  now: number,
): InviteStatus | string {
  const s = (status ?? "").toLowerCase();
  if (s === "accepted" || s === "joined") return "joined";
  if (s === "revoked" || s === "cancelled") return "revoked";
  if (s === "expired") return "expired";
  if (s === "pending" || s === "sent" || s === "") {
    // A pending invite past its date is expired in fact, whatever the row says.
    return Date.parse(expiresAt) < now ? "expired" : "pending";
  }
  return s;
}

const LABELS: Record<InviteStatus, string> = {
  pending: "Pending",
  joined: "Joined",
  expired: "Expired",
  revoked: "Revoked",
};

const TONES: Record<InviteStatus, string> = {
  pending: "bg-nevo-violet/24 text-nevo-navy",
  joined: "bg-nevo-navy/12 text-nevo-navy",
  expired: "bg-nevo-near-black/[0.07] text-nevo-near-black/60",
  revoked: "bg-nevo-near-black/[0.07] text-nevo-near-black/60",
};

export function InviteStatusPill({ status }: { status: InviteStatus | string }) {
  const known = status in LABELS;
  const key = status as InviteStatus;
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center rounded-full px-3 py-1 text-[12.5px] font-semibold capitalize",
        known ? TONES[key] : "bg-nevo-near-black/[0.07] text-nevo-near-black/60",
      )}
    >
      {known ? LABELS[key] : status}
    </span>
  );
}
