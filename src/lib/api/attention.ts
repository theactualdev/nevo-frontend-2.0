import { api } from "./client";

/**
 * FOCUS EVENTS: whether the lesson section is on screen, as the browser
 * reports it (Teslim, `codex/application-attention-engine` 8ab10c5; Lydia's
 * rollout order, 1 Nov, step 1).
 *
 * `away` when the section stops being visible, `return` when it is visible -
 * first, and again after an away - always with the same sitting and section.
 * The server stamps each transition itself, so nothing here sends a time: an
 * away interval is the server's, from receipt to receipt. It takes them out
 * of response times and time on a section, and marks timing it cannot vouch
 * for as unestablished.
 *
 * It is visibility, never cognition. Nothing is inferred from an absence, and
 * nothing a child sees changes - the reply is not read for anything on their
 * screen.
 */
export type AttentionAction = "away" | "return";

export interface AttentionReport {
  action: AttentionAction;
  segmentId: string;
  /**
   * Made once per event and kept the same on every retry: the server takes
   * the first and ignores the rest, so a retry can never open or close a
   * second interval.
   */
  clientEventId: string;
}

/** `AttentionState`, the server's view after the transition. */
export interface AttentionState {
  sessionId: string;
  studentId: string;
  away: boolean;
  state: "away" | "returned" | "unknown";
  segmentId: string | null;
  awaySince: string | null;
  recordedAt: string | null;
  source: "browser_visibility_report";
}

export const attentionApi = {
  /**
   * `POST /api/v1/students/me/sessions/{sessionId}/attention`. Refused 404
   * `active_session_not_found` or `lesson_section_not_found`, and 403
   * `student_required`. `keepalive` lets an away sent as the page is hidden
   * or closed outlive it (Bearer rules out `sendBeacon`).
   */
  report: (
    sessionId: string,
    report: AttentionReport,
    options: { keepalive?: boolean } = {},
  ) =>
    api.post<AttentionState>(
      `/api/v1/students/me/sessions/${encodeURIComponent(sessionId)}/attention`,
      report,
      options.keepalive ? { keepalive: true } : undefined,
    ),
};
