/**
 * The school code and Student ID a child has just typed on 05 Entry, carried
 * to 00c Sign Back In so they are not asked to type them twice.
 *
 * A child the lookup says already has an account (`accountReady`) is sent to
 * sign back in rather than through a first run that would make a second
 * account. They have typed two of 00c's three fields one screen earlier.
 *
 * IN MEMORY, AND ONLY FOR THE NEXT SCREEN. Not the URL, which a child can read
 * and a browser keeps in its history, and not storage, which outlives the
 * child on a shared tablet. A module variable survives the client-side
 * navigation to 00c and nothing else: a reload, a new tab or a different
 * child's session all start with nothing pre-filled, which is the screen
 * working as it did before.
 *
 * Only ever written from a click handler, so it is never set while a page is
 * rendering on the server.
 */

export interface SignInHandoff {
  schoolCode: string;
  /** The Student ID / Admission Number. Sign-in matches it as well as a login identifier. */
  identifier: string;
}

let pending: SignInHandoff | null = null;

/** Leave the pair for 00c to pick up. */
export function handSignInOver(handoff: SignInHandoff): void {
  pending = handoff;
}

/**
 * What was left, without taking it. Safe inside a `useState` initialiser,
 * which React may call twice; the screen clears it once it has mounted.
 */
export function peekSignInHandoff(): SignInHandoff | null {
  return pending;
}

/** Spent, so the next visit to 00c starts empty. */
export function clearSignInHandoff(): void {
  pending = null;
}
