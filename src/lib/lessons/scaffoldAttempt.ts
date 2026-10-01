import type { ScaffoldAttempt } from "@/lib/api/scaffolds";
import type { AssessmentQuestion } from "@/lib/types";

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
}: {
  question: Pick<AssessmentQuestion, "id" | "conceptId">;
  correct: boolean;
  studentId: string | null | undefined;
  /** Measured, never estimated - absent when nothing timed the answer. */
  responseTimeMs?: number;
}): ScaffoldAttempt | null {
  if (!studentId || !question.id || !question.conceptId) return null;
  return {
    studentId,
    conceptId: question.conceptId,
    problemId: question.id,
    responseCorrect: correct,
    // `minimum: 0`, integer. A missing time is omitted, never a made-up 0.
    ...(typeof responseTimeMs === "number" && Number.isFinite(responseTimeMs)
      ? { responseTimeMs: Math.max(0, Math.round(responseTimeMs)) }
      : {}),
  };
}
