"use client";

/**
 * What is left of the on-device behavioural store (SCRUM-76): its removal.
 *
 * Earlier builds wrote every pointerdown and keydown, on every screen, into
 * IndexedDB for "the affective inference layer" to read locally. Nothing ever
 * read it, and nothing may: the frontend infers no state (frontend §6 - "no
 * client-side frustration detection"); the engine does that from the signals
 * sent to it. A log of a child's taps with no reader is data held for no
 * purpose, and it was purged only by Profile's sign-out - a revoked, expired or
 * paused session left it, and the next child wrote under the last one's id.
 *
 * So nothing writes here any more, and what is already on a device is deleted
 * the first time anyone signs in or out on it. The two names below are kept
 * because `AuthContext` calls them at exactly those moments.
 */

const DB_NAME = "nevo-ephemeral-signals";
const SESSION_KEY = "nevo-signal-session";

/** Delete whatever an earlier build left on this device. Best-effort. */
function purge(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Unavailable storage holds nothing to remove.
  }
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // Another tab still holding it open: it goes when that tab lets go.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** A child signed in: nothing of any earlier child's may remain. */
export const setEphemeralStudent: (id: string) => void = () => {
  void purge();
};

/** Sign-out: the same purge. */
export function endEphemeralSession(): Promise<void> {
  return purge();
}
