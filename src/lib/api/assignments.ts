import { api } from "./client";
import type { LessonSummary } from "./lessons";

/**
 * Lesson assignments - which students have been given which lesson.
 *
 * Assignments are per-student even when created for a whole class: sending a
 * `classId` expands to the current enrolment server-side, and each returned
 * row still names a `studentId`. The `classId` on a row is therefore the class
 * it was created from, not a class-level assignment, and it comes back null
 * for anything assigned to individuals.
 *
 * The list cannot be filtered by lesson, only by student or class, so a
 * lesson's own assignments are found by reading the teacher's list and
 * matching on `lesson.id`.
 */

/**
 * The deployed `AssignmentStatus` enum. Two values only - an assignment is
 * either set or called off; there is no "completed" here, because completion
 * is a fact about the CHILD's progress, not about the assignment.
 */
export type AssignmentStatus = "assigned" | "cancelled";

export interface Assignment {
  id: string;
  lesson: LessonSummary;
  studentId: string;
  classId: string | null;
  status: string;
  /** When it OPENS. Shipped 31 Aug; required on the read. */
  availableFrom: string | null;
  /** When it is DUE - a different thing. */
  dueAt: string | null;
  /**
   * What a teacher wrote when they set the lesson. Shipped 15 Sep.
   *
   * **RULED 23 SEP: IT IS FOR THE CHILD, AND IT REACHES THEM.** Design: *"it
   * appears on the lesson screen, attributed to the teacher by name, drawn so
   * it is unmistakably a person's words rather than Nevo's. It never enters
   * anything Nevo generates about that child, and it is never rewritten,
   * summarised or adapted."*
   *
   * That closes a question open since 21 Sep - teacher's own use, the parent,
   * or the child - and it went the way it did for the reason it was asked
   * rather than closed like `highlights`: a generated highlight is Nevo's
   * opinion about a child, this is a person who deliberately typed these words
   * TO them, so withholding it is not neutral.
   *
   * Rendered by `TeacherNote`, from `useAssignmentNote`, on the first segment
   * of the lesson the assignment was opened from. Deliberately outside the
   * reading-density path, because "never adapted" means it is not a variant of
   * anything.
   *
   * **NOTHING ON THE WIRE SAYS WHO WROTE IT.** This row has `note` and no
   * author; no schema anywhere carries a `teacherName` or an `assignedBy`, and
   * `lesson.createdByName` is whoever authored the LESSON, which is a
   * different person whenever a teacher assigns someone else's. So the note
   * ships attributed-but-unnamed and the field is a backend ask - naming the
   * wrong teacher is worse than naming none.
   */
  note: string | null;
  assignedAt: string;
}

/**
 * What PATCH actually gives back - NOT a whole `Assignment`.
 *
 * `AssignmentUpdatedResponse` carries only the four fields the write can have
 * changed. Typing the call as `Assignment` claimed `lesson`, `studentId`,
 * `classId` and `assignedAt` were on the wire when they are not, which is how a
 * screen ends up rendering `undefined` for a child's name. Caught by
 * `npm run contract`, which is the whole reason that gate exists.
 */
export interface AssignmentUpdated {
  id: string;
  status: AssignmentStatus;
  dueAt: string | null;
  availableFrom: string | null;
}

export interface CreateAssignmentsResult {
  assignmentIds: string[];
  createdCount: number;
}

export const assignmentsApi = {
  /**
   * Assign lessons. One call per class: the payload takes many `lessonIds`
   * but a single `classId`, which expands to that class's current enrolment
   * server-side.
   *
   * `availableFrom` is when the lesson OPENS; `dueAt` is when it is DUE.
   * They are separate fields and must not be mapped onto each other - a
   * lesson scheduled to open on Friday is not a lesson due on Friday.
   * `availableFrom` landed on 31 Aug 2026 and is what the wizard's step 3
   * has always been asking for.
   *
   * `note` landed 15 Sep. Send it ONLY where a teacher was actually given a
   * box to write in - a note assembled on their behalf would be words they
   * never chose.
   *
   * This used to add "it is a message to the CHILD", inferred from the field
   * riding the student's dashboard read. That inference is not design's
   * ruling and the ruling is outstanding: teacher's own use, or intended for
   * the parent. See `AssignmentResponse.note`.
   */
  create: (payload: {
    lessonIds: string[];
    classId?: string | null;
    studentIds?: string[];
    availableFrom?: string | null;
    dueAt?: string | null;
    note?: string | null;
  }) => api.post<CreateAssignmentsResult>("/api/v1/assignments", payload),

  /** Every assignment the teacher can see, optionally narrowed. */
  list: (filter?: { studentId?: string; classId?: string }) =>
    api.get<Assignment[]>("/api/v1/assignments", {
      params: filter?.studentId
        ? { studentId: filter.studentId }
        : filter?.classId
          ? { classId: filter.classId }
          : undefined,
    }),

  /**
   * Change one assignment's dates, or cancel it.
   *
   * PATCH rather than DELETE, deliberately. Both endpoints cancel - DELETE's
   * operationId is literally `cancel_assignment` - but DELETE is irreversible
   * and drops the row, taking with it the record that the lesson was ever set.
   * A teacher who cancels the wrong class would then have no way back, which
   * is the exact problem this whole change exists to fix. `status: "cancelled"`
   * keeps the row, can be patched back to `assigned`, and leaves the child's
   * history intact.
   *
   * Every field is optional: send only what changes.
   */
  update: (
    assignmentId: string,
    patch: {
      dueAt?: string | null;
      availableFrom?: string | null;
      status?: AssignmentStatus;
    },
  ) =>
    api.patch<AssignmentUpdated>(
      `/api/v1/assignments/${encodeURIComponent(assignmentId)}`,
      patch,
    ),
};

/**
 * Apply one change to many assignments, reporting HONESTLY what happened.
 *
 * An assignment is per-student even when a teacher created it for a class, so
 * "cancel this lesson for JSS 2A" is thirty separate writes. Thirty writes can
 * half-succeed, and this console's most expensive recurring defect is a failed
 * write that looked exactly like a successful one - the dialog closes, the
 * spinner stops, and the screen returns to rest whether or not anything landed.
 *
 * So this never throws on a partial failure and never reports success for one.
 * It settles every request and returns the counts, leaving the caller to say
 * something true. `Promise.all` would reject on the first failure and lose the
 * information about the twenty-nine that worked.
 */
export async function applyToAssignments(
  ids: string[],
  patch: Parameters<typeof assignmentsApi.update>[1],
): Promise<{ ok: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    ids.map((id) => assignmentsApi.update(id, patch)),
  );
  const ok: string[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => (r.status === "fulfilled" ? ok : failed).push(ids[i]));
  return { ok, failed };
}
