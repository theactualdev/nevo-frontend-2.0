import { api } from "./client";

/**
 * Dates of birth, compared (`GET /api/v1/age-checks`).
 *
 * The school gives one on the roster and the parent gives one at consent.
 * Since 8 Oct a disagreement NEVER blocks a child (Lydia's 7 Oct ruling,
 * backend's change): it is a note on the roster, the school's date stays the
 * one Nevo uses, and the mismatch closes by itself when either side corrects
 * theirs and the two agree. Nevo never chooses between them.
 *
 * Only what the roster note needs is read. The two dates are on the response
 * and deliberately not rendered: nothing in the product may look like Nevo
 * decided a child's birthday.
 */

export type AgeCheckState = "matched" | "mismatch" | "resolved" | "awaiting_parent";

export interface AgeCheck {
  id: string;
  studentId: string;
  state: AgeCheckState;
}

export const ageChecksApi = {
  /** The open disagreements, for the roster's note. */
  mismatches: () =>
    api.get<AgeCheck[]>("/api/v1/age-checks", { params: { state: "mismatch" } }),
};
