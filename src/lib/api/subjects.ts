import { api } from "./client";

/**
 * The school's subject list (SCRUM-194).
 *
 * An assignment is a teacher, a class AND a subject now: "Pick the teacher,
 * pick one of her subjects, tick the classes she teaches it to." The subject
 * must be on the class's list (its scheme of work) and on the teacher's, and
 * neither list is widened as a side effect - a 422 names which one is short.
 *
 * WHAT THE ADMIN CANNOT READ. A teacher's own subjects are on no admin read
 * (`TeacherDetailResponse` has none), so the console cannot mark which of the
 * school's subjects a teacher "Teaches", as D05 draws. A pick the teacher does
 * not hold is refused by the server with `subject_not_on_teacher`, and that
 * sentence is shown as it stands.
 * TODO(api): the teacher's subjects on `TeacherDetailResponse`.
 */
export interface SchoolSubject {
  id: string;
  name: string;
  displayName: string;
  /** Nevo's canonical list, or the school's own (pending review). */
  origin: string;
  reviewState: string;
  removable?: boolean | null;
}

export const subjectsApi = {
  /** GET /api/v1/subjects - what this school can put on a class or a teacher. */
  list: () => api.get<SchoolSubject[]>("/api/v1/subjects"),
};

/**
 * The school subject a class's subject name refers to.
 *
 * A class reads its subjects back as NAMES and an assignment wants an id, so
 * this is the join - on either spelling the school list carries, ignoring
 * case and spacing. Undefined when the name is not on the list.
 */
export function subjectNamed(
  subjects: SchoolSubject[],
  name: string,
): SchoolSubject | undefined {
  const key = fold(name);
  return subjects.find((s) => fold(s.name) === key || fold(s.displayName) === key);
}

/** Whether a class's subject names include this school subject. */
export function classTakes(classSubjects: string[], subject: SchoolSubject): boolean {
  const names = new Set([fold(subject.name), fold(subject.displayName)]);
  return classSubjects.some((n) => names.has(fold(n)));
}

function fold(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
