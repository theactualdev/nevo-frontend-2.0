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
 *
 * A CLOSED ACCOUNT TAKES THE SAME PATH (B58, D53). Backend's 5 Oct answer gives
 * a removed account its own 401, `account_closed`; the deployed spec's 401
 * description does not name it yet and still says `account_paused` covers
 * "closed or suspended" - raised. Where it arrives, the host covers the lesson
 * with 28d at once, with no card, and never says the account is on pause. "On
 * pause" says it will start again, which for a removed child is not true and
 * brings them back to the tablet to try. So the flag carries WHICH state
 * landed, and the screens read it.
 */

const PAUSED_EVENT = "nevo:account-paused";

/** The two account states a child is shown in place. Never a reason. */
export type AccountHold = "paused" | "closed";

let hosts = 0;
let held: AccountHold | null = null;

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
 * Only a child, only `account_paused` or `account_closed`, and only where a
 * host is mounted. A paused STAFF account keeps its own door, and every other
 * code keeps the session-end screens - an expired session really has ended,
 * and there is nothing to stay for.
 */
export function pausesInPlace(
  role: string | null | undefined,
  code: string | null | undefined,
  hostsMounted: number,
): boolean {
  return (
    role === USER_ROLES.STUDENT &&
    (code === "account_paused" || code === "account_closed") &&
    hostsMounted > 0
  );
}

/**
 * Raise the card. Called by `client.ts` instead of redirecting, with the 401's
 * own code: `account_closed` is the closed state, and anything else is the
 * pause this always was.
 */
export function announceAccountPause(code?: string | null): void {
  held = code === "account_closed" ? "closed" : "paused";
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PAUSED_EVENT));
}

/** Whether a pause, or a closure, has landed on this page. */
export function isAccountPaused(): boolean {
  return held !== null;
}

/** Which one landed, or null. `useSyncExternalStore`'s snapshot. */
export function accountHold(): AccountHold | null {
  return held;
}

/** `useSyncExternalStore`'s subscribe. */
export function onAccountPause(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PAUSED_EVENT, listener);
  return () => window.removeEventListener(PAUSED_EVENT, listener);
}
