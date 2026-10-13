import type { ScaffoldAttempt } from "@/lib/api/scaffolds";
import type { AssessmentQuestion } from "@/lib/types";
import type { AnswerChoice } from "@/lib/types/lesson";

/** `lessonId` is declared `format: uuid`; anything else would 422 the write. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `ScaffoldAttemptRequest.answer` is `maxLength: 400`. */
const ANSWER_MAX = 400;

/**
 * The scaffold attempt an answered question is worth reporting, or **null**.
 *
 * Separate from the player for the same reason `classifyLoginFailure` is
 * separate from the login screen: the half that can be wrong is the deciding,
 * so it lives where it can be tested.
 *
 * ## What it reports
 *
 * What happened, and nothing derived. The server answers with the next
 * intensity, whether it moved, and why - none of which is computed here, and
 * most of which is never rendered. Rule 3.
 *
 * ## The child's pick, and why the verdict still rides beside it (B27)
 *
 * The attempt now carries the option the child chose - its own value, the
 * same thing `POST /attempts` sends - and the lesson it came from, so the
 * server holds the answer rather than only our reading of it.
 *
 * `responseCorrect` is STILL SENT, and the contract is why. The server marks
 * the pick "where the attempt names a lesson segment we hold ... against the
 * answer stored on that segment's calculation", and takes `responseCorrect`
 * where it cannot. This caller is the after-lesson check: lesson-level
 * questions, on no segment and with no calculation behind them. Dropping the
 * verdict here would leave the server nothing to mark with, and backend's own
 * words on that case are that losing the evidence is worse than the client's
 * verdict. Raised with backend: mark these by `problemId` against the stored
 * key, as `POST /attempts` already does, and this line goes.
 *
 * ## The four reasons it returns null
 *
 * **No `problemId`.** The question was not built from a checkpoint - the two
 * authored mocks are the case - so there is no stable identifier. Inventing one
 * from the question's position would key the engine's per-problem history to an
 * array index that moves whenever content is re-authored.
 *
 * **No `conceptId`.** The engine is keyed per student per concept. A question
 * that resolves to no concept cannot inform one, and guessing which concept a
 * lesson "is about" would attribute a child's answer to something nobody said
 * it was about.
 *
 * **No signed-in child.** The designed walkthrough. There is nobody to record
 * an attempt for, and the endpoint is Bearer-only.
 *
 * **Nothing at all to say.** Returning a half-filled body and letting the
 * server 422 it would put the decision in the wrong place.
 */
export function scaffoldAttemptFor({
  question,
  correct,
  studentId,
  responseTimeMs,
  choice,
  lessonId,
}: {
  question: Pick<AssessmentQuestion, "id" | "conceptId">;
  correct: boolean;
  studentId: string | null | undefined;
  /** Measured, never estimated - absent when nothing timed the answer. */
  responseTimeMs?: number;
  /** The option the child confirmed. Its value is what is sent. */
  choice?: AnswerChoice;
  /** The lesson the question belongs to. */
  lessonId?: string;
}): ScaffoldAttempt | null {
  if (!studentId || !question.id || !question.conceptId) return null;
  // The option's own value, as text. None on the authored demo checks, and a
  // value too long to send whole is left off rather than cut into another.
  const answer = choice?.value === undefined ? undefined : String(choice.value);
  return {
    studentId,
    conceptId: question.conceptId,
    problemId: question.id,
    ...(lessonId && UUID.test(lessonId) ? { lessonId } : {}),
    ...(answer !== undefined && answer.length <= ANSWER_MAX ? { answer } : {}),
    responseCorrect: correct,
    // `minimum: 0`, integer. A missing time is omitted, never a made-up 0.
    ...(typeof responseTimeMs === "number" && Number.isFinite(responseTimeMs)
      ? { responseTimeMs: Math.max(0, Math.round(responseTimeMs)) }
      : {}),
  };
}
