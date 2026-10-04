import { lessonsApi, type LessonDetailResponse } from "@/lib/api/lessons";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import { readZipFile, ZipUnsupported } from "./zip";

/**
 * A lesson saved for offline, through the backend's offline package (B31).
 *
 * THE ROUTE. `POST /api/v1/lessons/{id}/download` returns the manifest, which
 * carries the archive's size as the server measured it and whether media is
 * bundled. `GET /api/v1/lessons/{id}/offline-package` is the archive: a zip
 * holding `lesson.json` and `manifest.json`. `lesson.json` is what is kept, and
 * it is built through the same `lessonFromContent` as a live open. The
 * documented path is fetched rather than `manifest.packageUrl`, which could
 * name the backend's own host - one the browser cannot reach without the
 * same-origin proxy.
 *
 * WHAT `lesson.json` IS, AND WHAT WE CAN SAY ABOUT IT. The contract calls it
 * "the lesson package" and gives it no schema. It is read as a
 * `LessonDetailResponse` - the shape the player already reads - and checked
 * before it is kept: the fields the player reads must be there, the id must be
 * this lesson's, and it must build. If it is not that shape, the lesson is
 * kept from the detail read instead, as the smaller version did. The size
 * shown is the package's either way - it is what the child downloaded - and
 * is never measured or estimated here.
 *
 * WHAT FAILS OUTRIGHT. A request that does not answer, and an archive that is
 * damaged or uses something this reader does not handle (see `zip.ts`). Each
 * one is a save that says it failed, never a lesson rebuilt from bytes nobody
 * checked.
 *
 * A DEVICE TOO OLD TO INFLATE THE ARCHIVE IS NOT ONE OF THEM. Before Chrome
 * 103 / Safari 16.4 / Firefox 113 there is no "deflate-raw", and classroom
 * tablets are often that old. The package is not at fault, and the child
 * could save on that device before the package existed - so the lesson is
 * kept from the detail read instead, exactly as for a `lesson.json` this
 * player cannot open.
 */

export interface DownloadedLesson {
  detail: LessonDetailResponse;
  /** The package's size as the server measured it, or null when not told. */
  sizeBytes: number | null;
  /** The manifest's word on media. Absent when it did not say. */
  includesMedia: boolean | undefined;
}

export async function downloadLesson(
  lessonId: string,
): Promise<DownloadedLesson> {
  const { manifest } = await lessonsApi.download(lessonId);
  const archive = await lessonsApi.offlinePackage(lessonId);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  let packaged: LessonDetailResponse | null;
  let unpackable = false;
  try {
    packaged = await lessonFromPackage(bytes, lessonId);
  } catch (err) {
    if (!(err instanceof ZipUnsupported)) throw err;
    packaged = null;
    unpackable = true;
  }
  if (!packaged && !unpackable && process.env.NODE_ENV === "development") {
    console.warn(
      `[offline] lesson.json for ${lessonId} is not a LessonDetailResponse; kept the detail read instead.`,
    );
  }
  return {
    detail: packaged ?? (await lessonsApi.detail(lessonId)),
    // `default: 0`, which no archive can be: 0 is "not measured".
    sizeBytes:
      manifest.sizeBytes && manifest.sizeBytes > 0 ? manifest.sizeBytes : null,
    includesMedia: manifest.includesMedia,
  };
}

/**
 * The lesson inside a package, or null when `lesson.json` is missing or is
 * not a lesson this player can open. Throws when the archive itself cannot be
 * read - see `zip.ts`.
 */
export async function lessonFromPackage(
  bytes: Uint8Array,
  lessonId: string,
): Promise<LessonDetailResponse | null> {
  const file = await readZipFile(bytes, "lesson.json");
  if (!file) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(file));
  } catch {
    return null;
  }
  if (!isLessonDetail(parsed, lessonId)) return null;
  try {
    // The same builder a saved lesson is opened with, run once now so a
    // package it cannot build is caught at save time, not when the child is
    // offline and has nothing else.
    lessonFromContent(parsed, parsed.modules ?? []);
  } catch {
    return null;
  }
  return parsed;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const listOrAbsent = (v: unknown) => v == null || Array.isArray(v);

/**
 * The fields the player reads, not the whole schema: the teacher-facing ones
 * (`confirmationSummary`, `classes`, review counts) can be absent from a
 * package without anything a child sees changing.
 */
export function isLessonDetail(
  value: unknown,
  lessonId: string,
): value is LessonDetailResponse {
  if (!isObj(value)) return false;
  // Exactly this lesson's id: the shelf is keyed on it, and the player looks
  // the saved copy up by the id it was opened with.
  if (value.id !== lessonId) return false;
  if (typeof value.title !== "string") return false;
  if (!listOrAbsent(value.modules) || !listOrAbsent(value.assessment)) {
    return false;
  }
  return Array.isArray(value.segments) && value.segments.every(isSegment);
}

function isSegment(s: unknown): boolean {
  return (
    isObj(s) &&
    typeof s.id === "string" &&
    typeof s.sequenceOrder === "number" &&
    typeof s.contentType === "string" &&
    typeof s.body === "string" &&
    Array.isArray(s.availableModalities) &&
    Array.isArray(s.comprehensionCheckpoints)
  );
}

/**
 * A size a child can read: "48 KB", "1.2 MB", "12 MB". Decimal units, the
 * same ones a tablet's own storage screen uses. Null for 0 or absent, which
 * the manifest uses for "not measured" - never "0 KB".
 */
export function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  const kb = Math.max(1, Math.round(bytes / 1000));
  if (kb < 1000) return `${kb} KB`;
  const mb = bytes / 1_000_000;
  return mb < 10 ? `${Number(mb.toFixed(1))} MB` : `${Math.round(mb)} MB`;
}
