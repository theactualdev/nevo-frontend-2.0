/**
 * The moment a session ends on this device, for whatever must end with it.
 *
 * A SHARED TABLET KEEPS WHAT A CHILD LEAVES BEHIND (19 Oct browser-storage
 * audit): signals that never went, the after-lesson picks, the old single
 * remembered profile, the baseline's raw taps. Every way a session ends -
 * Sign out, a door's Back, a lapse, a closed account, the next child's
 * sign-in over a session nobody ended - goes through `clearSession` or
 * `setSession`, and both announce the ending here. Each store says what of
 * that child's it lets go of (`forgetLeavingChild`).
 *
 * ITS OWN MODULE, WITH NOTHING IN IT, so the session store can announce an
 * ending without importing every store that listens, most of which import
 * the session store themselves.
 */

/** The session that has just ended. */
export interface EndedSession {
  userId: string;
  role: string;
  /**
   * The token it held. No longer the app's - nothing reads it from storage
   * now - and carried here for one thing only: a last try at sending what
   * this child left unsent, before it is deleted.
   */
  token: string;
}

type Listener = (ended: EndedSession) => void;

const listeners = new Set<Listener>();

/** Be told each time a session ends. Returns the way to stop being told. */
export function onSessionEnd(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the session store, and by nothing else. */
export function announceSessionEnd(ended: EndedSession): void {
  for (const listener of [...listeners]) {
    try {
      listener(ended);
    } catch {
      // One store failing to let go must not keep the others' leftovers.
    }
  }
}
