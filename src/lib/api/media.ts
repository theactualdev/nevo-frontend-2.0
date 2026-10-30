import { api } from "./client";
import type { AudioVariant, VisualVariant } from "./variants";

/**
 * A lesson's generated pictures and narration, and what a teacher does to them
 * (Teslim 8564f5d, 10c6bf8, e03e0ae; SCRUM-286 and C06c).
 *
 * GENERATED MEDIA REACHES NO CHILD UNTIL A TEACHER APPROVES IT. The upload
 * opens for review before the pictures and recordings are made, they arrive
 * afterwards as items here, and each waits at `awaiting_review` until it is
 * approved. Until then a child gets that section as text.
 *
 * SAFETY-BLOCKED MEDIA IS NEVER IN THESE LISTS. Backend leaves it out of the
 * items and the counts alike, and approving or retrying one is a 404. It is not
 * a teacher's decision, so nothing here could show it as one.
 */

export type MediaKind = "image" | "audio";

export type MediaStatus =
  | "queued"
  | "processing"
  | "awaiting_review"
  | "approved"
  | "failed"
  | "stale"
  | "withdrawn";

/** What a finished item made. A recording can also narrate calculation steps. */
export interface PreparedMedia {
  image?: VisualVariant | null;
  audio?: AudioVariant | null;
  stepNarrations?: { stepId: string; audio: AudioVariant }[];
}

export interface LessonMediaItem {
  id: string;
  segmentId: string;
  kind: MediaKind;
  status: MediaStatus;
  /** Null until it has been made. */
  asset: PreparedMedia | null;
  /** The section changed after this was made. */
  sourceChanged: boolean;
  /**
   * Why it could not be made: a generation outage, or `educational_review_failed`
   * when the picture was made and then judged wrong. Both can be retried.
   */
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  /**
   * Who asked for it last: the uploader, or the teacher who sent it back for a
   * remake (Teslim 6b5d496). Optional here only for a deployment before it.
   */
  requestedBy?: string;
  /** When a teacher last sent it back to be remade; null if never (6b5d496). */
  remadeAt?: string | null;
  withdrawnAt?: string | null;
  withdrawnBy?: string | null;
  withdrawnByName?: string | null;
  withdrawalReason?: string | null;
  /** Whether a withdrawal can still be undone, and until when. The server's to say. */
  canUndo?: boolean;
  undoUnavailableReason?: string | null;
  undoAvailableUntil?: string | null;
  restoredAt?: string | null;
  restoredByName?: string | null;
}

export interface MediaCounts {
  total: number;
  queued: number;
  processing: number;
  awaitingReview: number;
  approved: number;
  failed: number;
  stale: number;
  withdrawn: number;
}

export interface MediaPreparation {
  phase: "not_requested" | "preparing" | "awaiting_review" | "complete" | "complete_with_errors";
  generationComplete: boolean;
  images: MediaCounts;
  audio: MediaCounts;
}

export interface LessonMedia {
  lessonId: string;
  summary: MediaPreparation;
  items: LessonMediaItem[];
}

export const mediaApi = {
  list: (lessonId: string) => api.get<LessonMedia>(`/api/v1/lessons/${lessonId}/media`),

  /** One act over the items a teacher was shown. Atomic on the server. */
  approve: (lessonId: string, mediaIds: string[]) =>
    api.post<LessonMediaItem[]>(`/api/v1/lessons/${lessonId}/media/approve`, { mediaIds }),

  /** Make it again. Allowed on a failed item, and on one whose section changed. */
  retry: (lessonId: string, mediaId: string) =>
    api.post<LessonMediaItem>(`/api/v1/lessons/${lessonId}/media/${mediaId}/retry`),

  /** Pull one live item from a lesson children are using. Regenerates nothing. */
  withdraw: (lessonId: string, mediaId: string) =>
    api.post<LessonMediaItem>(`/api/v1/lessons/${lessonId}/media/${mediaId}/withdraw`),

  /**
   * The same, for a section's live picture or recording that predates the
   * media list - it has no item yet, so it is named by section and kind, and
   * the answer is the item the server makes for it.
   */
  withdrawLive: (lessonId: string, segmentId: string, kind: MediaKind) =>
    api.post<LessonMediaItem>(
      `/api/v1/lessons/${lessonId}/segments/${segmentId}/media/${kind}/withdraw`,
    ),

  /** Undo a withdrawal, while the server still allows it. */
  restore: (lessonId: string, mediaId: string) =>
    api.post<LessonMediaItem>(`/api/v1/lessons/${lessonId}/media/${mediaId}/restore`),
};
