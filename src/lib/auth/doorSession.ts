import { getSession, type StoredSession } from "./session";

/**
 * A DOOR SENDS NOTHING AS THE SESSION IT FOUND STORED (19 Oct browser-storage
 * audit).
 *
 * The sign-in screens, Forgot PIN, the SSO callback and 05 Entry are how a
 * child gets in. A session already stored on the tablet when one opens is
 * somebody else's as far as that screen is concerned - the last child's,
 * still there - and everything on the page sent it: the app's routine reads
 * (the session check, settings, notifications, the consent read) and the
 * screen's own signal stream, which posted a failed SSO sign-in's events as
 * the stored child. The door's own requests were already sent as nobody
 * (`ANONYMOUS_PATHS` in `client.ts`); this extends the same rule to the page
 * while a door is open.
 *
 * So the token stored when the door opened is held: the API client sends
 * nothing with it (`client.ts`), and nothing treats it as the child to send
 * as (`usableSession`). A sign-in at the door stores a new token, which is
 * sent as normal - the screen's own child. Closing the door releases it.
 */

let openDoors = 0;
let heldToken: string | null = null;

/**
 * This screen is a door, for as long as it is open. Returns the release -
 * the shape of an effect's cleanup. Opened in a layout effect, so it is in
 * place before any of the page's reads, which run in later effects.
 */
export function openDoor(): () => void {
  openDoors += 1;
  if (openDoors === 1) heldToken = getSession()?.token ?? null;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openDoors -= 1;
    if (openDoors === 0) heldToken = null;
  };
}

/** Is this the token a door found stored - not to be sent while it is open? */
export function isHeldAtDoor(token: string | null | undefined): boolean {
  return openDoors > 0 && Boolean(token) && token === heldToken;
}

/**
 * The session there is to send as: the stored one, unless an open door is
 * holding it. A stream or a flush asks this, not `getSession`, so nothing is
 * queued, held or delivered under a session the page is not signed in as.
 */
export function usableSession(): StoredSession | null {
  const session = getSession();
  return session && !isHeldAtDoor(session.token) ? session : null;
}
