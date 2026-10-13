import { api } from "./client";

/**
 * The school's subject list (SCRUM-194).
 *
 * An assignment is a teacher, a class AND a subject now: "Pick the teacher,
 * pick one of her subjects, tick the classes she teaches it to." The subject
 * must be on the class's list (its scheme of work) and on the teacher's, and
 * neither list is widened as a side effect - a 422 names which one is short.
 *
 * A teacher's own subjects are on `TeacherDetailResponse` (8 Oct), which is
 * how D05 marks what a teacher "Teaches", and the admin sets them on the
 * teacher's page (`teachersApi.setSubjects`, 9 Oct). A pick the teacher does
 * not hold is still refused by the server with `subject_not_on_teacher`, and
 * that sentence is shown as it stands.
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

/**
 * "Maths and Mathematics, same subject or different?" - one pair of spellings
 * the school's files used, still waiting on an answer. Until it is answered
 * the two are already one subject, `keptName` the fuller spelling.
 */
export interface SpellingQuestion {
  id: string;
  keptName: string;
  otherName: string;
  question: string;
}

export const subjectsApi = {
  /** GET /api/v1/subjects - what this school can put on a class or a teacher. */
  list: () => api.get<SchoolSubject[]>("/api/v1/subjects"),

  /** GET /api/v1/subjects/spelling-questions - every pair still open. */
  spellingQuestions: () =>
    api.get<SpellingQuestion[]>("/api/v1/subjects/spelling-questions"),

  /**
   * Settle one pair: `same` lets the fold stand; not same splits the other
   * spelling back out as the school's own subject. Answers with the subjects
   * as they now stand. 409 `question_already_answered` if someone got there
   * first.
   */
  answerSpelling: (questionId: string, same: boolean) =>
    api.post<SchoolSubject[]>(
      `/api/v1/subjects/spelling-questions/${encodeURIComponent(questionId)}`,
      { same },
    ),
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
