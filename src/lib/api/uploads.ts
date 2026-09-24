import { api } from "./client";

/**
 * The STAGED upload - the block path, where one file becomes a unit of
 * several lessons rather than a single one.
 *
 * Distinct from `POST /api/content/upload`, which takes a file and returns a
 * finished lesson. The staged flow is: upload -> poll -> edit the structure ->
 * confirm, with an undo, and it is the only route that accepts a `subject`.
 *
 * TWO THINGS LANDED ON 3 SEP that this file was waiting on.
 *
 * `segments` and `lessonTitle` are now on the status response, so C07d's
 * third level can NAME its rows instead of counting them, and a batch screen
 * can show lesson titles from the poll it already makes rather than one extra
 * request per upload. Modules still point at segments by key, so `segments`
 * is the lookup table for `segmentIds`.
 *
 * `lessonId` is now OPTIONAL on a structure lesson. Omitting it is how a
 * split is expressed: send a lesson with no id and the server mints one, then
 * hands the ids back from confirm as `lessonIds`, positionally aligned with
 * the `lessons` that were sent. The client no longer has to invent identity
 * for a row it does not own - and confirm was previously discarding any id it
 * was given and generating its own, so a client-minted id would have named
 * nothing that existed.
 */

/** `UploadStatus` in the spec. */
export type UploadStatus =
  | "pending"
  | "processing"
  | "ready"
  | "confirmed"
  | "failed"
  | "cancelled";

/**
 * `UploadStage` in the spec.
 *
 * `adaptations` LANDED ON 23 SEP, between `structure` and `complete`, and it
 * is the long one. Backend's own note on the enum: it "is the longest wait of
 * the four by a wide margin - a generated picture alone can take ten minutes",
 * and it covers pictures, narration and the two depth rewrites. Until it
 * existed the parser reported `structure` through all of that, which is why
 * both ladders in this console were built with no rung for it.
 *
 * ADDING IT HERE IS NOT COSMETIC. `rungFor` and `stageOf` match on these
 * values, and while it was missing a real upload walked the block ladder to
 * its second rung and then replaced it with a bare spinner, and the single
 * ladder back to "Receiving the file" - both for the longest part of the
 * wait, which is the exact reading of "the product has hung" that LU-01
 * exists to prevent. Observed on a live upload, not reasoned about.
 */
export type UploadStage =
  | "lessons"
  | "structure"
  | "adaptations"
  | "complete";

export interface StructureModule {
  title: string;
  sequenceOrder: number;
  segmentIds: string[];
  recap: string | null;
  preview: string | null;
}

/** One lesson inside a staged unit. */
export interface StructureLesson {
  /**
   * ABSENT MEANS NEW. The server mints an id for any lesson that arrives
   * without one and returns it in `lessonIds`, so a split writes its new
   * halves with this omitted rather than guessing a uuid.
   */
  lessonId?: string;
  title: string;
  sequenceOrder: number;
  modules: StructureModule[];
}

export interface UploadStructure {
  /**
   * `lessons` is the real shape as of 1 Sep. `lessonId` and `modules` mirror
   * the FIRST lesson and are kept for compatibility - read `lessons` and let
   * the mirror alone, or a unit of four will read as one.
   */
  lessons?: StructureLesson[];
  /**
   * NULL UNTIL THERE IS A LESSON, as of 23 Sep.
   *
   * A job is polled from the moment it is created and a parse that is still
   * running has produced nothing, so this is null for the whole processing
   * window. It was required in the contract, and validating an empty
   * structure on the way OUT is what made the status route answer 500 for
   * precisely the period it exists to report on - every poll of every
   * in-flight upload, since the staged route existed.
   *
   * SO IT IS NOT A READINESS SIGNAL. Read `status`. A caller that branches
   * on this id cannot tell "still parsing" from "the parse died hours ago",
   * because both have no lesson.
   */
  lessonId: string | null;
  modules: StructureModule[];
  /** Free-form in the contract; not rendered. */
  reviewNotes?: unknown[];
}

/**
 * A named row for the structure review screen. Modules reference these by
 * `segmentKey`, so this is what turns C07d's third level from a count into a
 * list of titles.
 */
export interface UploadSegment {
  segmentKey: string;
  /** Nullable in the contract - a parse can produce an untitled section. */
  title: string | null;
  contentType: string;
  sequenceOrder: number;
  estimatedMinutes: number;
  needsReview: boolean;
}

export interface UploadStatusResponse {
  id: string;
  status: UploadStatus;
  stage: UploadStage;
  /** The unit's own title, when the parse found one. */
  lessonTitle?: string | null;
  /**
   * Optional in the contract - `required` does not list it - so an older
   * upload can come back with no segments at all. Callers must treat absent
   * and empty the same way and fall back to counting.
   */
  segments?: UploadSegment[];
  /**
   * Pages the parser could not read cleanly, by page number.
   *
   * DEPLOYED AND MISSING FROM THIS TYPE until 18 Sep, which is why a teacher
   * whose PDF was partly unreadable got either a structure tree with pages
   * silently absent from it, or a flat "we could not read that one". The
   * retry endpoint has been wrapped the whole time and had nothing to ask
   * for: the page numbers only exist here.
   *
   * Optional, not required by the contract. Absent and empty are both "no
   * pages to retry" - there is no third meaning to draw.
   */
  failedPages?: number[];
  structure: UploadStructure;
  /**
   * RAW, AND NOT FOR A TEACHER TO READ. Kept for reporting.
   *
   * This was rendered as the sentence a teacher meets when their upload fails,
   * on the reasonable-sounding argument that the server knows why and we do
   * not. Nobody had ever seen one: the status route answered 500 for every
   * in-flight upload, so the field was unreadable for the whole period it
   * existed. The first real one, 23 Sep, was an asyncpg exception carrying the
   * failing INSERT and its bound UUIDs.
   *
   * Backend's own words on it, 24 Sep: *"error stays exactly as it is, raw,
   * for reporting."*
   */
  error: string | null;
  /**
   * THE SENTENCE, and the field that promises to be one. Added 24 Sep.
   *
   * A small closed list of recognised causes - no readable text, timed out,
   * rate limited - and an honest generic line for everything else, because
   * *"a guess dressed as a diagnosis is worse than saying plainly we don't
   * know"*. Null unless the parse failed.
   *
   * So this is what a screen may show, and `error` is what a bug report may
   * quote. They are different fields because they are different promises.
   */
  failureReason?: string | null;
  /**
   * The backend's reference for this failure, now on the JOB rather than only
   * on a 500's body.
   *
   * A parse fails behind the response, so there is no 500 for a reference to
   * ride on - which is why a teacher looking at a failed parse had nothing to
   * quote. Twelve hex characters, written to the log beside the exception.
   */
  incidentId?: string | null;
}

/** 200 of `POST /api/v1/uploads/{id}/retry-pages`. */
export interface UploadRetry {
  uploadId: string;
  status: UploadStatus;
  stage: UploadStage;
  /** The pages that were re-parsed, not how many. */
  pagesRetried: number[];
  structure: UploadStructure;
}

export interface UploadCreated {
  uploadId: string;
  status: UploadStatus;
  stage: UploadStage;
}

/** One file's outcome inside a batch. */
export interface BatchUpload {
  uploadId: string | null;
  filename: string;
  accepted: boolean;
  /** The server's own reason when it refused the file. */
  error: string | null;
  status: UploadStatus | null;
  stage: UploadStage | null;
}

export interface BatchResult {
  acceptedCount: number;
  rejectedCount: number;
  uploads: BatchUpload[];
}

export const uploadsApi = {
  /** Stage a file. `scope` is the unit size; `subject` is optional. */
  create: (file: File, scope: string, subject?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("scope", scope);
    if (subject) form.append("subject", subject);
    return api.post<UploadCreated>("/api/v1/uploads", form);
  },

  /**
   * Stage up to 20 files at once - C07h's whole scheme of work.
   *
   * Each file reports its OWN outcome: one oversized or unreadable file is
   * rejected on its own line rather than sinking the batch. That is the
   * shape to render, and the reason `Promise.all` would have been wrong here.
   */
  batch: (files: File[], scope: string, subject?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("scope", scope);
    if (subject) form.append("subject", subject);
    return api.post<BatchResult>("/api/v1/uploads/batch", form);
  },

  /** Where the parse has got to, and the structure once there is one. */
  status: (uploadId: string) =>
    api.get<UploadStatusResponse>(`/api/v1/uploads/${uploadId}`),

  /**
   * EVERY RECENT UPLOAD IN ONE REQUEST. Added to the contract 24 Sep, because
   * this client was asking for up to twenty uploads one at a time.
   *
   * The bulk screen polls each accepted upload until its parse settles - the
   * only way to learn a lesson's title, since a batch POST returns before the
   * parse has read a word. Twenty files meant twenty requests per round, and
   * backend built this route to stop exactly that.
   *
   * `segments` COMES BACK EMPTY HERE, deliberately: a school with twenty
   * uploads of eleven sections each would be sending a lesson's worth of body
   * text to render a progress list. Use `status` when segments are needed.
   *
   * `unsettledOnly` narrows to the ones still moving. This screen does NOT use
   * it - a job that settles drops out of that answer, and settling is the
   * moment its title and its outcome exist. What a poll wants and what this
   * screen wants are different questions.
   */
  list: (params?: { limit?: number; unsettledOnly?: boolean }) =>
    api.get<UploadStatusResponse[]>("/api/v1/uploads", {
      params: {
        ...(params?.limit !== undefined ? { limit: params.limit } : {}),
        ...(params?.unsettledOnly !== undefined
          ? { unsettledOnly: params.unsettledOnly }
          : {}),
      },
    }),

  /** Save an edited structure. Returns the stored one, plus whether it can be undone. */
  updateStructure: (uploadId: string, structure: UploadStructure) =>
    api.put<{ id: string; structure: UploadStructure; canUndo: boolean | null }>(
      `/api/v1/uploads/${uploadId}/structure`,
      { structure },
    ),

  /** Reverse the last structure edit. */
  undo: (uploadId: string) =>
    api.post<{ id: string; structure: UploadStructure; canUndo: boolean | null }>(
      `/api/v1/uploads/${uploadId}/undo`,
    ),

  /**
   * Commit the unit to the library.
   *
   * `lessonIds` is the split's other half: one id per lesson that was sent,
   * in the same order, including the ones the server minted for lessons that
   * arrived without an id. `lessonId` remains the first, for callers that
   * only ever expected one.
   */
  confirm: (uploadId: string) =>
    api.post<{ lessonId: string; lessonIds?: string[]; status: UploadStatus }>(
      `/api/v1/uploads/${uploadId}/confirm`,
    ),

  /**
   * Re-parse specific pages that came through faint.
   *
   * THE RESPONSE TYPE HERE WAS WRONG, in three ways, and nothing caught it
   * because nothing called it. `UploadRetryResponse` carries `status` and
   * `stage` - which is the whole point, the upload goes back to parsing and
   * the caller has to resume polling - and `pagesRetried` is the LIST of page
   * numbers, not a count. There is no `lessonId` on it at all.
   *
   * `pageNumbers` is 1 to 100 items per the contract; sending an empty list
   * is a 422, so callers must not offer a retry with nothing selected.
   */
  retryPages: (uploadId: string, pageNumbers: number[]) =>
    api.post<UploadRetry>(`/api/v1/uploads/${uploadId}/retry-pages`, {
      pageNumbers,
    }),
};

/**
 * The lessons a staged upload describes.
 *
 * Prefers `lessons`; falls back to the mirrored single lesson so an older
 * response still reads as one lesson rather than none.
 */
export function lessonsOf(structure: UploadStructure): StructureLesson[] {
  if (structure.lessons?.length) return structure.lessons;
  return [
    {
      // Null means the parse has produced no lesson yet. Omitting the id is
      // how this contract says NEW - the server mints one on confirm - so a
      // null must not become a lesson to mint. The review screens gate on
      // `status` before they ever reach here, which is what keeps that from
      // happening; this line only refuses to convert the one into the other.
      lessonId: structure.lessonId ?? undefined,
      title: "",
      sequenceOrder: 1,
      modules: structure.modules ?? [],
    },
  ];
}

/**
 * Name the segments a module points at.
 *
 * Modules carry `segmentIds` - keys, not titles - so drawing C07d's third
 * level means joining them against the status response's `segments`. A key
 * with no matching row, or a row whose title is null, yields null rather than
 * a placeholder: the caller decides whether that is "Section 3" or a count,
 * because inventing a title here would put words in the parse's mouth.
 */
export function namedSegments(
  segmentIds: string[],
  segments: UploadSegment[] | undefined,
): { key: string; title: string | null; minutes: number; needsReview: boolean }[] {
  const byKey = new Map((segments ?? []).map((seg) => [seg.segmentKey, seg]));
  return segmentIds.map((key) => {
    const found = byKey.get(key);
    return {
      key,
      title: found?.title?.trim() ? found.title.trim() : null,
      minutes: found?.estimatedMinutes ?? 0,
      needsReview: found?.needsReview ?? false,
    };
  });
}
