/**
 * THE UPLOADS THIS TEACHER STARTED ON THIS DEVICE (backlog 17, 18 and 20;
 * C07j LU-02 and LU-03).
 *
 * The marker that follows a teacher while an upload runs needs to know which
 * uploads are theirs. The server cannot say yet: `GET /api/v1/uploads` is
 * "every recent upload for this school", with no uploader on a row, and
 * filtering that on the device is the line the T2/L9 ruling draws. So the
 * console remembers the ids it was handed when THIS teacher started an
 * upload, here, and asks the server about each one by its own id. Nothing is
 * synthesised: the stage and status on the marker are the server's answer
 * for that upload.
 *
 * Until Teslim's change (uploads scoped to the caller, with a file name and a
 * lesson id), it only knows the uploads started in this browser.
 *
 * Keyed by user, so a shared tablet never shows one teacher another's upload.
 * Every read and write is guarded: private browsing, a full disk or a
 * blocked store means nothing is followed, never an error.
 */

export type FollowedScope = "single" | "unit" | "term";

export interface FollowedUpload {
  uploadId: string;
  /** The file's name as the teacher chose it - the server's status has none. */
  name: string;
  scope: FollowedScope;
  startedAt: string;
}

/** The newest few; an upload is let go once it is confirmed or dismissed. */
const KEEP = 5;
const EVENT = "nevo:followed-uploads";

const keyFor = (userId: string) => `nevo.uploads.${userId}`;

function isFollowed(v: unknown): v is FollowedUpload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.uploadId === "string" &&
    typeof o.name === "string" &&
    (o.scope === "single" || o.scope === "unit" || o.scope === "term") &&
    typeof o.startedAt === "string"
  );
}

export function followedUploads(userId: string | null | undefined): FollowedUpload[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFollowed) : [];
  } catch {
    return [];
  }
}

function write(userId: string, list: FollowedUpload[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(keyFor(userId));
    else window.localStorage.setItem(keyFor(userId), JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Not followed, then. The upload itself carries on server-side.
  }
}

export function followUpload(userId: string | null | undefined, entry: FollowedUpload): void {
  if (!userId) return;
  const rest = followedUploads(userId).filter((u) => u.uploadId !== entry.uploadId);
  write(userId, [entry, ...rest].slice(0, KEEP));
}

export function unfollowUpload(userId: string | null | undefined, uploadId: string): void {
  if (!userId) return;
  const list = followedUploads(userId);
  if (!list.some((u) => u.uploadId === uploadId)) return;
  write(userId, list.filter((u) => u.uploadId !== uploadId));
}

/** Re-read when this tab, or another, changes what is followed. */
export function onFollowedUploadsChange(listener: () => void): () => void {
  try {
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", listener);
    return () => {
      window.removeEventListener(EVENT, listener);
      window.removeEventListener("storage", listener);
    };
  } catch {
    return () => {};
  }
}
