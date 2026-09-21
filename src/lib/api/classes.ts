import { api } from "./client";
import type { StudentConsent } from "./students";
import type { UserStatus } from "./teachers";

/** The deployed `ClassSource` enum. There is no "sso" member. */
export type ClassSource = "manual" | "roster_sync";

/**
 * Teacher-class assignment endpoints, typed against the deployed backend
 * (openapi 2.0.0, snake_case bodies). `myClasses` is the teacher console's
 * own class list - live today; the assignment CRUD calls are admin-surface
 * seams for the admin campaign.
 */

export type TeacherAssignmentRole = "primary" | "co_teacher";

export interface AssignedClass {
  assignmentId: string;
  classId: string;
  className: string;
  classCode: string | null;
  role: TeacherAssignmentRole;
  assignedAt: string;
}

export interface AssignedTeacher {
  assignmentId: string;
  teacherId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: TeacherAssignmentRole;
  assignedAt: string;
}

/**
 * A student on a class roster.
 *
 * camelCase, and deliberately so: this route was the API's one mixed-case
 * object until backend settled the convention on 30 Aug. camelCase is
 * canonical for the v2 product surface; the snake_case above is the auth and
 * assignment surface, which stays as it is. Do not "tidy" either into the
 * other.
 *
 * `profileStatus` is the learner profile, not the account: `observed` once
 * Nevo has watched enough to adapt, `not_observed_yet` before that.
 */
export type ProfileStatus = "observed" | "not_observed_yet";

/**
 * The closed set of patterns the roster may report. Derived server-side from
 * lesson sessions and signal events - never free text, never model output,
 * never anything the learner wrote, which is what lets it pass Zero-Tag on
 * contents and not merely on field names.
 */
export type ObservationPattern =
  | "completed_lessons"
  | "revisited_content"
  | "steadier_pace"
  | "tried_another_format"
  | "no_recent_pattern";

export interface LearnerObservation {
  pattern: ObservationPattern;
  /**
   * How many times. OPTIONAL AND NULLABLE, which the previous `count: number`
   * denied: `LearnerObservationResponse` requires `pattern` alone and types
   * count as `integer | null`. A card interpolating it unconditionally would
   * print "null times".
   */
  count?: number | null;
}

export interface ClassStudent {
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  /** Always present - the backend's own fallback for a missing name. */
  displayName: string;
  loginIdentifier: string | null;
  /**
   * Account state, and BOTH halves of what this comment used to say were false.
   *
   * It read: "No enum in the spec; 'active' is the only value seen." The spec
   * types this as `$ref: UserStatus`, a closed enum of `active | invited |
   * deactivated` described as "Lifecycle state of an account", and `status` is
   * in the response's `required` list - so every row carries one of the three.
   *
   * "The only value seen" was probe-driven typing, which is exactly how
   * `deactivated` got missed once already: `lib/api/teachers.ts` records the
   * same enum being widened to a bare string after a live probe returned only
   * "active", and a "pending" member being invented that the spec has never
   * had. A value the server has not happened to send yet is not a value that
   * does not exist.
   *
   * The cost of the widening was that a teacher could not tell a deactivated
   * child from an active one: the field arrived on every row and was discarded
   * at render because nothing here said it was worth reading.
   */
  status: UserStatus;
  profileStatus: ProfileStatus | (string & {});
  latestSessionAt: string | null;
  /**
   * What Nevo has noticed about this learner recently - now BOUNDED, and a
   * breaking change from the `string[]` this used to be (backend, 3 Sep).
   *
   * The old shape handed the client pre-phrased sentences and asked it to
   * trust the contents; nothing rendered them, because an untyped string is
   * exactly what the Zero-Tag rulings say must not reach a teacher sight
   * unseen. It is now a closed enum plus a count, so the WORDING is ours to
   * compose and the guarantee lives in the schema rather than in an
   * assurance.
   *
   * NEITHER A CAP NOR A WINDOW IS IN THE CONTRACT. This used to end "At most
   * three, over a 30-day window". `observations` carries no `maxItems`, and no
   * field on this route declares a window. Render what you are sent, and never
   * date the section in copy.
   */
  observations?: LearnerObservation[];
  /** Which seat the student occupies against the school's allowance. */
  seatContext: string;
  /**
   * DROPPED ON THE FLOOR UNTIL 10 SEP.
   *
   * `ClassStudentResponse.consent` is REQUIRED in the contract - the same
   * `StudentConsentSummaryResponse` the roster carries - and this interface
   * simply did not declare it, so the field arrived on every class roster read
   * and was discarded. Meanwhile `ClassDetailView`'s own marker called the
   * absent consent column "the single biggest gap" on that screen.
   *
   * The response-shape check in `scripts/contract-check.mjs` cannot catch this
   * direction: it gates on properties the CLIENT declares that the response
   * lacks, deliberately, because a screen is entitled to read a subset. A
   * required field the client ignores is check 2's advisory list, and only
   * when NOTHING in the client names it - `consent` is named all over the
   * students lane, so it never showed up.
   */
  consent?: StudentConsent | null;
}

/**
 * A class as the admin console reads it (D5 / D5b). camelCase, like the roster
 * route above and unlike the snake_case assignment surface.
 *
 * `source` is what forks every manual-versus-SSO branch in D5: where the
 * provider owns the class list, Create is ABSENT rather than disabled and
 * archive does not appear at all.
 *
 * THE PROVIDER-OWNED VALUE IS `roster_sync`, NOT "sso". `ClassSource` in the
 * deployed spec is a closed two-value enum, `manual | roster_sync`, and "sso"
 * has never been a member. Every comparison against "sso" was therefore
 * permanently false, which silently disabled the whole fork - a synced class
 * offered a Create button and an archive action the school must not have. It
 * is typed as the union now so the compiler refuses the next such typo.
 *
 * `subjects` backs the detail header's third clause. It is optional in the
 * schema and often empty, so the header composes only the clauses it has.
 */
export interface AdminClass {
  id: string;
  name: string;
  code: string | null;
  /** A `YearGroup` enum value. Typed as string: the backend does not narrow it. */
  yearGroup: string | null;
  source: ClassSource | null;
  subjects: string[];
  studentCount: number;
  /** Non-null means archived. Archive is reversible and never deletes. */
  archivedAt: string | null;
}

/**
 * One class in a bulk create. Only `name` is required by the contract; the
 * rest are sent when the composer has them.
 */
export interface ClassWrite {
  name: string;
  yearGroup?: string | null;
  section?: string | null;
  academicSession?: string | null;
  capacity?: number | null;
}

/**
 * Why one class in a bulk create was not made — `{index, field, value, reason}`,
 * every field required.
 *
 * `index` is into the array WE sent, so unlike the invitation import's `row`
 * there is no numbering ambiguity: the rejection can be paired with the exact
 * class the admin asked for. `value` carries the offending input, so the
 * screen never has to guess which part of the row was wrong.
 */
export interface ClassRejection {
  index: number;
  field: string;
  value: string;
  reason: string;
}

export interface BulkClassResponse {
  created: { id: string; code: string }[];
  rejected: ClassRejection[];
}

export const classesApi = {
  /**
   * Every class in the school. Archived rows are excluded by default and a
   * filter reveals them, which is exactly what `includeArchived` does.
   */
  list: (includeArchived = false) =>
    api.get<AdminClass[]>("/api/v1/classes", {
      params: includeArchived ? { includeArchived: true } : undefined,
    }),

  /** One class. GET /api/v1/classes/{class_id} */
  get: (classId: string) => api.get<AdminClass>(`/api/v1/classes/${classId}`),

  /**
   * Create a class.
   *
   * D5's create sheet offers an OPTIONAL PRIMARY TEACHER, and SCRUM-40's data
   * note asks for `primary_teacher_id` on this body - but the deployed schema
   * takes `{ name, yearGroup }` and nothing else. So the sheet creates, then
   * assigns with the id this returns. Two calls, not one, and not atomic: if
   * the assignment fails the class still exists, which the sheet says plainly
   * rather than pretending the whole thing failed.
   */
  create: (payload: { name: string; yearGroup: string | null }) =>
    api.post<{ id: string; code: string | null }>("/api/v1/classes", payload),

  /**
   * Create many classes in one call. SCRUM-149 CL-04, and the reason it
   * exists: *"A real Nigerian secondary school runs twelve to thirty classes.
   * Nobody types thirty one at a time."*
   *
   * `POST /api/v1/classes/bulk` landed 21 Sep. `ClassWrite` accepts
   * `{name, yearGroup, section, academicSession, capacity}` with only `name`
   * required — a wider shape than single create, which still takes
   * `{name, yearGroup}` alone.
   *
   * PARTIAL SUCCESS IS THE NORMAL OUTCOME, not an error. The response is
   * `{created, rejected}`, and `ClassRejection` carries `{index, field, value,
   * reason}` per row — backend's own description says why: *"a school creating
   * thirty classes will not notice a count of failures — and did not, when an
   * import of four hundred children reported only that some rows failed."*
   * Render every rejection; never a count.
   */
  createMany: (classes: ClassWrite[]) =>
    api.post<BulkClassResponse>("/api/v1/classes/bulk", { classes }),

  /** Rename or re-year a class. Does not rewrite assignment history. */
  update: (classId: string, payload: { name: string; yearGroup: string | null }) =>
    api.patch<{ id: string; name: string }>(`/api/v1/classes/${classId}`, payload),

  /** Archive: reversible, keeps records, never touches student progress. */
  archive: (classId: string) =>
    api.post<void>(`/api/v1/classes/${classId}/archive`),

  /** Undo an archive. */
  restore: (classId: string) =>
    api.post<void>(`/api/v1/classes/${classId}/restore`),
  /** The signed-in teacher's classes. GET /api/v1/teachers/me/classes */
  myClasses: () => api.get<AssignedClass[]>("/api/v1/teachers/me/classes"),

  /** A specific teacher's classes (admin). */
  teacherClasses: (teacherId: string) =>
    api.get<AssignedClass[]>(`/api/v1/teachers/${teacherId}/classes`),

  /** Teachers assigned to a class (admin read). */
  classTeachers: (classId: string) =>
    api.get<AssignedTeacher[]>(`/api/v1/classes/${classId}/teachers`),

  /** The class roster. GET /api/v1/classes/{class_id}/students */
  classStudents: (classId: string) =>
    api.get<ClassStudent[]>(`/api/v1/classes/${classId}/students`),

  /** Assign a teacher to a class (admin seam). */
  createAssignment: (payload: {
    teacherId: string;
    classId: string;
    role: TeacherAssignmentRole;
  }) => api.post("/api/v1/teacher-class-assignments", payload),

  /** Hand a class to another teacher (admin seam). */
  reassign: (
    assignmentId: string,
    payload: { newTeacherId: string; role?: TeacherAssignmentRole | null },
  ) =>
    api.post(
      `/api/v1/teacher-class-assignments/${assignmentId}/reassign`,
      payload,
    ),

  /** Remove an assignment (admin seam). */
  removeAssignment: (assignmentId: string) =>
    api.del(`/api/v1/teacher-class-assignments/${assignmentId}`),
};
