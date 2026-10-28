import { getSession } from "@/lib/auth/session";

/**
 * A teacher's unsaved work, kept on this device while the session lapses
 * (SCRUM-246, part 2: "SESSION EXPIRING: no dialog, keep the work ... hold
 * unsaved edits locally, and when the teacher signs back in the edits are
 * still there on that page").
 *
 * KEYED BY ACCOUNT. The tablet is shared, so a draft is only ever offered
 * back to the person who wrote it: the key carries their user id, and nothing
 * is read without a session to say whose it is. A deliberate sign-out clears
 * that person's drafts; only a lapse keeps them.
 *
 * A CONVENIENCE, NOT A RECORD. Browser storage can be empty or refuse a write
 * (a private window, cleared site data), so every touch is guarded and a
 * draft that cannot be kept is simply not offered. Nothing that has to
 * survive lives here: a saved edit is the server's.
 */

const PREFIX = "nevo.draft.";
/** Older than this is not offered back: a week-old note is not "unsaved work". */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  value: T;
  /** ISO 8601, when it was last written. */
  at: string;
}

function storageKey(key: string): string | null {
  const userId = getSession()?.userId;
  return userId ? `${PREFIX}${userId}.${key}` : null;
}

export function readKeptDraft<T>(key: string): Stored<T> | null {
  const k = storageKey(key);
  if (!k || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(k);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<T>;
    if (!stored || typeof stored.at !== "string" || Date.now() - Date.parse(stored.at) > KEEP_MS) {
      window.localStorage.removeItem(k);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function writeKeptDraft<T>(key: string, value: T): void {
  const k = storageKey(key);
  if (!k || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(k, JSON.stringify({ value, at: new Date().toISOString() }));
  } catch {
    // Storage refused it. The work is still on screen; it just won't be kept.
  }
}

export function clearKeptDraft(key: string): void {
  const k = storageKey(key);
  if (!k || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(k);
  } catch {
    // Nothing to do.
  }
}

/** Every draft the signed-in person left. Called on a deliberate sign-out. */
export function clearAllKeptDrafts(): void {
  const userId = getSession()?.userId;
  if (!userId || typeof window === "undefined") return;
  try {
    const mine = `${PREFIX}${userId}.`;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(mine)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    // Nothing to do.
  }
}
