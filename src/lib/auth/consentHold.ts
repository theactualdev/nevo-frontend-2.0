import { USER_ROLES } from "@/lib/constants/permissions";

/**
 * 00d. Says nothing about consent, and the URL must not either - a child who
 * reads their own address bar learns nothing here, which is the same reason
 * the screen itself does not say why.
 *
 * Lives here rather than in `entryGate`, which re-exports it, because the API
 * client needs it too and `entryGate` reads consent through that client.
 */
export const WAITING_ROUTE = "/student/waiting";

/** The refusal a child gets once a parent has withdrawn consent (B7). */
export const CONSENT_WITHDRAWN = "consent_withdrawn";

/**
 * Where a refused request sends a child whose parent withdrew consent, or
 * null to leave the refusal with whoever made the request.
 *
 * WHAT BACKEND DOES (B7, 5 Oct). Withdrawal does not close the account, so the
 * child signs in and the reads still answer; starting a lesson, recording
 * progress, taking one offline and asking Nevo answer 403 `consent_withdrawn`
 * (and the signal stream since B44). Lydia ruled the child sees a suspended
 * screen. Each of those callers would otherwise show its own generic failure
 * - a lesson that "didn't load", a question Nevo "couldn't answer" - none of
 * them true, and all of them inviting the child to try again.
 *
 * THE HELD SCREEN, 00d, BECAUSE NO FRAME DRAWS "SUSPENDED". It is the screen
 * every sign-in door already sends a child the server holds, and design's
 * 23 Sep ruling is that a child in the same state meets the same screen
 * whichever door they use. It names no reason. Its words were written for a
 * wait rather than a withdrawal - raised with design.
 *
 * ONLY A CHILD, ONLY THIS CODE. Staff refused with it, should that ever
 * happen, would be hearing about a child, not about themselves. And never
 * from the held screen itself, so a refusal raised
 * there - a held position flushing, the signal outbox - cannot reload it in a
 * loop.
 *
 * Pure so it can be tested: jsdom will not let a test observe
 * `window.location`, the same reason `sessionExpiredDoor` is pure.
 */
export function withdrawnDoor(
  role: string | null | undefined,
  status: number,
  code: string | null | undefined,
  pathname: string,
): string | null {
  if (role !== USER_ROLES.STUDENT) return null;
  if (status !== 403 || code !== CONSENT_WITHDRAWN) return null;
  return pathname.replace(/\/+$/, "") === WAITING_ROUTE ? null : WAITING_ROUTE;
}
