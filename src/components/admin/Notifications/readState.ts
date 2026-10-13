/**
 * How the sidebar's unread dot learns what the rest of the console did.
 *
 * The panel told it directly (`onReadStateChanged`), but the full Notifications
 * page had no path to it at all - so "Mark all read" there left the dot lit
 * until a reload. The page now announces a change with a window event, and
 * the sidebar, which is mounted around every admin screen, listens for it.
 */
export const READ_STATE_EVENT = "nevo:admin-notifications-changed";

export function announceReadStateChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(READ_STATE_EVENT));
}

/**
 * `GET /api/v1/notifications/unread-exists`, whatever its key.
 *
 * The contract types the body only as `{additionalProperties: boolean}` - an
 * object of booleans with NO named key - and the sidebar read `.exists`, a
 * name the contract never gives (its own test fixture used `unreadExists`).
 * So the answer is read from the value rather than guessed from a key: any
 * `true` in the object means something is unread. A bare boolean, which older
 * builds returned, is still accepted. Anything else reads as nothing new - a
 * missing dot is a far smaller failure than one nobody can clear.
 */
export function unreadFrom(res: unknown): boolean {
  if (typeof res === "boolean") return res;
  if (res && typeof res === "object") return Object.values(res).some((v) => v === true);
  return false;
}
