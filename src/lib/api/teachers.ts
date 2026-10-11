import { api } from "./client";
import type { SchoolSubject } from "./subjects";

/**
 * The deployed `UserStatus` enum - the lifecycle state of an account.
 *
 * There is no "pending". That value was guessed when the schema typed `status`
 * as a bare string and the live probe had only ever returned "active"; the spec
 * now closes the enum, and `deactivated` is the member that was missed.
 */
export type UserStatus = "active" | "invited" | "deactivated";

/**
 * The school's teachers, as the admin console reads them (D6 / D5c).
 *
 * Distinct from `teacherHome.ts`, which is the signed-in teacher's own view of
 * themselves. Everything here is oversight of OTHER people, so it carries
 * enrolment fact only - never a teacher's performance, and never their
 * students' learning data. SCRUM-40 calls that boundary structural rather than
 * a matter of taste.
 */

/** camelCase, matching the v2 product surface. */
export interface TeacherSummary {
  id: string;
  /** Always present - the backend composes its own fallback for a missing name. */
  name: string;
  email: string | null;
  status: UserStatus;
  /** How many classes they hold - on the list since 8 Oct, so no per-row read. */
  classCount?: number;
  /** When they were last seen - D06b's "Last active" and "Active today". */
  lastActiveAt?: string | null;
}

export interface TeacherDetail extends TeacherSummary {
  classIds: string[];
  /**
   * The subjects they teach, by name (8 Oct). D05 marks these "Teaches" and
   * offers only these when assigning them.
   */
  subjects?: string[];
}

export const teachersApi = {
  /**
   * Every teacher in the school. `search` is server-side; D6's search box
   * debounces into it rather than filtering an already-fetched page, so a
   * school past one page still finds people.
   */
  list: (search?: string) =>
    api.get<TeacherSummary[]>("/api/v1/teachers", {
      params: search ? { search } : undefined,
    }),

  /** One teacher. GET /api/v1/teachers/{teacher_id} */
  get: (teacherId: string) =>
    api.get<TeacherDetail>(`/api/v1/teachers/${teacherId}`),

  /**
   * End a teacher's access to the school (D6b).
   *
   * SCRUM-40's fourth rule is that removal may never orphan a class: every
   * class the teacher holds must have another teacher first, and the spec asks
   * for reassignment plus revocation as ONE transaction. The backend offers no
   * such transaction - reassignment is N separate calls and this is an N+1th.
   * D6b therefore sequences them and reports honestly if it stops partway,
   * which is the most the deployed API allows. Raised with backend.
   */
  revoke: (teacherId: string) =>
    api.post<void>(`/api/v1/teachers/${teacherId}/revoke`),

  /**
   * Give a revoked teacher their access back (8 Oct). The undo the removal
   * sheet could not promise, because nothing served it.
   */
  restore: (teacherId: string) =>
    api.post<void>(`/api/v1/teachers/${teacherId}/restore`),

  /**
   * Replace what this teacher teaches, by name (9 Oct). "What this person
   * teaches. Not where they teach it." Removing one they are still assigned
   * to is refused by the server, in its own words.
   */
  setSubjects: (teacherId: string, names: string[]) =>
    api.put<SchoolSubject[]>(`/api/v1/teachers/${teacherId}/subjects`, names),
};
