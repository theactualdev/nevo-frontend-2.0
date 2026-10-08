import {
  LESSON_STATUS,
  lessonsApi,
  type LessonQuestionAttemptWrite,
  type LessonStatus,
} from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";

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
  /**
   * Where the after-lesson check was left (B49). Held with the exit it rode
   * on, so leaving a check offline still says where to pick it up.
   */
  check?: number;
  heldAt: number;
}

type Store = Record<string, PendingWrite>;

/** One slot per session; a position with no session gets its player's own. */
const slotFor = (lessonId: string, session: string) => `${lessonId}:${session}`;

function readRaw<T = PendingWrite>(key: string): Record<string, T> {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

function writeRaw(key: string, store: Record<string, unknown>): void {
  try {
    if (Object.keys(store).length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(store));
    }
  } catch {
    // Private mode or a full quota. The in-memory re-send still covers the
    // case where the player stays open; this only adds surviving the exit.
  }
}

function write(userId: string, store: Store): void {
  writeRaw(keyFor(userId), store);
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

/**
 * ANSWERS TO A CHECK, HELD THE SAME WAY (Lydia, 6 Oct).
 *
 * Her rule exists so the engine never books a completion with no check data
 * behind it, and since B85 a lesson played offline can be completed. Its
 * answers were sent once and dropped when the connection was not there, so
 * the held completion reached the server later with nothing for the
 * check-in to be read from. They are held here, per child, beside the
 * positions, and a completion is never sent ahead of its visit's answers:
 *
 *   - every held answer of that visit landed: the completion goes as it is.
 *   - one is still held (no connection yet): the completion waits with it.
 *   - one was refused for good: the completion is sent as `exited` at the
 *     same place instead, so the lesson comes back - Lydia's rule again.
 *
 * Each keeps the `clientAttemptId` it was first sent with, so an answer whose
 * write reached the server but whose reply did not is not filed twice.
 */
const ANSWERS_KEY = "nevo.lesson.pendingAnswers";
const answersKeyFor = (userId: string) => `${ANSWERS_KEY}.${userId}`;

/** One answer as `POST /attempts` takes it, without the session it rides. */
export type HeldAnswerBody = Omit<LessonQuestionAttemptWrite, "sessionId"> & {
  clientAttemptId: string;
};

interface HeldAnswer {
  userId: string;
  lessonId: string;
  /** Null when no session had opened; `localId` is then the player's slot. */
  sessionId: string | null;
  localId?: string;
  body: HeldAnswerBody;
  /**
   * When the server refused it for good. Never sent again: kept only so the
   * completion of its visit goes as `exited`, and forgotten once it has, or a
   * week after.
   */
  refusedAt?: number;
  heldAt: number;
}

type AnswerStore = Record<string, HeldAnswer>;

const answerSlot = (a: HeldAnswer) =>
  slotFor(a.lessonId, a.sessionId ?? a.localId ?? "");

const readAnswers = (userId: string) =>
  readRaw<HeldAnswer>(answersKeyFor(userId));
const writeAnswers = (userId: string, store: AnswerStore) =>
  writeRaw(answersKeyFor(userId), store);

/**
 * Worth sending again: no answer at all, a sign-in that ran out, a timeout or
 * a throttle, or the server's own failure. Any other refusal is the server's
 * answer about this write, and sending it again would get the same one.
 */
export function retryable(cause: unknown): boolean {
  const status = cause instanceof ApiError ? cause.status : 0;
  return (
    status === 0 ||
    status === 401 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

/**
 * Keep an answer that could not be stored now, under the session it was
 * given in - or, before one exists, the player's own slot (`localId`). The
 * owner is taken when the answer was given, as for a position.
 */
export function holdAnswer(
  lessonId: string,
  entry: { sessionId: string | null; localId?: string; body: HeldAnswerBody },
  owner: string | null = getSession()?.userId ?? null,
): void {
  if (!owner) return;
  if (!entry.sessionId && !entry.localId) return;
  const store = readAnswers(owner);
  store[entry.body.clientAttemptId] = {
    userId: owner,
    lessonId,
    sessionId: entry.sessionId,
    ...(entry.sessionId ? {} : { localId: entry.localId }),
    body: entry.body,
    heldAt: Date.now(),
  };
  writeAnswers(owner, store);
}

const answersIn = (owner: string, slot: string) =>
  Object.values(readAnswers(owner)).filter((a) => answerSlot(a) === slot);

/** Does the signed-in child hold answers, sent or refused, for a visit? */
export function holdsAnswers(lessonId: string, sessionId: string): boolean {
  const owner = getSession()?.userId;
  if (!owner) return false;
  return answersIn(owner, slotFor(lessonId, sessionId)).length > 0;
}

/** Move what was held in `from` onto a session that now exists. */
function moveAnswers(owner: string, from: string, sessionId: string): void {
  const store = readAnswers(owner);
  let moved = false;
  for (const a of Object.values(store)) {
    if (answerSlot(a) !== from) continue;
    a.sessionId = sessionId;
    delete a.localId;
    moved = true;
  }
  if (moved) writeAnswers(owner, store);
}

/**
 * The player's session opened: answers it held before then are that
 * session's now, so its completion waits for them and they go under it.
 */
export function adoptAnswers(
  lessonId: string,
  localId: string,
  sessionId: string,
): void {
  const owner = getSession()?.userId;
  if (owner) moveAnswers(owner, slotFor(lessonId, localId), sessionId);
}

/** A refusal has done its work: its visit's completion went as `exited`. */
function settle(owner: string, slot: string): void {
  const store = readAnswers(owner);
  let changed = false;
  for (const [id, a] of Object.entries(store)) {
    if (answerSlot(a) !== slot || a.refusedAt === undefined) continue;
    delete store[id];
    changed = true;
  }
  if (changed) writeAnswers(owner, store);
}

export function settleAnswers(lessonId: string, sessionId: string): void {
  const owner = getSession()?.userId;
  if (owner) settle(owner, slotFor(lessonId, sessionId));
}

export type HeldAnswers = "sent" | "held" | "refused";

/**
 * Send one visit's held answers, oldest first, under `sessionId`. Stops at
 * the first that cannot be sent yet, keeping its order. Refused beats held:
 * once one answer can never land, the completion cannot honestly be sent.
 */
async function sendAnswers(
  owner: string,
  lessonId: string,
  slot: string,
  sessionId: string,
): Promise<HeldAnswers> {
  const waiting = answersIn(owner, slot)
    .filter((a) => a.refusedAt === undefined)
    .sort((a, b) => a.heldAt - b.heldAt);
  let held = false;
  for (const answer of waiting) {
    const id = answer.body.clientAttemptId;
    if (Date.now() - answer.heldAt <= MAX_AGE_MS) {
      try {
        await lessonsApi.saveAttempt(lessonId, { sessionId, ...answer.body });
        const store = readAnswers(owner);
        delete store[id];
        writeAnswers(owner, store);
        continue;
      } catch (cause) {
        if (retryable(cause)) {
          held = true;
          break;
        }
      }
    }
    // Refused for good - or too old to send, which is as good as refused:
    // the visit it belongs to cannot be completed on it.
    const store = readAnswers(owner);
    if (store[id]) {
      store[id] = { ...store[id], refusedAt: Date.now() };
      writeAnswers(owner, store);
    }
  }
  // A refusal is forgotten a week after it was made, like everything here.
  const now = Date.now();
  const left = answersIn(owner, slot);
  const stale = left.filter(
    (a) => a.refusedAt !== undefined && now - a.refusedAt > MAX_AGE_MS,
  );
  if (stale.length > 0) {
    const store = readAnswers(owner);
    for (const a of stale) delete store[a.body.clientAttemptId];
    writeAnswers(owner, store);
  }
  if (left.some((a) => a.refusedAt !== undefined && !stale.includes(a))) {
    return "refused";
  }
  return held ? "held" : "sent";
}

/** Forget a delivered position, unless something newer was held since. */
function dropProgress(owner: string, slot: string, heldAt: number): void {
  const store = read(owner);
  if (store[slot]?.heldAt !== heldAt) return;
  delete store[slot];
  write(owner, store);
}

/**
 * One visit: a session for it if it never had one, then its answers, then
 * its position - the completion only once its answers are in (see above).
 */
async function deliverSlot(
  owner: string,
  lessonId: string,
  slot: string,
): Promise<void> {
  let held: PendingWrite | undefined = read(owner)[slot];
  if (held && Date.now() - held.heldAt > MAX_AGE_MS) {
    dropProgress(owner, slot, held.heldAt);
    held = undefined;
  }
  if (claimed.has(slot)) return;
  const waiting = answersIn(owner, slot).filter(
    (a) => a.refusedAt === undefined,
  );
  if (!held && waiting.length === 0) return;
  try {
    let sessionId =
      held?.sessionId ?? waiting.find((a) => a.sessionId)?.sessionId ?? null;
    if (!sessionId) {
      sessionId = (await lessonsApi.startSession(lessonId)).sessionId;
      // Kept under the session from here on, so its answers and its position
      // land in one visit even if they go on different reconnects.
      const to = slotFor(lessonId, sessionId);
      moveAnswers(owner, slot, sessionId);
      if (held) {
        const store = read(owner);
        delete store[slot];
        held = store[to] = { ...held, sessionId };
        write(owner, store);
      }
      slot = to;
    }
    const answers = await sendAnswers(owner, lessonId, slot, sessionId);
    if (!held) return;
    let status = held.status;
    if (status === LESSON_STATUS.COMPLETED && answers !== "sent") {
      if (answers === "held") return;
      status = LESSON_STATUS.EXITED;
    }
    await lessonsApi.saveProgress(lessonId, {
      sessionId,
      status,
      ...(held.assignmentId ? { assignmentId: held.assignmentId } : {}),
      ...(held.segment !== undefined ? { segmentPosition: held.segment } : {}),
      ...(held.module !== undefined ? { modulePosition: held.module } : {}),
      ...(held.check !== undefined ? { checkPosition: held.check } : {}),
    });
    dropProgress(owner, slot, held.heldAt);
    if (status !== held.status) settle(owner, slot);
  } catch (cause) {
    // A 4xx DROPS the entry - the server has answered about this write, and
    // a stale session id it will never accept would otherwise be retried for
    // ever. Anything else keeps it, because a transport failure is exactly
    // what this is for.
    const status = cause instanceof ApiError ? cause.status : 0;
    if (held && status >= 400 && status < 500) {
      dropProgress(owner, slot, held.heldAt);
    }
  }
}

async function flushOnce(): Promise<void> {
  const session = getSession();
  if (!session?.token || !session.userId) return;
  const owner = session.userId;

  // Every visit holding a position or an answer to send, by lesson, with the
  // moment its oldest was held.
  const byLesson = new Map<string, Map<string, number>>();
  const note = (lessonId: string, slot: string, at: number) => {
    const slots = byLesson.get(lessonId) ?? new Map<string, number>();
    slots.set(slot, Math.min(at, slots.get(slot) ?? at));
    byLesson.set(lessonId, slots);
  };
  for (const [slot, held] of Object.entries(read(owner))) {
    note(held.lessonId, slot, held.heldAt);
  }
  for (const a of Object.values(readAnswers(owner))) {
    if (a.refusedAt === undefined) note(a.lessonId, answerSlot(a), a.heldAt);
  }
  if (byLesson.size === 0) return;

  // Oldest first within a lesson, so a held completion is never overtaken by
  // a later visit's position on the way up. Lessons go in parallel.
  await Promise.all(
    [...byLesson].map(async ([lessonId, slots]) => {
      const ordered = [...slots].sort((a, b) => a[1] - b[1]);
      for (const [slot] of ordered) await deliverSlot(owner, lessonId, slot);
    }),
  );
}

let queue: Promise<void> = Promise.resolve();

/** Run after whatever is already sending, so nothing goes out twice. */
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Send what the signed-in child holds for one visit's answers, before that
 * visit's completion is written - see `useLessonProgress`. Queued with the
 * flush, so the two never send the same answer at once.
 */
export function sendHeldAnswers(
  lessonId: string,
  sessionId: string,
): Promise<HeldAnswers> {
  return queued(async () => {
    const owner = getSession()?.userId;
    if (!owner) return "held";
    return sendAnswers(owner, lessonId, slotFor(lessonId, sessionId), sessionId);
  });
}

/**
 * Send everything the signed-in child still holds, for every lesson.
 *
 * Deliberately not per-lesson: a child who gave up on a lesson offline may
 * never open that lesson again, and their position should still reach Home's
 * "Pick up where you left off" list. Mounting any student screen is enough,
 * and so is the connection coming back.
 *
 * Only ever the signed-in child's own shelf. Anything belonging to another
 * child on this device is on their shelf, not sent and not deleted.
 *
 * QUEUED, because the shell, the player and the `online` event can all ask at
 * once - and two flushes reading the same slot would send it twice.
 */
export function flushPendingProgress(): Promise<void> {
  return queued(flushOnce);
}

/**
 * Does the signed-in child hold a position this device has not yet sent?
 *
 * "In progress", as design's offline rule (D50) means it: a child with nothing
 * held and nothing downloaded cannot continue at all offline, and is the only
 * child the full offline screen is for. Only their own shelf, and nothing
 * older than a flush would still send.
 */
export function holdsProgress(): boolean {
  const owner = getSession()?.userId;
  if (!owner) return false;
  const now = Date.now();
  return Object.values(read(owner)).some(
    (held) => now - held.heldAt <= MAX_AGE_MS,
  );
}
