import type { Invitation } from "@/lib/api/invites";
import type { TeacherSummary } from "@/lib/api/teachers";
import { normaliseStatus } from "../Invitations/inviteStatus";

/**
 * The invitation a Resend on the Teachers list would re-deliver.
 *
 * `GET /teachers` carries no invitation id, so an invited teacher is matched
 * to their invitation by email - the one field both rows carry. Only an
 * invitation the Invitations list itself would offer Resend on qualifies: a
 * live one first, an expired one otherwise. A joined or revoked invitation is
 * not one to send again, and no match means no button - not a guess.
 */
export function openInviteFor(
  teacher: TeacherSummary,
  invites: Invitation[],
  now: number,
): Invitation | null {
  const email = teacher.email?.trim().toLowerCase();
  if (!email) return null;
  const theirs = invites.filter(
    (i) =>
      i.email?.trim().toLowerCase() === email &&
      (i.role ?? "").toLowerCase() === "teacher",
  );
  const state = (i: Invitation) => normaliseStatus(i.status, i.expiresAt, now);
  return (
    theirs.find((i) => state(i) === "pending") ??
    theirs.find((i) => state(i) === "expired") ??
    null
  );
}
