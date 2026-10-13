import type { LessonQuestionAttemptWrite } from "@/lib/api/lessons";
import type { AnswerChoice } from "@/lib/types/lesson";

/** `segmentId` is declared `format: uuid`; anything else would 422 the write. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One answer, as `POST /api/v1/lessons/{id}/attempts` takes it - or null when
 * there is nothing true to write.
 *
 * WHY THIS IS WRITTEN AT ALL (D36). A child may now leave the after-lesson
 * check part way, and design's ruling is that the answers already given are
 * kept. Kept where it counts: the account, server-side, marked there. The
 * device copy in `reviewStore` dies with the tab and belongs to whoever holds
 * the tablet next.
 *
 * THE ANSWER IS THE OPTION'S OWN VALUE. The sheet compares taps by a
 * stringified id, and the server marks against the checkpoint's key - so the
 * id would turn a right `2` into a wrong `"2"`. No value, no write: the
 * authored demo checks carry none, and their ids are not real questions.
 *
 * No verdict is sent. The contract is explicit that clients never submit a
 * key or decide whether they were correct; the local marking only drives what
 * the sheet shows.
 *
 * WITHOUT ITS SESSION. `sessionId` is required on the wire, and the player
 * adds it - or, with none open yet or no connection, holds the answer on the
 * device until there is one (`holdAnswer` in `pendingProgress`). It was null
 * here without a session, so an answer given offline was never kept at all.
 */
export function answerFor({
  questionId,
  segmentId,
  source,
  choice,
}: {
  /** The checkpoint's own id. */
  questionId: string | undefined;
  /** The segment an inline check sits on; absent for the after-lesson check. */
  segmentId?: string;
  source: "checkpoint" | "assessment";
  choice: AnswerChoice | undefined;
}): Omit<LessonQuestionAttemptWrite, "sessionId"> | null {
  if (!questionId) return null;
  if (choice?.value === undefined) return null;
  return {
    problemId: questionId,
    source,
    answer: choice.value,
    ...(segmentId && UUID.test(segmentId) ? { segmentId } : {}),
  };
}
