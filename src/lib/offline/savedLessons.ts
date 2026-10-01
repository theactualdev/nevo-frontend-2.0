import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * Lessons a child saved to open without a connection.
 *
 * WHAT IS KEPT: the lesson out of the backend's offline package, which
 * `lessonPackage.ts` fetches and unpacks, with the manifest's size and its
 * word on media. Either way a `LessonDetailResponse`, the shape the player
 * already reads: when the package's `lesson.json` is not one, the detail read
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
}

/** What the manifest said about the copy being kept. */
export interface SavedPackage {
  sizeBytes?: number | null;
  includesMedia?: boolean;
}

/** A shelf, not an archive - device storage is small and shared. */
export const MAX_SAVED_LESSONS = 10;

const KEY_PREFIX = "nevo.offline.lessons";
const keyFor = (userId: string) => `${KEY_PREFIX}.${userId}`;

function read(userId: string): Record<string, SavedLesson> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, SavedLesson>)
      : {};
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
 */
export function saveLesson(
  userId: string,
  detail: LessonDetailResponse,
  pkg?: SavedPackage,
): SaveResult {
  const shelf = read(userId);
  if (!shelf[detail.id] && Object.keys(shelf).length >= MAX_SAVED_LESSONS) {
    return "full";
  }
  shelf[detail.id] = {
    lessonId: detail.id,
    title: detail.title,
    savedAt: new Date().toISOString(),
    detail,
    ...(pkg?.sizeBytes ? { sizeBytes: pkg.sizeBytes } : {}),
    ...(typeof pkg?.includesMedia === "boolean"
      ? { includesMedia: pkg.includesMedia }
      : {}),
  };
  return write(userId, shelf) ? "saved" : "refused";
}

/**
 * Refresh a lesson that is ALREADY saved with a newer read, so the copy a
 * child opens offline is the latest one they had online. Never saves a lesson
 * they did not choose to keep. The size and the word on media stay as the
 * manifest gave them: they describe the download, which this does not redo.
 */
export function refreshSavedLesson(
  userId: string,
  detail: LessonDetailResponse,
): void {
  const shelf = read(userId);
  const held = shelf[detail.id];
  if (!held) return;
  shelf[detail.id] = { ...held, title: detail.title, detail };
  write(userId, shelf);
}

export function removeSavedLesson(userId: string, lessonId: string): void {
  const shelf = read(userId);
  if (!shelf[lessonId]) return;
  delete shelf[lessonId];
  write(userId, shelf);
}
