import {
  LESSON_STATUS,
  type ConceptOutcome,
  type LessonProgressResponse,
  type LessonReroute,
  type ResultState,
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
 * The check-in's outcome from a progress row, or null: the completion
 * write's answer, or the dashboard's row for the lesson (B84, 8 Oct), which
 * carries the same three fields.
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
  row:
    | Pick<
        LessonProgressResponse,
        "status" | "masteredConcepts" | "revisitConcepts" | "resultNote"
      >
    | null
    | undefined,
): CheckOutcome | null {
  if (!row || row.status !== LESSON_STATUS.COMPLETED) return null;
  return {
    mastered: namesOf(row.masteredConcepts),
    revisit: namesOf(row.revisitConcepts),
    note: row.resultNote?.trim() ?? "",
  };
}

type CompletedRow = Pick<
  LessonProgressResponse,
  "status" | "resultState" | "reroute"
>;

const RESULT_STATES: readonly ResultState[] = [
  "landed",
  "partly_landed",
  "nothing_landed",
  "not_attempted",
];

/**
 * How the lesson went, as the SERVER says it (B98, 8 Oct): derived from the
 * newest marked attempt per problem, and returned on the completion write.
 * The client used to decide "nothing landed" from its own count of right
 * answers; it counts nothing now. Only from a completed row, for the reason
 * `checkOutcomeFrom` gives, and null for a value it does not know.
 */
export function resultStateFrom(
  row: CompletedRow | null | undefined,
): ResultState | null {
  if (!row || row.status !== LESSON_STATUS.COMPLETED) return null;
  const state = row.resultState;
  return state && RESULT_STATES.includes(state) ? state : null;
}

/**
 * The reroute to follow (SCRUM-178), when the server says nothing landed and
 * has opened the way back through: SCRUM-181's "That version didn't work."
 * and its Start again. Never for `not_attempted` - "a lesson the child never
 * attempted resumes instead" - and never without a place to start from.
 */
export function rerouteFrom(
  row: CompletedRow | null | undefined,
): LessonReroute | null {
  if (resultStateFrom(row) !== "nothing_landed") return null;
  const reroute = row?.reroute;
  if (!reroute || reroute.reason !== "nothing_landed") return null;
  const at = reroute.segmentPosition;
  return Number.isInteger(at) && at >= 0 ? reroute : null;
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
