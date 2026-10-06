/**
 * Base API client for the Nevo FastAPI backend (FE Architecture §9).
 *
 * All backend calls go through here:
 * - Base URL per environment (`NEXT_PUBLIC_API_URL`)
 * - Auth token attached automatically (once the auth contract exists)
 * - Standardized, user-friendly error handling — never surface raw technical
 *   errors (Design System error-state patterns)
 * - Request/response logging in development
 *
 * Gemini is NEVER called from here — all AI goes through the backend gateway.
 */

import { clearSession, getSession, getToken } from "@/lib/auth/session";
import {
  announceAccountPause,
  pauseHostsMounted,
  pausesInPlace,
} from "@/lib/auth/accountPause";
import { withdrawnDoor } from "@/lib/auth/consentHold";
import { noteServerClock } from "./serverClock";
import { isAdminRole } from "@/lib/constants/permissions";
import { API_ORIGIN } from "./upstream";

// Default: the same-origin catch-all proxy (`app/api/backend/[...path]`),
// which forwards to the FastAPI backend - the backend has no CORS headers, so
// browsers cannot call it directly. Set `NEXT_PUBLIC_API_DIRECT=1` alongside
// `NEXT_PUBLIC_API_URL` to bypass the proxy once CORS lands.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_DIRECT === "1" ? API_ORIGIN : "/api/backend";

const isDev = process.env.NODE_ENV === "development";

/** Thrown for any non-2xx response or network failure. `message` is user-safe. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The backend's own EXPLANATION, out of the same error body `apiErrorCode`
 * reads. `{ detail: { code, message } }`, and on a 422 the message is written
 * for the person who has to act on it.
 *
 * WORTH READING RATHER THAN SWALLOWING. Backend rewrote the term-dates 422 on
 * 22 Sep from Pydantic's stock *"List should have at most 3 items"* to a
 * sentence that says one invoice is issued per term start - and a screen that
 * catches with `() => setPhase("failed")` throws that away and shows "that
 * didn't save" instead. Where the server has troubled to explain, show the
 * explanation.
 *
 * Null for any shape that is not that, so a caller falls back to its own
 * generic line rather than rendering `undefined`.
 */
export function apiErrorMessage(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const inner = (detail as { detail?: unknown }).detail;
  if (!inner || typeof inner !== "object") return null;
  const message = (inner as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

/**
 * The backend's own name for what went wrong, out of an error body.
 *
 * FastAPI nests it: `{ detail: { code, message } }`, so `ApiError.detail` is the
 * OUTER object and the code is one level in. Lived next to the parent-auth
 * client because that is where it was first needed; it belongs here, beside the
 * error it reads.
 *
 * Returns null for any shape that is not that - an older deployment, a proxy's
 * own error page, a plain string detail. A caller that cannot name the cause
 * must fall back to its generic case rather than guess, because guessing here
 * means telling a child the wrong thing about their own account.
 */
export function apiErrorCode(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const inner = (detail as { detail?: unknown }).detail;
  if (!inner || typeof inner !== "object") return null;
  const code = (inner as { code?: unknown }).code;
  return typeof code === "string" && code ? code : null;
}

/**
 * The backend's own reference for an error nobody planned for.
 *
 * WHAT THIS IS FOR. A 500 reaches a teacher as "something went wrong on our
 * side", which is all we can honestly say and all they can honestly report.
 * A staged upload answered 500 on ~18 Sep and backend could not find it from
 * their side at all; there was nothing to match on. Every unhandled error
 * carries an `incidentId` now, and `ApiError.detail` has held the parsed
 * body all along - so the id already reaches this client and is dropped.
 * This is the reader that stops it being dropped.
 *
 * NOT IN THE CONTRACT, deliberately on their side and awkwardly on ours:
 * `incidentId` appears nowhere in the deployed OpenAPI document, because an
 * UNHANDLED error is by definition not a documented response. Backend's own
 * words on that, 23 Sep: *"you're right that this means you're reading a
 * field you can't type, and I don't have a good answer for that beyond this
 * paragraph."*
 *
 * WHAT THAT PARAGRAPH SETTLED. It is **exactly twelve lowercase hex
 * characters** - `uuid4().hex[:12]` - and it is **always nested under
 * `detail`**, beside `code: "unexpected_error"` and a message. Never at the
 * top level, so the second position this used to check is gone.
 *
 * The 64-character bound stays anyway. It costs nothing, it is the thing
 * that refuses a Starlette error page, and backend has said they will tell
 * us before lengthening the id rather than after.
 *
 * REFUSES ANYTHING THAT IS NOT AN IDENTIFIER. A plain-text 500 - Starlette's
 * default page, which is exactly what that 18 Sep failure returned - leaves
 * `detail` as a long string, and a proxy's own error page can carry a
 * `detail` object of its own. Printing either at a teacher under "quote
 * this" would be worse than printing nothing: they would quote it, and it
 * would match nothing.
 */
export function incidentId(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  // One position, confirmed. FastAPI nests its error bodies and this rides
  // with them, the same way `apiErrorCode` reads `detail.code`.
  const value = ((detail as { detail?: unknown }).detail as {
    incidentId?: unknown;
  })?.incidentId;
  if (typeof value !== "string") return null;
  const id = value.trim();
  // An identifier, not a sentence: no spaces, and short enough to read aloud
  // down a phone line, which is how this will actually be quoted.
  return id.length > 0 && id.length <= 64 && !/\s/.test(id) ? id : null;
}

/** User-friendly message per the Design System — never raw technical errors. */
function friendlyMessage(status: number): string {
  if (status === 0)
    return "Something went wrong. Please check your connection and try again.";
  if (status === 401) return "You need to sign in again to continue.";
  if (status === 403)
    return "You don't have access to this. Ask an admin who manages permissions for your school.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status >= 500)
    return "Something went wrong on our end. Please try again shortly.";
  return "Something went wrong. Please try again.";
}

// The backend issues Bearer access tokens on login (no cookies); the token
// lives in the client session store and rides every request from here.
async function getAuthToken(): Promise<string | undefined> {
  return getToken();
}

/**
 * A 401/403 on a request we DID send a token with means the session died
 * mid-use. Clear it and send the person to their door - otherwise the
 * console quietly degrades to sample data while they still believe they're
 * signed in.
 *
 * Two exemptions matter. Sign-in and sign-out own their failures: a wrong
 * password must surface the sign-in screen's own message, never bounce the
 * visitor. And a request sent WITHOUT a token was never authenticated, so
 * its 401 is expected, not a death.
 */
/**
 * Which session-expired screen a role belongs on.
 *
 * Exported and pure so it can be tested directly: jsdom makes
 * `window.location.assign` non-configurable, so neither a stub nor a spy can
 * observe where `handleAuthFailure` actually sent someone. Extracting the
 * choice moves the half that can be wrong somewhere it can be checked.
 *
 * The backend's admin roles are `senco_admin` and `other_admin`, never a plain
 * "admin" - which is why this asks `isAdminRole` rather than comparing.
 */
export function sessionExpiredDoor(
  role: string | undefined,
  /**
   * The backend's own reason code, carried to the door as `?reason=`.
   *
   * It has to travel on the URL: the door is a full page load
   * (`window.location.assign`) and the session it came from has already been
   * cleared, so there is nowhere else left to read it from. Unrecognised and
   * absent both resolve to the ordinary screen, so an unknown value on the
   * query string can only ever under-claim.
   */
  code?: string | null,
  /**
   * Where the person was when it ended, carried as `?next=` so signing back in
   * returns them there - IA 31: "Log back in -> Student Login Screen (lesson
   * position preserved)". The learner door only, and only a student route: the
   * staff doors' sign-in links do not read it, and anything else is not a
   * place the child's door should send them.
   */
  from?: string | null,
): string {
  const base =
    role === "teacher"
      ? "/auth/teacher/session-expired"
      : isAdminRole(role)
        ? "/auth/admin/session-expired"
        : "/auth/session-expired";
  const query = [
    code ? `reason=${encodeURIComponent(code)}` : null,
    base === "/auth/session-expired" && from?.startsWith("/student")
      ? `next=${encodeURIComponent(from)}`
      : null,
  ].filter(Boolean);
  return query.length ? `${base}?${query.join("&")}` : base;
}

/**
 * One dead token, one redirect.
 *
 * A console screen has several reads in flight at once, so a token that has
 * expired comes back 401 on all of them together. Without this latch the
 * first call read the role and left for the right door, and every later one
 * found the session ALREADY CLEARED, resolved no role, and re-assigned to the
 * student screen - last write winning. A teacher was reliably sent to the
 * child's session screen by a race, not by anything about their session.
 */
let redirecting = false;

function handleAuthFailure(
  path: string,
  sentToken: boolean,
  detail?: unknown,
): void {
  if (typeof window === "undefined" || !sentToken || redirecting) return;
  // Only the sign-in and sign-out calls own their failures. The session
  // check must NOT be exempt: it is the one call that discovers a dead
  // token, and exempting it left the student browsing an app that still
  // looked signed in.
  if (path.includes("/auth/login") || path.includes("/auth/logout")) return;
  const role = getSession()?.role;
  const code = apiErrorCode(detail);
  // A child's pause is shown where they are (28b), over the lesson, rather
  // than by leaving it. The session stays until they tap Okay - see
  // `accountPause.ts` for why, and for the case with nothing to draw it.
  if (pausesInPlace(role, code, pauseHostsMounted())) {
    redirecting = true;
    announceAccountPause();
    return;
  }
  clearSession();
  // Every console now lands on a screen that SAYS the session ended, rather
  // than reappearing as a sign-in form with no explanation - design shipped
  // the shared teacher/admin frame on 31 Aug. The role is read before
  // `clearSession` above, which is the only moment it is still known, and it
  // picks the door the screen offers. The backend's admin roles are
  // `senco_admin` and `other_admin`, never a plain "admin".
  redirecting = true;
  window.location.assign(
    sessionExpiredDoor(
      role,
      code,
      `${window.location.pathname}${window.location.search}`,
    ),
  );
}

/**
 * A child whose parent withdrew consent goes to the held screen (B7) rather
 * than meeting each refused call's own generic failure. The decision is
 * `withdrawnDoor`; this only acts on it, once, behind the same latch.
 */
function holdIfWithdrawn(status: number, detail: unknown): void {
  if (typeof window === "undefined" || redirecting) return;
  const door = withdrawnDoor(
    getSession()?.role,
    status,
    apiErrorCode(detail),
    window.location.pathname,
  );
  if (!door) return;
  redirecting = true;
  window.location.assign(door);
}

/** An array repeats the key - see `buildUrl`. */
type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serializable request body. */
  body?: unknown;
  /** Query-string params. */
  params?: Record<string, QueryValue>;
  /** Override the environment base URL (e.g. a public endpoint on a different host). */
  baseUrl?: string;
}

function buildUrl(
  path: string,
  params?: Record<string, QueryValue>,
  baseUrl: string = BASE_URL,
): string {
  const joined = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  // A relative base (the same-origin proxy) resolves against the current
  // origin in the browser; seams only run client-side, localhost is the
  // SSR-safety fallback.
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";
  const url = new URL(joined, origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      /*
       * AN ARRAY REPEATS THE KEY. `String(["a","b"])` is "a,b", so a list used
       * to leave as ONE comma-joined value - which is not what any endpoint
       * here asks for. `GET /api/admin/adaptation-log?eventType=` documents
       * "repeat the parameter to pass more than one", and FastAPI reads
       * repeats, never a joined string.
       *
       * An EMPTY array sends nothing at all, rather than an empty value: "no
       * filter" and "filter on nothing" are different requests, and the second
       * one would return nothing on a screen that meant to show everything.
       */
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null) {
            url.searchParams.append(key, String(item));
          }
        }
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, params, headers, baseUrl, ...rest } = options;
  const url = buildUrl(path, params, baseUrl);
  const token = await getAuthToken();

  // FormData carries its own multipart boundary, which only the browser can
  // generate - so it must be passed through untouched and its Content-Type
  // left unset. Everything else is JSON.
  const multipart = body instanceof FormData;

  const init: RequestInit = {
    ...rest,
    // Cookie auth by default; overridable for public cross-origin endpoints
    // (credentialed requests break under a wildcard CORS policy).
    credentials: rest.credentials ?? "include",
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !multipart
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined
      ? { body: multipart ? (body as FormData) : JSON.stringify(body) }
      : {}),
  };

  if (isDev) console.debug(`[api] ${rest.method ?? "GET"} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    if (isDev) console.error(`[api] network error ${url}`, cause);
    throw new ApiError(0, friendlyMessage(0), cause);
  }
  // Read from EVERY response, success or failure - a 401 tells us the time as
  // reliably as a 200, and a device with a bad clock is likelier to be seeing
  // failures.
  noteServerClock(response);

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text().catch(() => undefined);
    }
    if (isDev) console.error(`[api] ${response.status} ${url}`, detail);
    // 401 ONLY. A 403 means the token was accepted as identity and the ACTION
    // was refused - a scope this admin does not hold. Treating it as a dead
    // session cleared the token and sent them to a door reading "your session
    // has ended ... for your security", which is a false explanation and loses
    // whatever they were doing. Scope filtering is client-side only
    // (`proxy.ts` checks role, never scope), so a bookmarked or deep-linked
    // route reaches a 403-able endpoint routinely, and a school with more than
    // one admin hits this on day one.
    if (response.status === 401) {
      handleAuthFailure(path, Boolean(token), detail);
    }
    holdIfWithdrawn(response.status, detail);
    throw new ApiError(
      response.status,
      friendlyMessage(response.status),
      detail,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * The same request, kept as BYTES.
 *
 * `request` ends in `response.json()`, so a PDF could not go through it - and
 * the invoice list therefore rendered `<a href={pdfUrl}>`, a top-level
 * navigation that carries no Authorization header to a Bearer-protected route.
 * Every invoice PDF in the console answered 401 (or, for a backend-relative
 * `pdfUrl`, resolved against the Next origin and 404'd), with no other route to
 * the document anywhere on the screen.
 *
 * Auth, the proxy and the 401 latch are all shared with `request` deliberately:
 * a second hand-rolled fetch with its own `Authorization` header is how the
 * session handling drifts apart.
 */
export async function requestBlob(
  path: string,
  // A GET has no body, and `RequestOptions.body` is `unknown` - which is not a
  // `BodyInit` - so it is typed out rather than discarded at the call site.
  options: Omit<RequestOptions, "body"> = {},
): Promise<Blob> {
  const { params, headers, baseUrl, ...rest } = options;
  const url = buildUrl(path, params, baseUrl);
  const token = await getAuthToken();

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      method: "GET",
      credentials: rest.credentials ?? "include",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (cause) {
    throw new ApiError(0, friendlyMessage(0), cause);
  }

  if (!response.ok) {
    if (response.status === 401) handleAuthFailure(path, Boolean(token));
    throw new ApiError(response.status, friendlyMessage(response.status));
  }
  return response.blob();
}

/** Convenience verbs over `request`. */
export const api = {
  /** A GET that keeps the bytes - see `requestBlob`. */
  blob: (path: string, options?: Omit<RequestOptions, "body">) =>
    requestBlob(path, options),
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export { BASE_URL };
