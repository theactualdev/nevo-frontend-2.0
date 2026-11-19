import { ApiError } from "@/lib/api/client";
import { lessonsApi, type OfflineDownloadStatus } from "@/lib/api/lessons";
import { downloadLesson } from "./lessonPackage";
import {
  canOpenOffline,
  confirmSavedLesson,
  holdSavedLesson,
  isChecked,
  noteServerTime,
  removeSavedLesson,
  saveLesson,
  savedLesson,
  savedLessons,
} from "./savedLessons";

/**
 * THE STATUS CHECK A SAVED LESSON PASSES BEFORE IT IS READ ON A CONNECTION
 * (safety v2, Teslim 9f4d763 and his handoff of 18 Nov).
 *
 * "On the first connection, before rendering or reading any cached lesson
 * content, call `GET /api/v1/offline-downloads/{downloadId}/status`." The
 * shell asks it for every copy at sign-in and whenever the connection comes
 * back (`checkShelf`), and a lesson asks it for its own copy before reading it
 * (`checkSavedLesson`). Each copy is asked once per connection.
 *
 * WHAT EACH ANSWER DOES - his words, in order:
 * - `safety_revoked`: "delete the cached package before opening it". Deleted,
 *   and nothing else: saving it again fetches a package without the held
 *   section.
 * - `expired`: "refresh it". Downloaded afresh, and held meanwhile.
 * - `current` (with `usable: true`): "normal use". The only answer that lets
 *   a copy be read.
 * - 404: "the player cannot establish freshness; require a new download. Do
 *   not infer that the lesson is safe." Downloaded afresh, as for `expired`.
 * - Any other failure WITH a response: "a failed status request must not be
 *   interpreted as `current`". The copy is held until a later check says
 *   `current`, offline too - "do not render cached content after the client
 *   detects a connection and the check remains unresolved".
 * - No response at all: no connection. Nothing changes - "preserve true
 *   offline access until connectivity is established".
 *
 * A copy kept before safety v2 has no download to ask about, so it is
 * downloaded afresh: "a legacy package with no expiry needs a fresh download
 * before the fourteen-day rule can be enforced".
 *
 * NO WORDS. A deleted or held copy is simply not shown as saved - the child
 * sees the lesson with its save button, as for any lesson they have not kept.
 *
 * WHAT IT CANNOT DO, as Teslim says: "An offline device cannot be remotely
 * revoked until its next connection."
 */

/**
 * - `current`: the copy may be read and opened.
 * - `removed`: it is not on the shelf - deleted for safety, or never there.
 * - `held`: it will not open until a fresh download or a `current` check.
 * - `offline`: no response, so nothing changed: the copy opens offline as far
 *   as `canOpenOffline` allows.
 */
export type ShelfVerdict = "current" | "removed" | "held" | "offline";

/** Dispatched on `window` whenever a check changes the shelf. */
export const SHELF_CHANGED = "nevo:offline-shelf";

const running = new Map<string, Promise<ShelfVerdict>>();

/**
 * This child's copy of one lesson, checked before anything reads it. Once a
 * copy is `current` on this connection it is not asked again; a check already
 * on its way is shared, never doubled.
 */
export function checkSavedLesson(
  userId: string,
  lessonId: string,
): Promise<ShelfVerdict> {
  if (isChecked(userId, lessonId)) return Promise.resolve("current");
  const key = `${userId}:${lessonId}`;
  const already = running.get(key);
  if (already) return already;
  const check = run(userId, lessonId).finally(() => running.delete(key));
  running.set(key, check);
  return check;
}

/**
 * Every copy on this child's shelf, one at a time, stopping at the first that
 * finds no connection - the rest would find none either.
 */
export async function checkShelf(userId: string): Promise<void> {
  for (const saved of savedLessons(userId)) {
    const verdict = await checkSavedLesson(userId, saved.lessonId);
    if (verdict === "offline") return;
  }
}

/** Test seam. */
export function resetShelfCheck(): void {
  running.clear();
}

async function run(userId: string, lessonId: string): Promise<ShelfVerdict> {
  // Only the download it came from is read here, never the lesson.
  const saved = savedLesson(userId, lessonId);
  if (!saved) return "removed";
  if (!saved.downloadId || !saved.expiresAt) {
    return downloadAfresh(userId, lessonId);
  }

  let status: OfflineDownloadStatus;
  try {
    status = await lessonsApi.offlineDownloadStatus(saved.downloadId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) return "offline";
    if (err instanceof ApiError && err.status === 404) {
      return downloadAfresh(userId, lessonId);
    }
    return hold(userId, lessonId);
  }

  noteServerTime(status.checkedAt);
  if (status.reason === "safety_revoked") {
    removeSavedLesson(userId, lessonId);
    changed();
    return "removed";
  }
  if (status.reason === "expired") return downloadAfresh(userId, lessonId);
  if (status.usable === true && status.reason === "current") {
    confirmSavedLesson(userId, lessonId, status.expiresAt);
    changed();
    return "current";
  }
  // An answer this player does not know is not `current`.
  return hold(userId, lessonId);
}

function hold(userId: string, lessonId: string): ShelfVerdict {
  holdSavedLesson(userId, lessonId, "unchecked");
  changed();
  return "held";
}

/**
 * A fresh download in place of a copy the server will not vouch for. The old
 * copy is held first, so it stays unopenable if the new one does not land.
 */
async function downloadAfresh(
  userId: string,
  lessonId: string,
): Promise<ShelfVerdict> {
  holdSavedLesson(userId, lessonId, "stale");
  changed();
  try {
    const pkg = await downloadLesson(lessonId);
    // Removed by the child while it downloaded: not kept again.
    if (!savedLesson(userId, lessonId)) return "removed";
    saveLesson(userId, pkg.detail, {
      sizeBytes: pkg.sizeBytes,
      includesMedia: pkg.includesMedia,
      downloadId: pkg.downloadId,
      expiresAt: pkg.expiresAt,
    });
  } catch {
    return "held";
  } finally {
    changed();
  }
  const kept = savedLesson(userId, lessonId);
  return kept && canOpenOffline(kept) ? "current" : "held";
}

function changed(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SHELF_CHANGED));
  }
}
