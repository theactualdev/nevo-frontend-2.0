import { ApiError, api, apiErrorCode } from "./client";

/**
 * Dates of birth, compared (`/api/v1/age-checks`) - SCRUM-243, as rewritten
 * 20 Oct. THE 7 OCT RULING THIS FILE USED TO DESCRIBE IS SUPERSEDED: a
 * mismatch now HOLDS the account unactivated.
 *
 * The school gives a date on the roster; the parent gives one at consent. When
 * they differ the account holds, the school re-checks its admissions record,
 * and the parent gives the date again. The rules - how far apart is too far,
 * whether a date sits in the enrolled band, which date prevails - are the
 * backend's alone. The console renders what it is told and computes none of
 * it: not the gap, not the band, not whether a hold can clear.
 *
 * WHAT IS NEVER SHOWN: the parent's date, to the school, at any point. The
 * response does not carry it, and nothing here asks for it. Nothing about a
 * hold reaches the child.
 */

export type AgeCheckState = "matched" | "mismatch" | "resolved" | "awaiting_parent";

export interface AgeCheck {
  id: string;
  studentId: string;
  studentFirstName: string | null;
  /** The school's own date. The only date of birth a school ever sees here. */
  schoolDateOfBirth: string | null;
  state: AgeCheckState;
  differs: boolean;
  /** The server's word for "on hold": the account cannot activate. */
  blocksAccess: boolean;
  enrolledAgeBand: string | null;
  /** The server's own reasons, as untyped strings. Never rendered, never interpreted. */
  holdReasons: string[];
  schoolNotifiedAt: string | null;
  /** When the roster record is removed if nothing is resolved. Null when nothing is pending. */
  deletionDueAt: string | null;
  schoolRecheckedAt: string | null;
  parentReconfirmedAt: string | null;
  /**
   * Whether this hold can clear through the re-check (both dates present, at
   * most two years apart, inside the enrolled band, not expired). The
   * SERVER'S answer (39ac06f, live 21 Oct) - never worked out here. It is not
   * permission to activate: the school's re-check and the parent's
   * reconfirmation are still both required.
   */
  clearable: boolean;
}

/** The hold's three moments, read from the server's own timestamps - nothing compared. */
export type HoldStage =
  /** The school hasn't re-checked its record yet. */
  | "school"
  /** The school has; the parent hasn't given the date again yet. */
  | "parent"
  /** Both have, and the server still holds the account. */
  | "both";

export function holdStage(check: AgeCheck): HoldStage {
  // A school re-check clears the parent's reconfirmation on the server, and a
  // parent can only reconfirm after one - so which timestamps are set is the
  // whole story.
  if (!check.schoolRecheckedAt) return "school";
  return check.parentReconfirmedAt ? "both" : "parent";
}

export const AGE_CHECK_EXPIRED = "age_check_expired";
export const AGE_CHECK_NOT_PENDING = "age_check_not_pending";
export const SCHOOL_RECHECK_REQUIRED = "school_recheck_required";

/** The refusal's code, when the server gave one. */
export function ageCheckRefusal(err: unknown): string | null {
  return err instanceof ApiError ? apiErrorCode(err.detail) : null;
}

export const ageChecksApi = {
  /** GET /api/v1/age-checks - every check at this school, newest first. */
  list: () => api.get<AgeCheck[]>("/api/v1/age-checks"),

  /** The checks holding an account - the server's `blocksAccess`, nothing more. */
  held: () =>
    api
      .get<AgeCheck[]>("/api/v1/age-checks")
      .then((rows) => (Array.isArray(rows) ? rows : []).filter((r) => r.blocksAccess)),

  /**
   * POST /api/v1/age-checks/{id}/school-recheck - the school confirms its date
   * (the same date) or corrects it (a new one). 409 `age_check_not_pending`
   * once nothing is held; 410 `age_check_expired` past the deadline.
   */
  schoolRecheck: (ageCheckId: string, dateOfBirth: string) =>
    api.post<AgeCheck>(`/api/v1/age-checks/${encodeURIComponent(ageCheckId)}/school-recheck`, {
      dateOfBirth,
    }),

  /** GET /api/v1/age-checks/parent - a signed-in parent's own children's checks. */
  parent: () => api.get<AgeCheck[]>("/api/v1/age-checks/parent"),

  /**
   * POST /api/v1/age-checks/{id}/parent-reconfirm - the parent gives the date
   * again. 409 `school_recheck_required` until the school has re-checked.
   */
  parentReconfirm: (ageCheckId: string, dateOfBirth: string) =>
    api.post<AgeCheck>(`/api/v1/age-checks/${encodeURIComponent(ageCheckId)}/parent-reconfirm`, {
      dateOfBirth,
    }),
};
