import { lessonsApi } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import type { LessonStatus } from "@/lib/api/lessons";

/**
 * Where a child got to, when the write did not land.
 *
 * `useLessonProgress` already holds the newest failed write and re-sends it on
 * `online` - and that mechanism is correct, for exactly as long as the player
 * stays mounted. It held it in a REF, and registered the `online` listener in
 * the same hook, so both died the moment the player unmounted.
 *
 * Which is the one moment it was guaranteed to be needed. A child offline
 * mid-lesson is shown a banner saying we will save where they got to when they
 * are back; they tap X, and a dialog headed "Your progress is saved" offers
 * "Leave for now". Taking it fires one more doomed write and immediately routes
 * away - unmounting the hook, removing the listener, and dropping the buffer.
 * When the connection returned there was nothing left to send, and the child
 * re-read the segments they had already done.
 *
 * So the two screens that explicitly promise recovery were the two that
 * guaranteed it could not happen.
 *
 * Held here instead: outside the hook, outside the player, and across the
 * navigation.
 *
 * ONE SHELF PER CHILD, and one slot per play session. These were keyed by
 * lesson alone in one shared store, so on a school tablet child B's landed
 * write cleared child A's held place for the same lesson, and B's failed one
 * overwrote it. A child's owner check on the way OUT was not enough; the
 * store itself has to be theirs, the way `savedLessons` already is. And a
 * slot per session, because a completion held from yesterday is not
 * superseded by today's first segment - both are true, and the second must
 * not erase the first.
 */

const LEGACY_KEY = "nevo.lesson.pendingProgress";
const keyFor = (userId: string) => `${LEGACY_KEY}.${userId}`;

/** A position from another week is not worth restoring over a newer one. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface PendingWrite {
  /**
   * The child this position belongs to.
   *
   * Not optional thinking: these devices are shared. Without it, `flush` gated
   * on "is anyone signed in", which on a school tablet means child A's held
   * position is written to child B's record the moment B signs in and any
   * student screen mounts. The sibling store for baselines was built with this
   * guard because a shared tablet was the whole point of it; this one was
   * written an hour later and did not carry the lesson across.
   */
  userId: string;
  lessonId: string;
  /**
   * NULL WHEN THE SESSION NEVER OPENED. `PUT /progress` needs one, so the
   * flush opens a session first rather than dropping the position - a lesson
   * opened from Downloads with no connection never gets one at all, and was
   * recorded as never having been played.
   */
  sessionId: string | null;
  /** Which set work this was, so a replay files it where the live write would. */
  assignmentId?: string;
  status: LessonStatus;
  segment?: number;
  module?: number;
  heldAt: number;
}

type Store = Record<string, PendingWrite>;

/** One slot per session; a position with no session gets its player's own. */
const slotFor = (lessonId: string, session: string) => `${lessonId}:${session}`;

function readRaw(key: string): Store {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(userId: string, store: Store): void {
  try {
    if (Object.keys(store).length === 0) {
      window.localStorage.removeItem(keyFor(userId));
    } else {
      window.localStorage.setItem(keyFor(userId), JSON.stringify(store));
    }
  } catch {
    // Private mode or a full quota. The in-memory re-send still covers the
    // case where the player stays open; this only adds surviving the exit.
  }
}

/**
 * The old single store, keyed by lesson, moved onto each owner's own shelf.
 * Every entry carried its owner, so nothing is guessed in the move.
 */
function migrateLegacy(): void {
  let legacy: Record<string, Omit<PendingWrite, "lessonId">>;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    legacy = JSON.parse(raw);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    return;
  }
  for (const [lessonId, entry] of Object.entries(legacy ?? {})) {
    if (!entry?.userId || !entry.sessionId) continue;
    const store = readRaw(keyFor(entry.userId));
    store[slotFor(lessonId, entry.sessionId)] = { ...entry, lessonId };
    write(entry.userId, store);
  }
}

function read(userId: string): Store {
  migrateLegacy();
  return readRaw(keyFor(userId));
}

/**
 * Remember a write that did not land, replacing any older one from the same
 * session.
 *
 * `owner` is taken when the write was MADE, not when it failed: a 401 clears
 * the session before the failure arrives here, and reading it then found
 * nobody to attribute the position to - so the one write that met a dead
 * session was the one that was dropped.
 */
export function holdProgress(
  lessonId: string,
  entry: Omit<PendingWrite, "heldAt" | "userId" | "lessonId"> & {
    /** The player's own slot, for a position with no session yet. */
    localId?: string;
  },
  owner: string | null = getSession()?.userId ?? null,
): void {
  // No signed-in child means nothing to attribute it to, and an unattributed
  // position is exactly what must never be sent later.
  if (!owner) return;
  const { localId, ...held } = entry;
  const session = held.sessionId ?? localId;
  if (!session) return;
  const store = read(owner);
  store[slotFor(lessonId, session)] = {
    ...held,
    lessonId,
    userId: owner,
    heldAt: Date.now(),
  };
  write(owner, store);
}

/**
 * Forget what this child holds for a lesson - one session's slot when it is
 * named, every slot when it is not. Never another child's.
 */
export function clearProgress(lessonId: string, session?: string): void {
  const owner = getSession()?.userId;
  if (!owner) return;
  const store = read(owner);
  let changed = false;
  for (const [slot, held] of Object.entries(store)) {
    if (held.lessonId !== lessonId) continue;
    if (session !== undefined && slot !== slotFor(lessonId, session)) continue;
    delete store[slot];
    changed = true;
  }
  if (changed) write(owner, store);
}

/** The newest position the signed-in child holds for a lesson, if any. */
export function pendingProgressFor(lessonId: string): PendingWrite | null {
  const owner = getSession()?.userId;
  if (!owner) return null;
  return (
    Object.values(read(owner))
      .filter((held) => held.lessonId === lessonId)
      .sort((a, b) => b.heldAt - a.heldAt)[0] ?? null
  );
}

/**
 * Slots a mounted player is delivering itself. A position with no session is
 * the player's to send while it is open - it retries the session on its own -
 * and opening a second session for the same visit would split it in two.
 */
const claimed = new Set<string>();

export function claimSlot(lessonId: string, localId: string): () => void {
  const slot = slotFor(lessonId, localId);
  claimed.add(slot);
  return () => claimed.delete(slot);
}

async function deliver(held: PendingWrite): Promise<void> {
  const sessionId =
    held.sessionId ?? (await lessonsApi.startSession(held.lessonId)).sessionId;
  await lessonsApi.saveProgress(held.lessonId, {
    sessionId,
    status: held.status,
    ...(held.assignmentId ? { assignmentId: held.assignmentId } : {}),
    ...(held.segment !== undefined ? { segmentPosition: held.segment } : {}),
    ...(held.module !== undefined ? { modulePosition: held.module } : {}),
  });
}

async function flushOnce(): Promise<void> {
  const session = getSession();
  if (!session?.token || !session.userId) return;
  const owner = session.userId;
  const store = read(owner);
  const slots = Object.keys(store);
  if (slots.length === 0) return;

  // Oldest first within a lesson, so a held completion is never overtaken by
  // a later visit's position on the way up. Lessons go in parallel.
  const byLesson = new Map<string, [string, PendingWrite][]>();
  for (const slot of slots) {
    const held = store[slot];
    const list = byLesson.get(held.lessonId) ?? [];
    list.push([slot, held]);
    byLesson.set(held.lessonId, list);
  }

  const done = new Set<string>();
  await Promise.all(
    [...byLesson.values()].map(async (list) => {
      list.sort((a, b) => a[1].heldAt - b[1].heldAt);
      for (const [slot, held] of list) {
        if (Date.now() - held.heldAt > MAX_AGE_MS) {
          done.add(slot);
          continue;
        }
        if (claimed.has(slot)) continue;
        try {
          await deliver(held);
          done.add(slot);
        } catch (cause) {
          // A 4xx DROPS the entry - the server has answered about this write,
          // and a stale session id it will never accept would otherwise be
          // retried for ever. Anything else keeps it, because a transport
          // failure is exactly what this is for.
          const status = cause instanceof ApiError ? cause.status : 0;
          if (status >= 400 && status < 500) done.add(slot);
        }
      }
    }),
  );

  if (done.size === 0) return;
  // Re-read: the player may have held something newer while these were out.
  const fresh = read(owner);
  for (const slot of done) {
    if (fresh[slot]?.heldAt === store[slot]?.heldAt) delete fresh[slot];
  }
  write(owner, fresh);
}

let queue: Promise<void> = Promise.resolve();

/**
 * Send everything the signed-in child still holds, for every lesson.
 *
 * Deliberately not per-lesson: a child who gave up on a lesson offline may
 * never open that lesson again, and their position should still reach Home's
 * "Pick back up" card. Mounting any student screen is enough, and so is the
 * connection coming back.
 *
 * Only ever the signed-in child's own shelf. Anything belonging to another
 * child on this device is on their shelf, not sent and not deleted.
 *
 * QUEUED, because the shell, the player and the `online` event can all ask at
 * once - and two flushes reading the same slot would send it twice.
 */
export function flushPendingProgress(): Promise<void> {
  queue = queue.then(flushOnce, flushOnce);
  return queue;
}
