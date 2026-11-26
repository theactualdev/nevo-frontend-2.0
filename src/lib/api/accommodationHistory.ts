import { api } from "./client";
import type { AccommodationType } from "./students";

/**
 * `GET /api/v1/students/{id}/accommodation-history` - "a dated record of what
 * Nevo did for this child. Not a score over time." D08b's "What changed, and
 * when" (admin backlog 42). Learning Support-gated for an admin (backend
 * `require_learning_support_if_admin`), so a refusal is the role.
 *
 * TYPED NARROW ON PURPOSE. The response also carries:
 *
 * - `series` - `cognitiveLoadThreshold` and `processingSpeed` over time, each
 *   point with a confidence. Engine parameters about a child: never rendered,
 *   on any screen (Zero-Tag, ratified 30 Aug). They are left off this type so
 *   nothing can reach them by accident.
 * - `promptedBy` on each change - an internal signal code
 *   (`reading_accommodation_active`, `pattern_no_longer_seen`), not a reason
 *   a person wrote. D08b's "what prompted each" has no source in it, so it is
 *   not read (raised, 24 Nov).
 * - `observedOverLessons` - a count behind the engine's decision, likewise
 *   not a reason, and not read.
 */

/** Whether Nevo started doing something for the child, or stopped (the backend's own words). */
export type AccommodationChangeAction = "added" | "removed";

export interface AccommodationChange {
  accommodation: AccommodationType;
  action: AccommodationChangeAction;
  occurredAt: string;
}

export interface WeeklyAdaptationCount {
  /** The Monday of the week, as a date ("2026-09-07"). */
  weekStarting: string;
  /** Raw: the server does not smooth it, and neither does this console. */
  count: number;
}

export interface AccommodationHistory {
  studentId: string;
  /** Newest first, as the server orders them. */
  changes: AccommodationChange[];
  /** Only the weeks with at least one adaptation; a week with none is not sent. */
  adaptationsPerWeek: WeeklyAdaptationCount[];
}

/** The window the section reads and says. The server's own default. */
export const HISTORY_WEEKS = 12;

export const accommodationHistoryApi = {
  forStudent: (studentId: string, weeks: number = HISTORY_WEEKS) =>
    api.get<AccommodationHistory>(
      `/api/v1/students/${encodeURIComponent(studentId)}/accommodation-history`,
      { params: { weeks } },
    ),
};
