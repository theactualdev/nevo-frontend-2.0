import { LESSON_STATUS } from "@/lib/api/lessons";
import type { DashboardProgressRow } from "@/lib/api/students";

/**
 * Whether a child's progress row says the lesson is FINISHED: it carries a
 * `completedAt`, or its status is `completed`.
 *
 * TWO FACTS, BECAUSE THE STATUS ALONE WAS DEMOTED. Before review mode
 * (Teslim, 21 Oct) opening a completed lesson set the row back to
 * `in_progress` at its last segment, so a child who looked back at a
 * finished lesson found it under "Pick up where you left off" and reopened
 * it on the last section. `completedAt` survived that, and the dashboard row
 * carries it now. The server reads the same two facts when it decides a
 * reopen is a review (`start_lesson_session`).
 *
 * A finish with no marked answers is `not_attempted`: the server keeps it
 * `in_progress` and sets no `completedAt`, so it is not finished here either.
 * The client marks nothing.
 */
export function isFinishedRow(
  row: Pick<DashboardProgressRow, "status" | "completedAt"> | null | undefined,
): boolean {
  if (!row) return false;
  return row.status === LESSON_STATUS.COMPLETED || Boolean(row.completedAt);
}
