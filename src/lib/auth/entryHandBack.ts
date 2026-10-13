import type { EntryIdentity } from "./firstPin";

/**
 * The pair a child typed on 05 Entry, handed back to 05 when the PIN route
 * says it no longer names anyone (404 `entry_not_found`, B68).
 *
 * The lookup matched them minutes earlier, so by the end of the first run the
 * roster has changed under them. The honest screen is 05's own miss - both
 * values as typed, "That didn't match", Continue reading "Try again" - which
 * is what they would meet if they typed the pair again now.
 *
 * IN MEMORY, AND ONLY FOR THE NEXT SCREEN, for the same reasons as
 * `signInHandoff`: not the URL, which a child can read and a browser keeps,
 * and not storage, which outlives the child on a shared tablet. A reload
 * starts 05 empty, which is the screen working as it always did.
 *
 * Only ever written from a refusal's handler, never while a page renders on
 * the server.
 */

let pending: EntryIdentity | null = null;

/** Leave the pair for 05 to show as a miss. */
export function handEntryBack(entry: EntryIdentity): void {
  pending = entry;
}

/**
 * What was left, without taking it. Safe inside a `useState` initialiser,
 * which React may call twice; the screen clears it once it has mounted.
 */
export function peekEntryHandBack(): EntryIdentity | null {
  return pending;
}

/** Spent, so the next visit to 05 starts empty. */
export function clearEntryHandBack(): void {
  pending = null;
}
