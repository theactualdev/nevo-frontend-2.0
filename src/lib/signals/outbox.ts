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

/** Keep `events` for `userId` until they can be sent. */
export function holdSignals(
  userId: string,
  session: SignalSessionEnvelope,
  events: SignalEvent[],
): void {
  if (!userId || events.length === 0) return;
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
