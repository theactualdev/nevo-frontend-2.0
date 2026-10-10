import type { ComprehensionCheckpoint } from "@/lib/api/checkpoints";
import {
  lessonsApi,
  type LessonContentType,
  type LessonDetailResponse,
  type LessonModule,
  type LessonSegment,
} from "@/lib/api/lessons";
import type { SegmentVariants } from "@/lib/api/variants";
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
 * WHAT `lesson.json` IS: an `OfflinePackage` (backend B60, 5 Oct), and NOT a
 * `LessonDetailResponse`. Until B60 the contract called it "the lesson
 * package" and nothing more, so it was read as a lesson detail - and a correct
 * package was rejected every time, because it is narrower and shaped
 * differently: the four variants are nested under `modalityVariants`, a
 * segment's key is `key`, and none of the review or authorship fields are
 * there. Every save fell back to the detail read, so the package was fetched
 * and thrown away. It is now checked against its own published shape and
 * mapped onto the detail's field names - see `detailFromPackage` - so the
 * player builds it exactly as it builds a live open.
 *
 * MODULES, RECAP AND AFTER-LESSON CHECK (backend B85, 8 Oct). The package
 * carries all three now, under the detail's own names, and they are kept as
 * sent - so a lesson opened from it is grouped, ends with its recap and its
 * check, and completes exactly as it would online. A package that leaves any
 * of them out, and every copy saved before 8 Oct, is still played without
 * them and never recorded complete - see `isPartialCopy` in
 * `savedLessons.ts`. Nothing missing is filled in here.
 *
 * If `lesson.json` is not that shape, belongs to another lesson or will not
 * build, the lesson is kept from the detail read instead, as before. The size
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
      `[offline] lesson.json for ${lessonId} is not an OfflinePackage this player can open; kept the detail read instead.`,
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
  if (!isOfflinePackage(parsed, lessonId)) return null;
  const detail = detailFromPackage(parsed);
  try {
    // The same builder a saved lesson is opened with, run once now so a
    // package it cannot build - or one with nothing in it to play - is caught
    // at save time, not when the child is offline and has nothing else.
    if (!lessonFromContent(detail, detail.modules ?? [])) return null;
  } catch {
    return null;
  }
  return detail;
}

/**
 * `OfflinePackage`, the published schema of `lesson.json` (backend B60). Only
 * `id` and `title` are required of the package, and `id`, `key`, `body`,
 * `contentType` and `sequenceOrder` of a segment; the rest may be absent.
 *
 * `modules`, `recap` and `assessment` (B85, 8 Oct) are the detail read's own
 * types - `LessonModuleResponse`, a nullable string and
 * `ComprehensionCheckpoint[]` - so they need no mapping, only keeping.
 */
export interface OfflinePackage {
  id: string;
  title: string;
  version?: string | null;
  modules?: LessonModule[];
  recap?: string | null;
  assessment?: ComprehensionCheckpoint[];
  segments?: OfflinePackageSegment[];
}

export interface OfflinePackageSegment {
  id: string;
  key: string;
  title?: string | null;
  body: string;
  contentType: LessonContentType;
  sequenceOrder: number;
  availableModalities?: LessonSegment["availableModalities"];
  /** The four variants, nested here where a lesson detail flattens them. */
  modalityVariants?: {
    text?: SegmentVariants["textVariant"];
    visual?: SegmentVariants["visualVariant"];
    audio?: SegmentVariants["audioVariant"];
    interactive?: SegmentVariants["interactiveVariant"];
    calculation?: SegmentVariants["calculationVariant"];
  } | null;
  depthVariants?: SegmentVariants["depthVariants"];
  comprehensionCheckpoints?: ComprehensionCheckpoint[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const listOrAbsent = (v: unknown) => v == null || Array.isArray(v);
const objOrAbsent = (v: unknown) => v == null || isObj(v);

/**
 * A package for THIS lesson, in the shape B60 published. Exactly this
 * lesson's id: the shelf is keyed on it, and the player looks the saved copy
 * up by the id it was opened with.
 */
export function isOfflinePackage(
  value: unknown,
  lessonId: string,
): value is OfflinePackage & { segments: OfflinePackageSegment[] } {
  if (!isObj(value)) return false;
  if (value.id !== lessonId) return false;
  if (typeof value.title !== "string") return false;
  if (!(value.recap == null || typeof value.recap === "string")) return false;
  if (!listOrAbsent(value.assessment)) return false;
  if (!(value.modules == null || listOf(value.modules, isModule))) return false;
  return Array.isArray(value.segments) && value.segments.every(isSegment);
}

const listOf = (v: unknown, each: (item: unknown) => boolean) =>
  Array.isArray(v) && v.every(each);

/** `LessonModuleResponse`, whose fields are all required. */
function isModule(m: unknown): boolean {
  return (
    isObj(m) &&
    typeof m.id === "string" &&
    typeof m.title === "string" &&
    typeof m.sequenceOrder === "number" &&
    listOf(m.segmentIds, (id) => typeof id === "string") &&
    (m.recap == null || typeof m.recap === "string") &&
    (m.preview == null || typeof m.preview === "string")
  );
}

function isSegment(s: unknown): boolean {
  if (!isObj(s)) return false;
  const variants = s.modalityVariants;
  return (
    typeof s.id === "string" &&
    typeof s.key === "string" &&
    typeof s.body === "string" &&
    typeof s.contentType === "string" &&
    typeof s.sequenceOrder === "number" &&
    (s.title == null || typeof s.title === "string") &&
    listOrAbsent(s.availableModalities) &&
    listOrAbsent(s.comprehensionCheckpoints) &&
    objOrAbsent(s.depthVariants) &&
    objOrAbsent(variants) &&
    (!isObj(variants) ||
      ["text", "visual", "audio", "interactive", "calculation"].every((k) =>
        objOrAbsent(variants[k]),
      ))
  );
}

/**
 * A package, under the lesson detail's field names, for `lessonFromContent`.
 *
 * Every field it carries is moved across as it is: `key` to `segmentKey`, and
 * each of `modalityVariants`' four out to the segment's own `textVariant`,
 * `visualVariant` and the rest. Absent lists are empty and absent variants
 * null, which is how the detail read says "none".
 *
 * EXCEPT THE LESSON'S `modules`, `recap` AND `assessment`, which stay absent
 * when the package left them out. Absent is "not sent", not "none": a lesson
 * with no check sends `assessment: []`, and an absent one may have had a check
 * the copy does not hold. `isPartialCopy` reads exactly that difference, so
 * filling them in here would book a check nobody took.
 *
 * NOTHING IS ADDED. The package has no review flags (`needsReview`,
 * `approved`), no authorship and no library fields (`status`, `segmentCount`,
 * `createdAt`), and they stay absent rather than being given values - an
 * `approved: true` here would be a claim about a teacher's review that nobody
 * sent. That is why this is cast to the detail type once, here: it is the
 * detail's shape for every field the player reads, and the fields it lacks
 * are ones nothing on a child's side reads.
 */
export function detailFromPackage(
  pkg: OfflinePackage & { segments: OfflinePackageSegment[] },
): LessonDetailResponse {
  type Packaged = Pick<
    LessonDetailResponse,
    "id" | "title" | "modules" | "recap" | "assessment"
  > & {
    segments: Omit<
      LessonSegment,
      "needsReview" | "reviewReasons" | "approved" | "approvedAt"
    >[];
  };
  const packaged: Packaged = {
    id: pkg.id,
    title: pkg.title,
    ...(Array.isArray(pkg.modules) ? { modules: pkg.modules } : {}),
    // Null is sent and kept: it is the lesson saying it has no recap.
    ...(pkg.recap !== undefined ? { recap: pkg.recap } : {}),
    ...(Array.isArray(pkg.assessment) ? { assessment: pkg.assessment } : {}),
    segments: pkg.segments.map((s) => {
      const v = s.modalityVariants;
      return {
        id: s.id,
        segmentKey: s.key,
        contentType: s.contentType,
        sequenceOrder: s.sequenceOrder,
        title: s.title ?? null,
        body: s.body,
        availableModalities: s.availableModalities ?? [],
        comprehensionCheckpoints: s.comprehensionCheckpoints ?? [],
        textVariant: v?.text ?? null,
        visualVariant: v?.visual ?? null,
        audioVariant: v?.audio ?? null,
        interactiveVariant: v?.interactive ?? null,
        calculationVariant: v?.calculation ?? null,
        depthVariants: s.depthVariants ?? null,
      };
    }),
  };
  return packaged as LessonDetailResponse;
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
