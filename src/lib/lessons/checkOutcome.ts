import {
  LESSON_STATUS,
  type ConceptOutcome,
  type LessonProgressResponse,
} from "@/lib/api/lessons";

/**
 * "From the check-in" (B26): what the server says landed and what it will
 * revisit, by concept name, and its own paragraph about it.
 *
 * Names only. The contract's `asked` and `correct` counts stay off every
 * screen a child sees (rule 9).
 */
export interface CheckOutcome {
  mastered: string[];
  revisit: string[];
  /** `""` is no paragraph. */
  note: string;
}

/**
 * The check-in's outcome from a progress write's answer, or null.
 *
 * ONLY FROM A COMPLETED ROW. The outcome is the server's reading of a whole
 * check, and the completion write is the one that ends it - an earlier
 * write's answer could describe half a check, or the last time this lesson
 * was done, and neither is what the child just finished.
 *
 * Empty lists and an empty note are an answer, and render nothing (rule 5).
 * The client marks nothing and moves no concept between the lists.
 */
export function checkOutcomeFrom(
  row: LessonProgressResponse | null | undefined,
): CheckOutcome | null {
  if (!row || row.status !== LESSON_STATUS.COMPLETED) return null;
  return {
    mastered: namesOf(row.masteredConcepts),
    revisit: namesOf(row.revisitConcepts),
    note: row.resultNote?.trim() ?? "",
  };
}

/** Each concept once, in the server's order; a blank name is no concept. */
function namesOf(list: readonly ConceptOutcome[] | undefined): string[] {
  const seen = new Set<string>();
  for (const concept of list ?? []) {
    const name = concept?.conceptName?.trim();
    if (name) seen.add(name);
  }
  return [...seen];
}
