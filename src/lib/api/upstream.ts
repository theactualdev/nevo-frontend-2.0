/**
 * Where the FastAPI backend lives. ONE place, because it moves.
 *
 * It was `https://api.nevolearning.com` until 28-29 Sep 2026, then
 * `https://nevo-backend-2-0-kn3d.onrender.com` until 17 Oct, when that Render
 * service was suspended and the API answered at api.nevolearning.com again.
 * Both moves showed the same way: a dead host answers every request with
 * Render's "Service Suspended" page, and the whole live console goes down with
 * it while CI blames "the backend being down". So the default lives here and
 * nowhere else.
 *
 * `NEXT_PUBLIC_API_URL` still wins when it is set (Vercel, local dev). This is
 * only what happens when it is not.
 */
export const DEFAULT_API_ORIGIN = "https://api.nevolearning.com";

export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_ORIGIN;

/**
 * The Render addresses the API has answered from. `nevo-backend-2-0` is the
 * service behind api.nevolearning.com (same spec, 17 Oct); `-kn3d` was the API
 * from 29 Sep to 17 Oct, and invoice rows written then may still name it.
 * `-zxoz` is the service behind api.nevolearning.com since 25 Oct, when the
 * domain moved to it; links may name either.
 */
const RENDER_API_HOSTS = new Set([
  "nevo-backend-2-0.onrender.com",
  "nevo-backend-2-0-kn3d.onrender.com",
  "nevo-backend-2-0-zxoz.onrender.com",
]);

/**
 * Is this host our own API, however it is addressed?
 *
 * The configured origin, the Render addresses above, and anything under
 * nevolearning.com - the API host and the site itself, which older invoice
 * rows may still name.
 */
export function isOwnApiHost(hostname: string): boolean {
  let configured: string | null = null;
  try {
    configured = new URL(API_ORIGIN).hostname;
  } catch {
    configured = null;
  }
  return (
    hostname === configured ||
    RENDER_API_HOSTS.has(hostname) ||
    /(^|\.)nevolearning\.com$/.test(hostname)
  );
}
