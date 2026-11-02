import type { AssignedClass, TeacherAssignmentRole } from "@/lib/api/classes";

/**
 * A teacher's classes, ONCE EACH.
 *
 * Since SCRUM-194 (8 Oct) an assignment is teacher + class + SUBJECT, so a
 * teacher who takes JSS 2A for Mathematics and for English holds two
 * assignments for one class. Every list built straight off
 * `/teachers/me/classes` showed that class twice: two identical cards on Home
 * and My Classes, two rows in each class picker, its roster read twice and
 * its children listed twice in compose and assign. The assignments fold into
 * one entry per class here, with the subjects kept in the order they arrived.
 */
export interface MyClass {
  classId: string;
  className: string;
  classCode: string | null;
  /** Primary if any of this teacher's assignments to the class is. */
  role: TeacherAssignmentRole;
  /** What this teacher teaches the class. Empty on assignments made before subjects. */
  subjects: string[];
}

export function classesOnce(assignments: readonly AssignedClass[]): MyClass[] {
  const out = new Map<string, MyClass>();
  for (const a of assignments) {
    const subject = a.subject?.trim() || null;
    const seen = out.get(a.classId);
    if (!seen) {
      out.set(a.classId, {
        classId: a.classId,
        className: a.className,
        classCode: a.classCode,
        role: a.role,
        subjects: subject ? [subject] : [],
      });
      continue;
    }
    if (a.role === "primary") seen.role = "primary";
    if (subject && !seen.subjects.includes(subject)) seen.subjects.push(subject);
  }
  return [...out.values()];
}
