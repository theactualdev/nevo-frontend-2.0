import {
  ApiError,
  signalsApi,
  type SignalEvent,
  type SignalSessionEnvelope,
} from "@/lib/api";
import { getSession, onSessionChange } from "@/lib/auth/session";
import { SIGNAL_BATCH } from "@/lib/constants";

/**
 * Signals a lesson could not send before it was gone.
 *
 * `useSignals` keeps its queue in a ref, and that is correct for exactly as
 * long as the screen that owns it is mounted. Three exits ended it early, and
 * each took the queue with it: leaving a lesson while offline (the failed
 * batch was re-queued into a ref nothing would flush again), a session dying
 * mid-lesson (a 401 anywhere clears the token and hard-navigates to the
 * session-ended screen, so the unload found nothing it could send with), and
 * the tab simply closing on a failed send.
 *
 * Held here instead: outside the hook, across the navigation, and delivered
 * the next time this child is signed in and online - on `online`, when a
 * session appears, and whenever a signal stream starts.
 *
 * ONLY EVER TO THE CHILD WHO PRODUCED THEM. These devices are shared; an entry
 * belonging to anyone else is left alone, not sent and not deleted, the same
 * rule `pendingProgress` and `pendingBaseline` follow.
 *
 * NOT A SECOND SEND. Nothing goes in here that has been posted, so nothing
 * here can arrive twice: an event duplicated in the record is a hesitation the
 * child never had.
 *
 * NOT PAST THE CHILD'S SESSION (19 Oct browser-storage audit). These include
 * how a child said they felt at a break (`feeling_checkin`), and they sat on
 * a shared tablet until that child happened to sign in there again. Now the
 * session ending - Sign out, a door's Back, a lapse, a closed account, the
 * next child signing in over it - gives them one last try and deletes them
 * (`forgetSignals`). A lapse usually means the token is dead too, so that try
 * is likely to fail: it is still the one they get.
 */

const KEY = "nevo.signals.outbox";

/** A week, like the sibling stores. Older evidence is not worth a late send. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Bounds what one child's backlog can cost the device. Newest kept. */
const MAX_HELD_PER_CHILD = 1_000;

interface HeldBatch {
  userId: string;
  session: SignalSessionEnvelope;
  events: SignalEvent[];
  heldAt: number;
}

function read(): HeldBatch[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HeldBatch[]) : [];
  } catch {
    return [];
  }
}

function write(batches: HeldBatch[]): void {
  try {
    if (batches.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(batches));
  } catch {
    // Private mode or a full quota: the in-memory queue is all there is.
  }
}

/**
 * Children whose guardian has withdrawn consent, as reported to this page.
 *
 * SCRUM-80: a withdrawal - and only a withdrawal - stops processing. What was
 * held for them is deleted and nothing more is kept or delivered. For the life
 * of the page only: the next page asks the consent gate again, and a guardian
 * who consents again is not overruled by a stale list on a shared tablet.
 */
const withheld = new Set<string>();

/** Delete everything held for `userId`, and hold and deliver nothing more. */
export function withholdSignals(userId: string): void {
  if (!userId) return;
  withheld.add(userId);
  const all = read();
  const kept = all.filter((b) => b.userId !== userId);
  if (kept.length !== all.length) write(kept);
}

/**
 * Children whose session ended on this page (19 Oct browser-storage audit).
 * What they left unsent has had its last try and is gone, and nothing more is
 * held for them here: a stream still open as they go - a pagehide, a failed
 * send coming back late - would otherwise write it straight back. Lifted the
 * moment they are signed in again.
 */
const signedOut = new Set<string>();

/** How long the last try at sign-out may take before it is abandoned. */
const LAST_TRY_MS = 4_000;

/**
 * One try, and only one, at sending a leaving child's events: with the token
 * their session held, `keepalive` so the navigation that follows a sign-out
 * does not cancel it, and abandoned after `LAST_TRY_MS`. Nothing waits for it
 * and nothing is kept for a second try, whatever it comes to. Shared with
 * `useSignals`, for a stream still open when its child signs out.
 */
export function lastTry(
  session: SignalSessionEnvelope,
  events: SignalEvent[],
  token: string,
): void {
  if (!token || events.length === 0) return;
  const PER = SIGNAL_BATCH.MAX_EVENTS_PER_REQUEST;
  for (let i = 0; i < events.length; i += PER) {
    const bound = new AbortController();
    const timer = setTimeout(() => bound.abort(), LAST_TRY_MS);
    try {
      void signalsApi
        .submitBatch(session, events.slice(i, i + PER), {
          keepalive: true,
          token,
          signal: bound.signal,
        })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    } catch {
      clearTimeout(timer);
    }
  }
}

/**
 * A child's session has ended on this device: one last try at what they left
 * unsent, then it is deleted, whatever the try comes to.
 *
 * THEIRS AND NOBODY ELSE'S. Another child's held events stay where they are,
 * for that child's next sign-in. Deleted BEFORE the try rather than after
 * it: the page is usually about to unload, and a deletion left waiting on a
 * response would not happen. A withdrawn child's are deleted untried, as
 * they always were.
 */
export function forgetSignals(userId: string, token: string): void {
  if (!userId) return;
  signedOut.add(userId);
  const all = read();
  const theirs = all.filter((b) => b.userId === userId);
  if (theirs.length === 0) return;
  write(all.filter((b) => b.userId !== userId));
  if (withheld.has(userId)) return;
  const now = Date.now();
  for (const held of theirs) {
    if (now - held.heldAt <= MAX_AGE_MS) lastTry(held.session, held.events, token);
  }
}

/** Keep `events` for `userId` until they can be sent. */
export function holdSignals(
  userId: string,
  session: SignalSessionEnvelope,
  events: SignalEvent[],
): void {
  if (!userId || events.length === 0 || withheld.has(userId)) return;
  if (signedOut.has(userId)) {
    if (getSession()?.userId !== userId) return;
    signedOut.delete(userId);
  }
  const all = [...read(), { userId, session, events, heldAt: Date.now() }];
  // Cap this child's share, oldest batches first.
  let mine = all
    .filter((b) => b.userId === userId)
    .reduce((n, b) => n + b.events.length, 0);
  const kept = all.filter((b) => {
    if (b.userId !== userId || mine <= MAX_HELD_PER_CHILD) return true;
    mine -= b.events.length;
    return false;
  });
  write(kept);
}

let delivering: Promise<void> | null = null;

/**
 * Send whatever the signed-in child has waiting. One run at a time: two
 * overlapping runs would read the same entries and post them twice.
 */
export function deliverHeldSignals(): Promise<void> {
  delivering ??= deliver().finally(() => {
    delivering = null;
  });
  return delivering;
}

async function deliver(): Promise<void> {
  const session = getSession();
  if (!session?.token) return;
  // Nothing of a withdrawn child's goes - and anything another tab has held
  // for them since is deleted, not left for a later page to send.
  if (withheld.has(session.userId)) {
    withholdSignals(session.userId);
    return;
  }
  const now = Date.now();
  const all = read();
  const fresh = all.filter((b) => now - b.heldAt <= MAX_AGE_MS);
  const mine = fresh.filter((b) => b.userId === session.userId);
  if (mine.length === 0) {
    if (fresh.length !== all.length) write(fresh);
    return;
  }
  // Taken out BEFORE sending, so a second tab reading meanwhile finds nothing
  // to send twice. Anything that fails is put back below.
  write(fresh.filter((b) => b.userId !== session.userId));

  const PER = SIGNAL_BATCH.MAX_EVENTS_PER_REQUEST;
  for (const held of mine) {
    for (let i = 0; i < held.events.length; i += PER) {
      // A withdrawal reported while this ran stops the rest of it.
      if (withheld.has(session.userId)) return;
      const chunk = held.events.slice(i, i + PER);
      try {
        await signalsApi.submitBatch(held.session, chunk);
      } catch (cause) {
        const status = cause instanceof ApiError ? cause.status : 0;
        // A contract refusal would be refused again, identically. Anything
        // else - offline, the server, a session that died again - keeps.
        if (status === 401 || status === 0 || status >= 500) {
          holdSignals(session.userId, held.session, held.events.slice(i));
          break;
        }
      }
    }
  }
}

let installed = false;

/**
 * Deliver on the two moments a held batch becomes sendable. Installed once per
 * page and never removed: the point is to outlive the screen that held them.
 */
export function installSignalDelivery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("online", () => void deliverHeldSignals());
  // A token refresh fires this too and finds nothing new; it costs one read.
  onSessionChange(() => void deliverHeldSignals());
}
