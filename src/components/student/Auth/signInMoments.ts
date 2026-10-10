import { isHoldDestination } from "@/lib/auth/consentHold";

/**
 * The sign-in moments design ruled on (D2, D59, D68), shared by both PIN doors
 * - the remembered-device unlock and the full sign-in - so the two cannot say
 * different things about the same moment.
 */

/**
 * Does this child go straight on, with no "Welcome back" beat?
 *
 * A child about to be held never sees "Taking you to your lessons", because it
 * is not true. They go straight to the hold - 00d, 00e (D117), or the one for a
 * consent check that could not complete (D69). The beat is for a child who is
 * actually on their way in.
 */
export function skipsWelcomeBeat(destination: string): boolean {
  return isHoldDestination(destination);
}

/**
 * Said when this sign-in ended the same account's session on another device
 * (`SessionResponse.replacedSession`). Board 28's "Signed in here, other
 * tablet released" (D59), on a screen of its own - see `SignedInHereScreen`.
 * It replaced an interim line of ours, "Your other session has ended.", which
 * rode the "Welcome back" beat.
 *
 * "DEVICE", NOT THE FRAME'S "TABLET" (D130, 6 Oct): "A child on a phone or a
 * laptop reading the word tablet is being told about a device they are not
 * holding." Design asked for device-neutral words and gave no sentence, so
 * this is the frame's sentence with that one word changed - and product has
 * ruled it (7 Oct): "Say 'another device', never 'another tablet', in
 * everything a child reads."
 */
export const REPLACED_ELSEWHERE_COPY =
  "You were signed in on another device, so that one signed out.";

/**
 * The PIN doors' line for a failure that is not the child's PIN - 28c-6
 * (D68), drawn in 28c-5's tinted box. One copy for every door that shares the
 * box, so the remembered-device unlock and the full sign-in cannot say
 * different things about the same refusal.
 *
 * A RATE LIMIT IS NOT A LINE HERE ANY MORE. 28c-7's "Let's wait a moment
 * before trying again." gave way to D154's pause (9 Oct), which "holds
 * everywhere a child enters a PIN": see `ThrottledPause`.
 */
export const SIGN_IN_OURS_COPY = "Something went wrong on our side. Try again.";
