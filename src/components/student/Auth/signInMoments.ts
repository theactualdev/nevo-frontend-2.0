import { WAITING_ROUTE } from "@/lib/auth/entryGate";

/**
 * The two sign-in moments design ruled on 1 Oct (D2), shared by both PIN doors
 * - the remembered-device unlock and the full sign-in - so the two cannot say
 * different things about the same moment.
 */

/**
 * Does this child go straight on, with no "Welcome back" beat?
 *
 * A child about to be held at 00d never sees "Taking you to your lessons",
 * because it is not true. They go straight to the waiting screen. The beat is
 * for a child who is actually on their way in.
 */
export function skipsWelcomeBeat(destination: string): boolean {
  return destination === WAITING_ROUTE;
}

/**
 * Said on the beat when this sign-in ended the same account's session on
 * another device (`SessionResponse.replacedSession`, required on the wire and
 * read by nothing until now).
 *
 * Design, D2: the device "says the session has ended and does not explain
 * where or why" - no device, no place, and no "because you signed in here",
 * which on a shared tablet would tell whoever is holding it more than they
 * need. NOT DRAWN: the words are ours until design gives theirs.
 */
export const REPLACED_ELSEWHERE_COPY = "Your other session has ended.";
