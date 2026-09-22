import { api } from "./client";

/**
 * IEP exporter endpoints, typed against the deployed backend (openapi
 * 2.0.0; Admin D.8). Flow: create draft → edit → mandatory SENCo review →
 * share with a parent. All admin-surface seams for the admin campaign.
 */

export type IepExportStatus = "draft" | "final";
export type IepExportShareStatus = "shared" | "revoked";

export interface IepExport {
  id: string;
  studentId: string;
  requestedByUserId: string;
  periodStart: string;
  periodEnd: string;
  status: IepExportStatus;
  exportContent: string;
  sourceSummary: Record<string, unknown>;
  annotations: Record<string, unknown>[];
  aiGatewayCallId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface IepExportShare {
  id: string;
  exportId: string;
  studentId: string;
  parentId: string;
  sharedByUserId: string;
  status: IepExportShareStatus;
  sharedAt: string;
}

export const exportApi = {
  /** Create a draft export for a period. POST /api/v1/exports/iep */
  create: (payload: {
    studentId: string;
    periodStart: string;
    periodEnd: string;
  }) => api.post<IepExport>("/api/v1/exports/iep", payload),

  /** Read one export. */
  get: (exportId: string) =>
    api.get<IepExport>(`/api/v1/exports/iep/${exportId}`),

  /** Edit draft content/annotations. */
  update: (
    exportId: string,
    payload: {
      exportContent?: string | null;
      annotations?: Record<string, unknown>[] | null;
    },
  ) => api.patch<IepExport>(`/api/v1/exports/iep/${exportId}`, payload),

  /** SENCo review finalises the draft. */
  review: (
    exportId: string,
    payload: { reviewNote?: string | null; exportContent?: string | null },
  ) => api.post<IepExport>(`/api/v1/exports/iep/${exportId}/review`, payload),

  /** Share a finalised export with a parent account. */
  share: (exportId: string, payload: { parentId: string }) =>
    api.post<IepExportShare>(`/api/v1/exports/iep/${exportId}/share`, payload),

  /**
   * Every share of one export. GET /api/v1/exports/iep/{export_id}/shares
   *
   * **A pre-launch blocker, and it closed on 21 Sep.** Until this landed
   * exactly one endpoint WROTE shares and none read them, so on reload a SENCo
   * could not tell whether a child's SEN report had already reached a guardian
   * - the screen knew only what it had done itself, that session. The record
   * was being written all along and simply never read back.
   *
   * `status` is `shared | revoked`, and the difference is the point: a revoked
   * share is a guardian who NO LONGER has the report. Rendering one as "shared
   * with" would tell a SENCo the opposite of the truth about who can read a
   * child's SEN report.
   *
   * Carries ids, not names. `parentId` resolves against the guardian list the
   * screen already holds; `sharedByUserId` resolves against nothing.
   * TODO(api): `sharedByName`, the same ask as `reviewedByName`.
   */
  listShares: (exportId: string) =>
    api.get<IepExportShare[]>(`/api/v1/exports/iep/${exportId}/shares`),
};
