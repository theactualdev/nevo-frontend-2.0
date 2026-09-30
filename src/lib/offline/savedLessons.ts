import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * Lessons a child saved to open without a connection - THE SMALLER VERSION.
 *
 * WHAT THIS IS: the same lesson read the player already makes
 * (`GET /api/v1/lessons/{id}`), kept on the device when a child taps "Save for
 * offline", and used when that read cannot be made. It rebuilds through the
 * same `lessonFromContent` as a live open, so a saved lesson is the lesson,
 * not a copy of it.
 *
 * WHAT IT IS NOT, and why. The real offline feature is the backend's offline
 * package: `POST /api/v1/lessons/{id}/download` returns a typed manifest, but
 * `GET /api/v1/lessons/{id}/offline-package` answers an UNTYPED `{}` and the
 * manifest carries no size. Caching a package whose shape the contract does
 * not state would be us guessing it. So: no package, no sizes, no media (media
 * generation is down anyway), and nothing registered server-side. Swap this
 * for the package once backend types it.
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
  };
  return write(userId, shelf) ? "saved" : "refused";
}

/**
 * Refresh a lesson that is ALREADY saved with a newer read, so the copy a
 * child opens offline is the latest one they had online. Never saves a lesson
 * they did not choose to keep.
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
