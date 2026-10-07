/**
 * Client-side auth session state (Product Arch A.2, backend Bearer contract).
 *
 * The FastAPI backend issues a Bearer access token on login (no cookie); the
 * token lives here - module state, mirrored to localStorage so a reload keeps
 * the session until `expiresAt`. The api client reads it per request.
 *
 * Separately, the device remembers WHO signs in here (`RememberedProfile`) -
 * the login screen is a returning-student PIN unlock (frame 00: avatar +
 * "Welcome back"), so school code and login identifier come from the device,
 * never typed at the PIN screen.
 */

import { deviceClockSkewMs } from "@/lib/api/serverClock";
import { rememberChild, rememberedChildren } from "./deviceRoster";

const SESSION_KEY = "nevo.auth.session";
const PROFILE_KEY = "nevo.auth.profile";
/** Prefix for the name a child chose, stored per account (`.<userId>`). */
const DISPLAY_NAME_KEY = "nevo.auth.displayName";

/**
 * Role mirror for the route guard (`src/proxy.ts`). localStorage is never
 * sent to the server, so a server-side guard cannot see the session at all -
 * this cookie carries the ROLE and its expiry only, never the token, so the
 * guard can cheaply tell "plausibly a signed-in teacher" before rendering a
 * single byte of console.
 *
 * It is client-written and therefore forgeable. It is an optimistic routing
 * hint, never an authorization boundary: the backend's Bearer check is the
 * only thing that actually protects data.
 */
export const ROLE_COOKIE = "nevo.role";

function writeRoleCookie(role: string, expiresAt: string): void {
  if (typeof document === "undefined") return;
  const expires = new Date(expiresAt);
  const stamp = Number.isNaN(expires.getTime())
    ? ""
    : `; Expires=${expires.toUTCString()}`;
  // Secure would drop the cookie on plain-http local dev.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax${stamp}${secure}`;
}

function deleteRoleCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function hasRoleCookie(): boolean {
  if (typeof document === "undefined") return false;
  const prefix = `${ROLE_COOKIE}=`;
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .some((c) => c.startsWith(prefix) && c.length > prefix.length);
}

export interface StoredSession {
  token: string;
  /** ISO timestamp from the backend's `expiresAt`. */
  expiresAt: string;
  userId: string;
  role: string;
  /**
   * How this account signed in, when the door that stored it knows. Only the
   * SSO callback says, and onboarding branches on it: an SSO child skips the
   * name, school and class steps and the PIN. It lived only in React state, so
   * a reload mid-onboarding put an SSO child on the manual path with an empty
   * draft. A refresh of the same account keeps it - see `setSession`.
   */
  method?: "sso" | "manual";
}

/**
 * Is this session past its expiry, as the SERVER would judge it?
 *
 * `expiresAt` is a server timestamp; `Date.now()` is a device one. Comparing
 * them directly meant a tablet with a wrong clock did not get a degraded
 * session - it got none:
 *
 *   - CLOCK AHEAD by more than a session's length: every session is expired the
 *     instant it is issued. A child types the correct PIN, receives a real
 *     token, and this discards it before the next read. Back to the PIN screen
 *     forever, with nothing on screen to explain it. A school tablet that lost
 *     its battery and came back on a default date is exactly this.
 *   - CLOCK BEHIND: quieter. The session looks alive long after it died, so the
 *     child is thrown out mid-lesson by a 401 instead, and
 *     `useLessonProgress.report()` silently drops everything after that moment.
 *
 * The correction is the server's own clock, which every HTTP response gives us
 * for nothing in its `Date` header - see `lib/api/serverClock`. Subtracting the
 * skew turns the device's "now" into the server's, so the comparison is once
 * again between two server timestamps.
 *
 * NOTHING IS WEAKENED BY THIS. A session the server considers expired is still
 * expired: correcting for skew does not extend a life, it locates "now"
 * correctly. Before any response has been seen the skew is 0 and this is
 * exactly the comparison that shipped.
 */
function hasExpired(s: StoredSession, deviceNow: number): boolean {
  const expiresAt = Date.parse(s.expiresAt);
  // An unreadable expiry is our problem or the server's, not the child's, and
  // signing them out for it would be the wrong way to be safe.
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= deviceNow - deviceClockSkewMs();
}

/** The device's remembered student - seeded at onboarding/PIN creation. */
export interface RememberedProfile {
  schoolCode: string;
  loginIdentifier: string;
  /**
   * What to call them on the lock screen. First name only, never the username.
   *
   * OPTIONAL, because the device genuinely may not know it. A PIN login returns
   * a session, not a profile, so the returning-sign-in screen has to go and ask
   * - and when that ask fails there is no name to remember. It used to store
   * the LOGIN IDENTIFIER in here as a stand-in, which put a string that is half
   * a credential on a pre-authentication screen, beside a school code every
   * child in the building knows.
   *
   * A lock screen with no name says "Welcome back" and nothing else. That is a
   * smaller cost than greeting a child as `amara.k`, and a far smaller one than
   * showing their username to whoever picks the tablet up next.
   */
  displayName?: string;
  /** Avatar initials, e.g. "AK". */
  initials: string;
  /**
   * The account this entry signs in as, recorded the first time a sign-in
   * succeeds from it. Never shown - it is how a signed-in screen finds ITS
   * child's entry on a shared tablet, rather than whichever child the device
   * happened to remember last. Absent on entries from before 30 Sep; the next
   * sign-in fills it.
   */
  userId?: string;
  /**
   * How many digits this child's PIN had the last time it opened this device.
   * The LENGTH, never the PIN.
   *
   * NO LONGER WRITTEN OR READ (D58, 6 Oct): "Four digits, four boxes", so
   * every PIN door draws four whatever a device remembers. Left on the type
   * so an entry stored before then still reads.
   */
  pinLength?: number;
}

let session: StoredSession | null = null;
let hydrated = false;
let orphanedRoleCookie = false;

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) session = JSON.parse(raw) as StoredSession;
  } catch {
    session = null;
  }
  /*
   * A ROLE WITH NO SESSION BEHIND IT.
   *
   * `setSession` writes the cookie, then the token, and a token write that
   * fails is swallowed - private browsing, a full disk, site data cleared
   * without its cookies. The tab carries on in memory; the next reload does
   * not. The guard then let the child through to the tabs on the cookie,
   * every screen found no token and drew the signed-out walkthrough, and the
   * PIN door bounced them straight back to it because the cookie still said
   * "student". Signed in as far as the server could tell, signed out as far
   * as the app could, and no way to the one screen that would fix it.
   *
   * The cookie only ever mirrors this session, so with no session here it
   * describes nothing. Dropping it opens the doors again, and the shell sends
   * the child to one.
   */
  if (!session && hasRoleCookie()) {
    orphanedRoleCookie = true;
    deleteRoleCookie();
  }
}

/**
 * Did this page load arrive on a role cookie whose session was gone?
 *
 * True at most for the load that found it - the cookie is deleted in the same
 * breath - and only ever about THIS device's storage. A session that expired
 * clears its own cookie and is not this.
 */
export function arrivedWithoutSession(): boolean {
  hydrate();
  return orphanedRoleCookie;
}

export function getSession(): StoredSession | null {
  hydrate();
  if (session && hasExpired(session, Date.now())) clearSession();
  return session;
}

export function getToken(): string | undefined {
  return getSession()?.token;
}

export function setSession(incoming: StoredSession): void {
  hydrate();
  // A token refresh is the same account and does not say how it signed in.
  const method =
    incoming.method ??
    (session?.userId === incoming.userId ? session.method : undefined);
  const next = method ? { ...incoming, method } : incoming;
  hydrated = true;
  session = next;
  writeRoleCookie(next.role, next.expiresAt);
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // Private mode etc. - the in-memory session still works for this tab.
  }
  announceSessionChange();
}

export function clearSession(): void {
  hydrated = true;
  session = null;
  deleteRoleCookie();
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  announceSessionChange();
}

const SESSION_EVENT = "nevo:session-change";

/**
 * Deferred a microtask, not dispatched inline: `getSession()` clears an expired
 * session while it is being READ, which can be during a render, and a listener
 * setting state from inside another component's render is an error.
 */
function announceSessionChange(): void {
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    try {
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch {
      // An environment without events has nothing listening either.
    }
  });
}

/**
 * Be told when the signed-in account may have changed - in this tab (sign-in,
 * sign-out, a hand-over) or another one (`storage`).
 *
 * THE TABLET IS SHARED, AND NOTHING USED TO NOTICE WHO WAS HOLDING IT. Anything
 * mounted once at the root - the notification feed, the accessibility
 * preferences - read the session when the app loaded and never again, so the
 * next child to sign in inherited the last child's feed and text size. Each
 * listener re-reads `getSession()` and compares the user id itself: a token
 * refresh fires this too, and is the same child.
 */
export function onSessionChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(SESSION_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(SESSION_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getRememberedProfile(): RememberedProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as RememberedProfile) : null;
  } catch {
    return null;
  }
}

/**
 * Called when a student finishes onboarding / creates a PIN on this device.
 *
 * WRITES BOTH THE LEGACY KEY AND THE ROSTER, and the delegation lives here on
 * purpose. Every path that remembers a child goes through this function -
 * onboarding's `rememberOnboardedStudent` and the returning sign-in screen - so
 * doing it at the call sites would have been two places to forget. Without the
 * roster write, a newly onboarded child would never appear in 28c's picker: it
 * would only ever show children migrated from the old single-profile key, and
 * would empty out school by school as those aged out.
 *
 * The legacy key is still written because `getRememberedProfile` still backs
 * `setStoredDisplayName`. It no longer picks a door: sign-out and Forgot PIN
 * both go to `/auth/login`, which handles a device that remembers nobody.
 */
export function rememberProfile(profile: RememberedProfile): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
  rememberChild(profile);
}

/**
 * The name the SIGNED-IN child chose for themselves, as this device holds it.
 *
 * KEYED BY ACCOUNT, because the tablet is shared. This used to read the one
 * legacy remembered profile - which is whichever child the device remembered
 * LAST, not the child holding it. So a child who unlocked through the picker
 * was called by another child's name on Home, the sidebar and Profile, and a
 * rename wrote itself into that other child's entry. Now: the name saved under
 * this account's id, else this account's own roster entry, else nothing - and
 * the caller falls back to the account itself (`users/me`, settings).
 */
export function getStoredDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  const userId = getSession()?.userId;
  if (!userId) return null;
  try {
    const chosen = window.localStorage.getItem(`${DISPLAY_NAME_KEY}.${userId}`);
    if (chosen?.trim()) return chosen.trim();
  } catch {
    // Unreadable storage is no stored name; the account still has one.
  }
  const own = rememberedChildren().find((c) => c.userId === userId);
  return own?.displayName?.trim() || null;
}

/**
 * Save the name the signed-in child chose, for THIS child only.
 *
 * Written under the account's id, and into the roster entry that belongs to
 * this account so the picker learns it too. An entry is only ever matched by
 * account id - never by "the one the device remembers", which is the bug this
 * replaces. The legacy single-profile key is updated only when it is provably
 * the same child.
 */
export function setStoredDisplayName(name: string, initials: string): void {
  const trimmed = name.trim();
  const userId = getSession()?.userId;
  if (!trimmed || !userId) return;
  try {
    window.localStorage.setItem(`${DISPLAY_NAME_KEY}.${userId}`, trimmed);
  } catch {
    // Private mode - the name simply will not survive this session.
  }
  const own = rememberedChildren().find((c) => c.userId === userId);
  if (own) rememberChild({ ...own, displayName: trimmed, initials });
  const legacy = getRememberedProfile();
  if (legacy?.userId === userId) {
    try {
      window.localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({ ...legacy, displayName: trimmed, initials }),
      );
    } catch {
      // ignore
    }
  }
}
