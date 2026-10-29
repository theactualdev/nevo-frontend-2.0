import type {
  CheckAnswerKey,
  CheckOption,
  CheckReviewItem,
  GuidedCheckStep,
  GuidedStepsReviewItem,
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
  // The checks step signs the checks, or only their guiding questions where
  // every check came with its answer; either is that step's record.
  const parts = (
    [
      ["Key points", review.keyPointApproval],
      ["Checks", review.checksApproval?.current ? review.checksApproval : review.guidedStepsApproval],
      ["Rewrites", review.rewriteApproval],
    ] as const
  ).flatMap(([what, record]) => (record?.current ? [{ what, record }] : []));
  if (parts.length === 0) return [];
  const first = parts[0].record;
  const same = parts.every(
    ({ record }) =>
      record.approvedByName === first.approvedByName &&
      onDay(record.approvedAt) === onDay(first.approvedAt),
  );
  return same || parts.length === 1
    ? [signoffLine(first)]
    : parts.map(({ what, record }) => signoffLine(record, what));
}

export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ media */

export interface MediaRow {
  item: LessonMediaItem;
  label: string;
}

/**
 * Back from a remake and waiting for a look (design 11; Lydia, 26 Oct: "show
 * remade as remade").
 *
 * THE SERVER'S RECORD FIRST. Since 6b5d496 an item carries `remadeAt`, so the
 * mark survives a reload and reaches every teacher reviewing the lesson; it
 * lasted only for the visit of the teacher who flagged it (#897). `visit` is
 * that teacher's own record still, for the moment between the remake and the
 * re-read that would carry the date.
 */
export function wasRemade(item: LessonMediaItem, visit: ReadonlySet<string>): boolean {
  return (
    item.status === "awaiting_review" && (Boolean(item.remadeAt) || visit.has(item.id))
  );
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

/* ----------------------------------------------------------------- checks */

/**
 * The answer a check is marked against, as a teacher reads it: the option's
 * label for a choice, the words or number otherwise, several joined. Null
 * for a check with no key.
 */
export function answerText(
  type: string,
  options: CheckOption[] | undefined,
  key: CheckAnswerKey | undefined,
): string | null {
  if (key === null || key === undefined) return null;
  const keys = Array.isArray(key) ? key : [key];
  if (keys.length === 0) return null;
  const word = (k: string | number | boolean) => {
    const option = options?.find((o) => o.value === k);
    if (option) return option.label;
    if (k === true || k === "true") return "True";
    if (k === false || k === "false") return "False";
    return String(k);
  };
  return keys.map(word).join(type === "text" ? " or " : ", ");
}

export interface CheckRow {
  /** `${segmentId}:${questionId}`, the pair the server keys a check by. */
  key: string;
  segmentId: string;
  /** The section it sits in. */
  label: string;
  prompt: string;
  type: string;
  options: CheckOption[];
  /** The key as the server sends it, which names choices by value. */
  answerKey: CheckAnswerKey;
  answer: string | null;
  /** The guiding questions that lead to it, when Nevo wrote any. */
  guided: GuidedStepsReviewItem | null;
  order: number;
}

export interface ChecksView {
  /** Any check or guiding question at all: the step has something to show. */
  exists: boolean;
  /** Checks Nevo wrote the answer to, not yet reviewed: what the press signs. */
  toSign: CheckRow[];
  /** Checks whose answer came with the lesson, or that are already signed. */
  reviewed: CheckRow[];
  /** No prompt or no answer: shown, never signed, and never holding a child. */
  unmarkable: CheckRow[];
  /** Guiding questions behind a check that has no row of its own. */
  guidedOnly: CheckRow[];
  /** Guiding questions whose explanation may say the answer, for a look. */
  leaks: { key: string; row: CheckRow; step: GuidedCheckStep }[];
  /** The server needs the checks sign-off. */
  checksPending: boolean;
  /** The server needs the guiding questions' sign-off. */
  guidedPending: boolean;
  /** This step's current sign-off, for the footer and the live step. */
  signoff: ReviewSignoff | null;
}

/**
 * Step 3, the checks (SCRUM-291; Lydia, 26 Oct: "Build it on the key points
 * step's pattern").
 *
 * EVERY ANSWER HERE IS THE SERVER'S. A check needs signing when the server
 * says it is markable and not `teacherReviewed`: Teslim's 294584b marks a
 * check whose answer was written in the lesson as reviewed at upload, so it
 * is listed, never signed (Lydia, 26 Oct: "A check that came out of the
 * lesson carrying its own authored answer was not generated by anything, so
 * there is nothing to review"). The guiding questions need signing while
 * their own sign-off is not current. Nothing here assumes every check needs
 * a teacher.
 */
export function checksView(review: LessonReview, segments: LessonSegment[]): ChecksView {
  const place = new Map(segments.map((s, i) => [s.id, i]));
  const labelOf = (segmentId: string, title: string | null) => {
    const i = place.get(segmentId) ?? 0;
    return title?.trim() || segmentLabel(segments[i], i);
  };
  const guidedBy = new Map(
    (review.guidedSteps ?? []).map((g) => [`${g.segmentId}:${g.questionId}`, g]),
  );
  const rows = (review.checks ?? []).map((c, i): CheckRow & { check: CheckReviewItem } => ({
    key: `${c.segmentId}:${c.questionId}`,
    segmentId: c.segmentId,
    label: labelOf(c.segmentId, c.segmentTitle),
    prompt: c.questionPrompt,
    type: c.questionAnswerType,
    options: c.questionOptions ?? [],
    answerKey: c.questionAnswerKey,
    answer: answerText(c.questionAnswerType, c.questionOptions, c.questionAnswerKey),
    guided: guidedBy.get(`${c.segmentId}:${c.questionId}`) ?? null,
    order: (place.get(c.segmentId) ?? segments.length) * 1000 + i,
    check: c,
  }));
  const seen = new Set(rows.map((r) => r.key));
  const guidedOnly = (review.guidedSteps ?? [])
    .filter((g) => !seen.has(`${g.segmentId}:${g.questionId}`))
    .map((g, i): CheckRow => ({
      key: `${g.segmentId}:${g.questionId}`,
      segmentId: g.segmentId,
      label: labelOf(g.segmentId, g.segmentTitle),
      prompt: g.questionPrompt,
      type: "",
      options: [],
      answerKey: null,
      answer: null,
      guided: g,
      order: (place.get(g.segmentId) ?? segments.length) * 1000 + 500 + i,
    }));
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const leaks = [...sorted, ...guidedOnly].flatMap((row) =>
    (row.guided?.steps ?? [])
      .filter((step) => row.guided?.answerLeakageStepIds?.includes(step.id))
      .map((step) => ({ key: `${row.key}:${step.id}`, row, step })),
  );
  const checksPending = rows.some((r) => r.check.markable && !r.check.teacherReviewed);
  const guidedPending =
    (review.guidedSteps ?? []).length > 0 && review.guidedStepsApproval?.current !== true;
  const signoff = review.checksApproval?.current
    ? review.checksApproval
    : review.guidedStepsApproval?.current
      ? review.guidedStepsApproval
      : null;
  return {
    exists: rows.length > 0 || guidedOnly.length > 0,
    toSign: sorted.filter((r) => r.check.markable && !r.check.teacherReviewed),
    reviewed: sorted.filter((r) => r.check.markable && r.check.teacherReviewed),
    unmarkable: sorted.filter((r) => !r.check.markable),
    guidedOnly,
    leaks,
    checksPending,
    guidedPending,
    signoff,
  };
}

/** "a", "a and b", "a, b and c". */
export function listed(parts: string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
