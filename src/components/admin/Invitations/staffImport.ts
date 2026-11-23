import { subjectNamed, type ResolvedName, type SchoolSubject } from "@/lib/api/subjects";
import type { ImportTeacher, Teaching } from "./csv";

/**
 * D19's staff import, step 2 (backlog 19; T15): which subject each row
 * became, which are still to settle, and the classes each teacher's
 * invitation carries.
 *
 * THE SERVER SAYS WHAT A TYPED SUBJECT IS (`GET /subjects/resolve`, written
 * "for the import confirmation step"): one the school holds, one of Nevo's
 * the school doesn't hold yet, or nothing it recognises. Only the last is
 * "Subject to settle". Nothing here guesses a match the server didn't make.
 */

export function fold(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** What a typed subject became: its name, and the school's id when it has one. */
export interface SubjectAnswer {
  name: string;
  /** Null for one of Nevo's the school doesn't hold yet: added on Save. */
  id: string | null;
}

/** The server's answers, by folded typed name. Null: nothing recognised. */
export function answersFrom(resolved: ResolvedName[]): Map<string, SubjectAnswer | null> {
  const out = new Map<string, SubjectAnswer | null>();
  for (const r of resolved) {
    const name = r.displayName?.trim() || r.typed.trim();
    if (r.schoolSubjectId) out.set(fold(r.typed), { name, id: r.schoolSubjectId });
    else if (r.displayName && r.origin === "canonical") out.set(fold(r.typed), { name, id: null });
    else out.set(fold(r.typed), null);
  }
  return out;
}

/**
 * The subject a row ends up with: the admin's own pick first, then the
 * server's answer for what the file typed. Null while it is still to settle -
 * which includes a row that named a class and no subject, because T15 needs
 * one per class (SCRUM-194).
 */
export function subjectFor(
  t: Teaching,
  answers: Map<string, SubjectAnswer | null>,
  settled: Record<number, string>,
): string | null {
  if (settled[t.line]) return settled[t.line];
  if (!t.subject) return null;
  return answers.get(fold(t.subject))?.name ?? null;
}

export function toSettle(
  teachers: ImportTeacher[],
  answers: Map<string, SubjectAnswer | null>,
  settled: Record<number, string>,
): Teaching[] {
  return teachers
    .flatMap((t) => t.teaches)
    .filter((t) => subjectFor(t, answers, settled) === null)
    .sort((a, b) => a.line - b.line);
}

/** The other rows still to settle that typed the same words. */
export function sameWords(t: Teaching, open: Teaching[]): Teaching[] {
  if (!t.subject.trim()) return [];
  return open.filter((o) => o.line !== t.line && fold(o.subject) === fold(t.subject));
}

/** "3 and 18", "3, 18 and 26". */
export function andList(items: (string | number)[]): string {
  const s = items.map(String);
  return s.length <= 1 ? (s[0] ?? "") : `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

/** D19: `Also use it for row 15, which says "Maths Dept" too`. */
export function alsoLine(others: Teaching[], typed: string): string {
  const lines = others.map((o) => o.line);
  return lines.length === 1
    ? `Also use it for row ${lines[0]}, which says “${typed.trim()}” too`
    : `Also use it for rows ${andList(lines)}, which say “${typed.trim()}” too`;
}

/**
 * Every name the invitations will carry that has no school id yet - one of
 * Nevo's the school doesn't hold, or a name the admin added in the picker.
 * Save puts each on the school's list first (`POST /subjects`), because an
 * invitation carries a school subject's id (T15).
 */
export function namesToAdd(
  teachers: ImportTeacher[],
  answers: Map<string, SubjectAnswer | null>,
  settled: Record<number, string>,
  school: SchoolSubject[],
): string[] {
  const out = new Map<string, string>();
  for (const t of teachers.flatMap((x) => x.teaches)) {
    const name = subjectFor(t, answers, settled);
    if (!name || idFor(name, answers, school, new Map())) continue;
    out.set(fold(name), name);
  }
  return [...out.values()];
}

/** The school subject id for a name: the server's answer, the school's list, or one just added. */
export function idFor(
  name: string,
  answers: Map<string, SubjectAnswer | null>,
  school: SchoolSubject[],
  added: Map<string, string>,
): string | null {
  const key = fold(name);
  for (const a of answers.values()) {
    if (a?.id && fold(a.name) === key) return a.id;
  }
  return subjectNamed(school, name)?.id ?? added.get(key) ?? null;
}

/** One teacher's T15 classes: each class with each subject, once. */
export function classesFor(
  teacher: ImportTeacher,
  answers: Map<string, SubjectAnswer | null>,
  settled: Record<number, string>,
  school: SchoolSubject[],
  added: Map<string, string>,
): { classId: string; subjectId: string }[] {
  const seen = new Set<string>();
  const out: { classId: string; subjectId: string }[] = [];
  for (const t of teacher.teaches) {
    const name = subjectFor(t, answers, settled);
    const subjectId = name ? idFor(name, answers, school, added) : null;
    if (!subjectId) continue;
    const key = `${t.classId}\u0000${subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ classId: t.classId, subjectId });
  }
  return out;
}
