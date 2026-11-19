import type { LessonDetailResponse } from "@/lib/api/lessons";
import { keepingKeys } from "./keepKeys";

/**
 * Lessons a child saved to open without a connection.
 *
 * WHAT IS KEPT: the lesson out of the backend's offline package, which
 * `lessonPackage.ts` fetches and unpacks, with the manifest's size and its
 * word on media. Either way under a `LessonDetailResponse`'s field names, the
 * shape the player already reads: the package's `lesson.json` is an
 * `OfflinePackage` mapped onto them, and when it cannot be, the detail read
 * is kept instead (see `lessonPackage.ts`). It is used when the live read
 * cannot be made, and it rebuilds through the
 * same `lessonFromContent` as a live open, so a saved lesson is the lesson,
 * not a copy of it.
 *
 * TEXT ONLY. Media is referenced by URL, not bundled (`includesMedia: false`),
 * so pictures and sound need a connection; the screen says so up front.
 *
 * WHAT IT IS NOT: a service worker. The app itself still cannot be reloaded
 * with no connection, which is why a saved lesson opens in place on Downloads.
 *
 * ONE CHILD'S SHELF. Keyed by account, because the tablet is shared: a child
 * sees what they saved, never the last child's. It holds school content, not
 * anything about the child, and it never leaves the device.
 *
 * A COPY OPENS OFFLINE ONLY WHILE THE SERVER CAN STILL VOUCH FOR IT (safety
 * v2, Teslim 9f4d763, 18 Nov). Each copy keeps the download it came from and
 * that download's expiry, fourteen days from issue. It never opens after
 * that, it never opens if it was kept without them (saved before safety v2),
 * and on a connection it is read only once its status check says `current` -
 * see `canOpenOffline` here and `shelfCheck.ts` for the check.
 */

export interface SavedLesson {
  lessonId: string;
  title: string;
  /** When it was saved, for ordering only. Never shown as a time. */
  savedAt: string;
  detail: LessonDetailResponse;
  /**
   * The package's size as the server measured it. Absent when the manifest
   * gave none, and for anything saved before the package was read - so absent
   * shows no size, never a guess.
   */
  sizeBytes?: number;
  /** The manifest's `includesMedia`. Absent when no manifest said. */
  includesMedia?: boolean;
  /**
   * The download this copy came from, for its status check (safety v2).
   * Absent on a copy saved before it, which the server cannot vouch for.
   */
  downloadId?: string;
  /** When the server said this copy stops opening offline. */
  expiresAt?: string;
  /**
   * Why this copy will not open until it is downloaded afresh or checked
   * `current` again. `"stale"`: the server said it expired, or did not know
   * the download, and a fresh one has not landed. `"unchecked"`: a connection
   * came and its check did not resolve - Teslim: "do not render cached content
   * after the client detects a connection and the check remains unresolved".
   */
  hold?: "stale" | "unchecked";
}

/** What the download said about the copy being kept. */
export interface SavedPackage {
  sizeBytes?: number | null;
  includesMedia?: boolean;
  /** The download's id, for the status check. */
  downloadId?: string;
  /** The manifest's `expiresAt`. */
  expiresAt?: string | null;
}

/**
 * Whether a saved copy is missing what completing the lesson needs: its
 * modules, its closing recap or its after-lesson check.
 *
 * WHY IT MATTERS (Lydia, 6 Oct): "A lesson played offline without its
 * modules, recap and after-lesson check is not recorded as completed, and it
 * comes back when the child is next online." Booked complete, the engine
 * would teach that child from a check that never happened.
 *
 * NOT "CAME FROM A PACKAGE" ANY MORE. The package carries all three since
 * backend B85 (8 Oct), and a package copy that has them plays and completes
 * like the detail read. What this asks is whether each one was SENT: an
 * `assessment` list and a `modules` list, empty or not, and a `recap` key,
 * null or not - null and `[]` are the lesson saying it has none, and absent
 * is the copy not saying. `detailFromPackage` keeps that difference, and a
 * copy saved before 8 Oct has none of the three, so it stays partial until
 * `refreshSavedLesson` below replaces it on an online open. Should a detail
 * read ever come without one of them, it is partial too: the lesson then
 * comes back online rather than counting a check nobody took.
 */
export function isPartialCopy(detail: LessonDetailResponse): boolean {
  const copy = detail as Partial<LessonDetailResponse>;
  return (
    !Array.isArray(copy.modules) ||
    !Array.isArray(copy.assessment) ||
    copy.recap === undefined
  );
}

/**
 * THE LESSON, WITHOUT WHAT THIS CHILD CHOSE IN IT OR WAS RECOMMENDED.
 *
 * Since 21 Oct a lesson read carries, per section, the child's own choice in
 * their latest sitting (`deliveryPreference`, `primaryModality`) and the
 * engine's recommendation for them (`recommendedFormat`). Those are held on
 * the server and nowhere else - Lydia, 21 Oct: "held server-side rather than
 * in browser storage" - and this shelf "holds school content, not anything
 * about the child". So every copy is kept without them, and one stored
 * before this is read without them too. What the section has
 * (`availableFormats`) is content, and stays.
 */
function withoutChoices(detail: LessonDetailResponse): LessonDetailResponse {
  if (!Array.isArray(detail.segments)) return detail;
  return {
    ...detail,
    segments: detail.segments.map((segment) => {
      const kept = { ...segment };
      delete kept.deliveryPreference;
      delete kept.primaryModality;
      delete kept.recommendedFormat;
      return kept;
    }),
  };
}

/** A shelf, not an archive - device storage is small and shared. */
export const MAX_SAVED_LESSONS = 10;

/**
 * Whether a copy may open without a connection (safety v2): it came from a
 * download the server can check, nothing is holding it, and it has not passed
 * its expiry by `trustedNow`. A copy that may not open is not presented as
 * saved anywhere - it is not one the child can use.
 */
export function canOpenOffline(saved: SavedLesson): boolean {
  if (!saved.downloadId || !saved.expiresAt || saved.hold) return false;
  const expires = Date.parse(saved.expiresAt);
  return !Number.isNaN(expires) && trustedNow() < expires;
}

/**
 * THE LATEST TIME THIS DEVICE HAS SEEN, so a clock wound back cannot reopen a
 * copy that has expired (Teslim, acceptance step 4: "Test clock rollback too
 * and record the limitation of device-local time").
 *
 * It only moves forward from the device's own reading, and a status check
 * sets it to the server's clock (`noteServerTime`), which outranks the device.
 *
 * THE LIMITATION, RECORDED: offline, time is the device's. A clock wound back
 * before this device has ever seen a later time - before any status check or
 * any later reading - is not caught, and a copy can open past its real expiry
 * until the next connection checks it. A clock set ahead does the safe wrong
 * thing: copies look expired early, and are downloaded afresh on connection.
 *
 * Device-wide, not per child: it is a time, not anything about a child.
 */
const CLOCK_KEY = "nevo.offline.clock";

export function trustedNow(): number {
  const now = Date.now();
  let seen = 0;
  try {
    seen = Number(window.localStorage.getItem(CLOCK_KEY)) || 0;
  } catch {
    // Unreadable is unseen: the device's own reading stands.
  }
  if (now <= seen) return seen;
  try {
    window.localStorage.setItem(CLOCK_KEY, String(now));
  } catch {
    // Not kept, so the next reading is the device's again.
  }
  return now;
}

/** The server's clock, from a status check: it outranks the device's. */
export function noteServerTime(at: string): void {
  const server = Date.parse(at);
  if (Number.isNaN(server)) return;
  try {
    window.localStorage.setItem(CLOCK_KEY, String(server));
  } catch {
    // Not kept: the device's own reading stands.
  }
}

/**
 * THE COPIES CHECKED `current` ON THIS CONNECTION, which may be read until the
 * connection changes (`forgetChecks`). Memory, not storage: a check speaks for
 * one connection, and the next one asks again. A copy downloaded on this
 * connection counts - it is what the server has just issued.
 */
const checked = new Set<string>();
const checkKey = (userId: string, lessonId: string) => `${userId}:${lessonId}`;

export function isChecked(userId: string, lessonId: string): boolean {
  return checked.has(checkKey(userId, lessonId));
}

/** A new connection: every copy is checked again before it is read. */
export function forgetChecks(): void {
  checked.clear();
}

const KEY_PREFIX = "nevo.offline.lessons";
const keyFor = (userId: string) => `${KEY_PREFIX}.${userId}`;

function read(userId: string): Record<string, SavedLesson> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    // A copy kept before `withoutChoices` existed is read without them.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, SavedLesson>).map(
        ([id, held]) => [
          id,
          held?.detail ? { ...held, detail: withoutChoices(held.detail) } : held,
        ],
      ),
    );
  } catch {
    // Unreadable is empty: the child can save again, and nothing breaks.
    return {};
  }
}

function write(userId: string, shelf: Record<string, SavedLesson>): boolean {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(shelf));
    return true;
  } catch {
    // Full or refused storage. Reported, so the screen never says "saved"
    // about a lesson that is not.
    return false;
  }
}

/** This child's saved lessons, newest first. */
export function savedLessons(userId: string): SavedLesson[] {
  return Object.values(read(userId)).sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  );
}

export function savedLesson(
  userId: string,
  lessonId: string,
): SavedLesson | null {
  return read(userId)[lessonId] ?? null;
}

export type SaveResult = "saved" | "full" | "refused";

/**
 * Keep a lesson on the device. "full" when the shelf holds its maximum -
 * never silently dropping an older one the child chose to keep - and
 * "refused" when the device would not store it.
 *
 * A COPY THAT CAN NO LONGER OPEN MAKES ROOM. It is not shown as saved
 * (`canOpenOffline`), so a child could not remove it to free its place; when
 * the shelf is full, the oldest of those goes first.
 */
export function saveLesson(
  userId: string,
  detail: LessonDetailResponse,
  pkg?: SavedPackage,
): SaveResult {
  const shelf = read(userId);
  if (!shelf[detail.id]) {
    const dead = Object.values(shelf)
      .filter((s) => !canOpenOffline(s))
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    while (Object.keys(shelf).length >= MAX_SAVED_LESSONS && dead.length > 0) {
      delete shelf[dead.shift()!.lessonId];
    }
    if (Object.keys(shelf).length >= MAX_SAVED_LESSONS) return "full";
  }
  shelf[detail.id] = {
    lessonId: detail.id,
    title: detail.title,
    savedAt: new Date().toISOString(),
    detail: withoutChoices(detail),
    ...(pkg?.sizeBytes ? { sizeBytes: pkg.sizeBytes } : {}),
    ...(typeof pkg?.includesMedia === "boolean"
      ? { includesMedia: pkg.includesMedia }
      : {}),
    ...(pkg?.downloadId ? { downloadId: pkg.downloadId } : {}),
    ...(pkg?.expiresAt ? { expiresAt: pkg.expiresAt } : {}),
  };
  if (!write(userId, shelf)) return "refused";
  // Just issued by the server: current on this connection.
  if (pkg?.downloadId) checked.add(checkKey(userId, detail.id));
  return "saved";
}

/**
 * Hold a copy back (see `SavedLesson.hold`). It stops counting as checked,
 * and stays held until a fresh download or a `current` check.
 */
export function holdSavedLesson(
  userId: string,
  lessonId: string,
  hold: NonNullable<SavedLesson["hold"]>,
): void {
  checked.delete(checkKey(userId, lessonId));
  const shelf = read(userId);
  const held = shelf[lessonId];
  if (!held) return;
  shelf[lessonId] = { ...held, hold };
  write(userId, shelf);
}

/**
 * The server says this copy is `current`: nothing holds it, its expiry is
 * the server's, and it may be read on this connection.
 */
export function confirmSavedLesson(
  userId: string,
  lessonId: string,
  expiresAt: string,
): void {
  const shelf = read(userId);
  const held = shelf[lessonId];
  if (!held) return;
  const kept: SavedLesson = { ...held, expiresAt };
  delete kept.hold;
  shelf[lessonId] = kept;
  if (write(userId, shelf)) checked.add(checkKey(userId, lessonId));
}

/**
 * Refresh a lesson that is ALREADY saved with a newer read, so the copy a
 * child opens offline is the latest one they had online. Never saves a lesson
 * they did not choose to keep. The size and the word on media stay as the
 * manifest gave them: they describe the download, which this does not redo.
 *
 * NEVER A DOWNGRADE (Lydia, 5 Nov, test 9). The online read has its answer
 * keys held back (41c2f83) and the package does not, so the keys the read
 * left out are kept from the copy it replaces, for each question that has
 * not changed since - see `keepingKeys`. Without that, one online open took
 * every check out of the lesson offline.
 *
 * Only for a copy checked `current` on this connection (safety v2): it reads
 * the copy to carry its keys, and nothing cached is read before the check.
 * `useStudentLesson` calls it only after `checkSavedLesson`.
 */
export function refreshSavedLesson(
  userId: string,
  detail: LessonDetailResponse,
): void {
  const shelf = read(userId);
  const held = shelf[detail.id];
  if (!held) return;
  shelf[detail.id] = {
    ...held,
    title: detail.title,
    detail: withoutChoices(keepingKeys(detail, held.detail)),
  };
  write(userId, shelf);
}

export function removeSavedLesson(userId: string, lessonId: string): void {
  checked.delete(checkKey(userId, lessonId));
  const shelf = read(userId);
  if (!shelf[lessonId]) return;
  delete shelf[lessonId];
  write(userId, shelf);
}
