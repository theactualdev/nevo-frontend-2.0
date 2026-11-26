import type { ConsentHeld } from "@/lib/api/parent";

/**
 * WHETHER EVERY CONSENT HELD FOR A CHILD IS THIS PARENT'S (SCRUM-306): the
 * server's `canWithdraw` on each, never a rule of our own. Withdrawing takes
 * every consent held and the server refuses it if any one isn't theirs, so the
 * route is theirs only when all of them are. None held: nothing the server has
 * said yes to, so it isn't.
 *
 * One rule for the two screens that ask it - the data page (whether Withdraw
 * Consent is offered) and Settings (whether its row talks about withdrawing at
 * all, D01g) - so they can't disagree about the same parent.
 */
export function holdsEveryConsent(held: readonly ConsentHeld[] | null | undefined): boolean {
  return !!held && held.length > 0 && held.every((c) => c.canWithdraw === true);
}
