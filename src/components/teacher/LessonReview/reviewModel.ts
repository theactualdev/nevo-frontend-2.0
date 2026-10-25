import type {
  KeyPoint,
  KeyPointConfidence,
  LessonReview,
  LessonSegment,
  ReviewSignoff,
} from "@/lib/api/lessons";
import type { LessonMediaItem } from "@/lib/api/media";

/**
 * What each step of C07k draws, read off the review and the lesson.
 *
 * NOTHING HERE DECIDES WHAT NEEDS A TEACHER. A key point is flagged because
 * the server says it is `outstanding`; a section has no key point because the
 * server lists it in `missingKeyPointSegmentIds`. This file only sorts those
 * answers into the rows a step shows, and keeps a row the teacher has just
 * settled in its place, marked done, rather than letting it vanish.
 */

/**
 * Why a key point is being asked about, in the teacher's terms. Carried over
 * from C06b's key point card, which this flow retires: confidence is MEASURED
 * (how much of the point's wording is in the section it came from), so the
 * line says what was measured rather than naming a grade.
 */
export const WHY_FLAGGED: Record<KeyPointConfidence, string> = {
  low: "Nevo couldn’t find this wording in the text it came from, so it may have gone further than the document does.",
  medium: "Only part of this wording appears in the text it came from.",
  high: "Nevo would like you to check this one.",
};

export type AttentionRow =
  | {
      kind: "flag";
      /** The key point's id. */
      id: string;
      point: KeyPoint;
      order: number;
      /** Settled in this visit: confirmed as it reads, or reworded. */
      resolved: false | "confirmed" | "edited";
    }
  | {
      kind: "missing";
      /** The SEGMENT's id - there is no key point to name it by. */
      id: string;
      segmentId: string;
      label: string;
      order: number;
      /** The teacher's own decision, once there is one. */
      decided: null | { omitted: true } | { omitted: false; point: KeyPoint };
    };

export function rowResolved(row: AttentionRow): boolean {
  return row.kind === "flag" ? row.resolved !== false : row.decided !== null;
}

/** "Fractions of a whole", or the section's place when the parse gave no title. */
export function segmentLabel(segment: LessonSegment | undefined, index: number): string {
  return segment?.title?.trim() || `Section ${index + 1}`;
}

/**
 * Step 2's two lists: the few that want a look, at the top, and the rest.
 *
 * `confirmed` and `edited` are this visit's own record of which flagged
 * points the teacher has settled. "Looks right" writes nothing on its own -
 * the one-press acceptance is the write - and an edited point comes back
 * from the server no longer outstanding, so without these it would jump out
 * of the list the moment it was dealt with.
 */
export function keyPointRows(
  review: LessonReview,
  segments: LessonSegment[],
  confirmed: ReadonlySet<string>,
  edited: ReadonlySet<string>,
): { attention: AttentionRow[]; rest: KeyPoint[]; kept: number } {
  const place = new Map(segments.map((s, i) => [s.id, i]));
  const orderOf = (segmentId: string, position = 0) =>
    (place.get(segmentId) ?? segments.length) * 1000 + position;

  const attention: AttentionRow[] = [];
  const rest: KeyPoint[] = [];
  for (const point of review.keyPoints) {
    // A point the parser never wrote is the teacher's answer to a section
    // that had none: added in their words, or left out on purpose.
    if (point.extractedText === "") {
      const index = place.get(point.segmentId) ?? 0;
      attention.push({
        kind: "missing",
        id: point.segmentId,
        segmentId: point.segmentId,
        label: point.segmentTitle?.trim() || segmentLabel(segments[index], index),
        order: orderOf(point.segmentId, point.position),
        decided:
          point.reviewState === "removed"
            ? { omitted: true }
            : { omitted: false, point },
      });
    } else if (point.outstanding) {
      attention.push({
        kind: "flag",
        id: point.id,
        point,
        order: orderOf(point.segmentId, point.position),
        resolved: confirmed.has(point.id) ? "confirmed" : false,
      });
    } else if (edited.has(point.id)) {
      attention.push({
        kind: "flag",
        id: point.id,
        point,
        order: orderOf(point.segmentId, point.position),
        resolved: "edited",
      });
    } else if (point.reviewState !== "removed") {
      rest.push(point);
    }
  }
  for (const segmentId of review.missingKeyPointSegmentIds ?? []) {
    const index = place.get(segmentId) ?? 0;
    attention.push({
      kind: "missing",
      id: segmentId,
      segmentId,
      label: segmentLabel(segments[index], index),
      order: orderOf(segmentId),
      decided: null,
    });
  }
  attention.sort((a, b) => a.order - b.order);
  const kept = review.keyPoints.filter((p) => p.reviewState !== "removed").length;
  return { attention, rest, kept };
}

export type RewriteKind = "simplified" | "expanded";

export interface RewriteRow {
  segmentId: string;
  /** Its place in the lesson, counted from 1, as the variants screen counts. */
  section: number;
  label: string;
  versions: { kind: RewriteKind; body: string; edited: boolean }[];
}

/**
 * Step 3's rows: every section Nevo wrote a simpler or a longer version of.
 *
 * These two are what the one press approves, and all it approves - backend's
 * bulk route signs the simplified and expanded rewrites and nothing else - so
 * they are what a row opens to. A section too short to rewrite has neither
 * and is simply not listed.
 */
export function rewriteRows(segments: LessonSegment[]): RewriteRow[] {
  return segments.flatMap((segment, index) => {
    const versions = (["simplified", "expanded"] as const).flatMap((kind) => {
      const v = segment.depthVariants?.[kind];
      return v?.body ? [{ kind, body: v.body, edited: Boolean(v.editedAt) }] : [];
    });
    return versions.length > 0
      ? [{ segmentId: segment.id, section: index + 1, label: segmentLabel(segment, index), versions }]
      : [];
  });
}

/** "19 October", in the school's own day rather than the server's. */
export function onDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** "Approved by Ms. Adeyemi · 19 October", C07k's live-step record. */
export function signoffLine(record: ReviewSignoff, what?: string): string {
  const day = onDay(record.approvedAt);
  const who = `${what ? `${what} approved` : "Approved"} by ${record.approvedByName}`;
  return day ? `${who} · ${day}` : who;
}

/**
 * The live step's record of who approved the lesson and when.
 *
 * One line when one person signed both steps on the same day, which is the
 * ordinary case and what C07k draws. Two when they differ, because folding a
 * second teacher's sign-off into the first one's name would misstate who
 * decided. A lesson with no rewrites has only the key points to sign.
 */
export function approvalLines(review: LessonReview): string[] {
  const points = review.keyPointApproval?.current ? review.keyPointApproval : null;
  const rewrites = review.rewriteApproval?.current ? review.rewriteApproval : null;
  if (points && rewrites) {
    const same =
      points.approvedByName === rewrites.approvedByName &&
      onDay(points.approvedAt) === onDay(rewrites.approvedAt);
    return same
      ? [signoffLine(points)]
      : [signoffLine(points, "Key points"), signoffLine(rewrites, "Rewrites")];
  }
  const only = points ?? rewrites;
  return only ? [signoffLine(only)] : [];
}

export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ media */

export interface MediaRow {
  item: LessonMediaItem;
  label: string;
}

/**
 * Step 1's pictures and narration (SCRUM-286; design 82c213b).
 *
 * WHAT IS SHOWN IS WHAT THE ONE PRESS SIGNS. Pictures and recordings waiting
 * for a teacher, and those already approved, in the lesson's own order. Ones
 * still being made, and ones that could not be made, are counted apart: they
 * are not part of this approval, and a later one waits for its own.
 * Withdrawn items belong to C06c, not here. Safety-blocked items never reach
 * this list at all.
 */
export interface MediaView {
  /** Anything made, being made, or failed: the lesson is not text only. */
  exists: boolean;
  pictures: MediaRow[];
  recordings: MediaRow[];
  /** Shown and not yet approved: what the step's press approves. */
  awaiting: LessonMediaItem[];
  making: { images: number; audio: number };
  failed: MediaRow[];
  /** Sections no picture (or recording) was made for, for "1 section has none". */
  sectionsWithoutPictures: number;
  sectionsWithoutNarration: number;
}

export function mediaView(review: LessonReview, segments: LessonSegment[]): MediaView {
  const place = new Map(segments.map((s, i) => [s.id, i]));
  const items = (review.media?.items ?? [])
    .filter((m) => m.status !== "withdrawn")
    .sort((a, b) => (place.get(a.segmentId) ?? 0) - (place.get(b.segmentId) ?? 0));
  const row = (item: LessonMediaItem): MediaRow => {
    const i = place.get(item.segmentId) ?? 0;
    return { item, label: segmentLabel(segments[i], i) };
  };
  const shown = (m: LessonMediaItem) =>
    (m.status === "awaiting_review" || m.status === "approved") &&
    Boolean(m.kind === "image" ? m.asset?.image?.imageUrl : m.asset?.audio?.audioUrl);
  const covered = (kind: "image" | "audio") =>
    new Set(items.filter((m) => m.kind === kind && m.status !== "failed").map((m) => m.segmentId)).size;
  return {
    exists: items.length > 0,
    pictures: items.filter((m) => m.kind === "image" && shown(m)).map(row),
    recordings: items.filter((m) => m.kind === "audio" && shown(m)).map(row),
    awaiting: items.filter((m) => m.status === "awaiting_review" && shown(m)),
    making: {
      images: items.filter((m) => m.kind === "image" && (m.status === "queued" || m.status === "processing")).length,
      audio: items.filter((m) => m.kind === "audio" && (m.status === "queued" || m.status === "processing")).length,
    },
    failed: items.filter((m) => m.status === "failed" || m.status === "stale").map(row),
    sectionsWithoutPictures: Math.max(0, segments.length - covered("image")),
    sectionsWithoutNarration: Math.max(0, segments.length - covered("audio")),
  };
}
