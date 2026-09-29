/**
 * Where the FastAPI backend lives. ONE place, because it moved.
 *
 * It was `https://api.nevolearning.com` until 28-29 Sep 2026, when the backend
 * moved to Render. The old host then answered every request with Render's
 * "Service Suspended" page, and because this default was repeated in five files
 * - the client, three proxy routes and the invoice-PDF check - the whole live
 * console went down with it while CI blamed "the backend being down".
 *
 * `NEXT_PUBLIC_API_URL` still wins when it is set (Vercel, local dev). This is
 * only what happens when it is not.
 */
export const DEFAULT_API_ORIGIN = "https://nevo-backend-2-0-kn3d.onrender.com";

export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_ORIGIN;

/**
 * Is this host our own API, however it is addressed?
 *
 * The configured origin, plus anything under nevolearning.com - the old API
 * host and the site itself, which older invoice rows may still name.
 */
export function isOwnApiHost(hostname: string): boolean {
  let configured: string | null = null;
  try {
    configured = new URL(API_ORIGIN).hostname;
  } catch {
    configured = null;
  }
  return hostname === configured || /(^|\.)nevolearning\.com$/.test(hostname);
}
