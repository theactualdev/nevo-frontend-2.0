import { USER_ROLES } from "@/lib/constants/permissions";

/**
 * A pause that lands while a child is using Nevo (frame 28b).
 *
 * THE FRAME: "A pause can arrive mid-read. Instead of a bare 401, the lesson the
 * child was on stays visible but goes quiet behind a soft scrim, and a calm card
 * explains in two lines." What shipped was the bare 401: `client.ts` cleared the
 * session and did a full page load to the session-ended door, so the lesson
 * vanished from under a child halfway through a sentence. The account-paused
 * code was read and honoured - the screen was right - but the step design drew
 * before it was missing.
 *
 * So for a CHILD the 401 now stays where it is, and a host mounted in the
 * student layout (`AccountPauseHost`) draws the card over whatever is on
 * screen. Staff are unchanged: their frame is a door of its own.
 *
 * WHY A HOST COUNT. The in-place card only exists where something is mounted
 * to draw it. A child's token can, rarely, be spent on a page outside the
 * student layout, and an event nobody hears would leave them with nothing at
 * all - so with no host mounted the old redirect still happens. The decision is
 * the pure `pausesInPlace`, for the same reason `sessionExpiredDoor` is pure:
 * jsdom will not let a test observe `window.location`.
 *
 * THE FLAG IS STICKY for the life of the page. A host that mounts after the
 * 401 - a route change racing the response - still finds it, and nothing about
 * a paused account changes until the page is left.
 */

const PAUSED_EVENT = "nevo:account-paused";

let hosts = 0;
let paused = false;

/** Mount point for the in-place card. Returns the unregister. */
export function registerPauseHost(): () => void {
  hosts += 1;
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    hosts -= 1;
  };
}

/** How many hosts could draw the card right now. */
export function pauseHostsMounted(): number {
  return hosts;
}

/**
 * Should this 401 be shown where the person is, rather than by leaving?
 *
 * Only a child, only `account_paused`, and only where a host is mounted. A
 * paused STAFF account keeps its own door, and every other code keeps the
 * session-end screens - an expired session really has ended, and there is
 * nothing to stay for.
 */
export function pausesInPlace(
  role: string | null | undefined,
  code: string | null | undefined,
  hostsMounted: number,
): boolean {
  return (
    role === USER_ROLES.STUDENT && code === "account_paused" && hostsMounted > 0
  );
}

/** Raise the card. Called by `client.ts` instead of redirecting. */
export function announceAccountPause(): void {
  paused = true;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PAUSED_EVENT));
}

/** Whether a pause has landed on this page. */
export function isAccountPaused(): boolean {
  return paused;
}

/** `useSyncExternalStore`'s subscribe. */
export function onAccountPause(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PAUSED_EVENT, listener);
  return () => window.removeEventListener(PAUSED_EVENT, listener);
}
