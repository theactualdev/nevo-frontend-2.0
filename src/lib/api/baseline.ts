import { api, ApiError } from "./client";

/** How many times a baseline submit is attempted before we accept it failed. */
const BASELINE_SUBMIT_ATTEMPTS = 3;
/** Gap before each retry. Short enough that the answer arrives while the
 *  completion screen is still on screen. */
const BASELINE_SUBMIT_BACKOFF_MS = [800, 2400];

/**
 * Baseline cognitive profiling endpoints (SCRUM-104). The client reduces raw
 * interaction streams to a feature vector before transmission; raw data never
 * leaves the device (see `lib/profiling/capture`).
 */
/**
 * Which dimension Nevo wants recalibrated next.
 *
 * Typed as a bare string on purpose: the spec declares it so, and the
 * previous `BaselineDimension` typing quietly promised the value would be one
 * of our six. Callers match it and fall back when it is not.
 */
export interface RecalibratePrompt {
  dimension: string;
  /**
   * The item the engine is serving with it (`BaselinePromptResponse`, 1 Oct).
   * The question rotates when a dimension comes round again.
   */
  itemId: string;
  question: string;
  options: { value: string; label: string }[];
  /**
   * Whether today's warm-up is behind this child, held against the ACCOUNT
   * (B10, 1 Oct), so a second tablet sees it too. Optional because a
   * deployment older than 1 Oct sends neither field, and absent is "not
   * told", which is not the claim `false` makes.
   *
   * `answer`, the answer key, is gone from the wire and from here: the pick
   * now goes to `answerPrompt` and is marked server-side (B8).
   */
  doneToday?: boolean;
  answeredAt?: string | null;
}

/**
 * POST, and keep trying for a short while. A 4xx is not retried - the request
 * is malformed or unauthorised and the next attempt fails identically.
 */
async function postWithRetry(path: string, body: unknown): Promise<boolean> {
  for (let attempt = 0; attempt < BASELINE_SUBMIT_ATTEMPTS; attempt++) {
    try {
      await api.post(path, body);
      return true;
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      if (status >= 400 && status < 500) return false;
      if (attempt === BASELINE_SUBMIT_ATTEMPTS - 1) return false;
      await new Promise((r) =>
        setTimeout(r, BASELINE_SUBMIT_BACKOFF_MS[attempt]),
      );
    }
  }
  return false;
}

export const baselineApi = {
  /** The dimension the engine wants recalibrated next. */
  recalibratePrompt: (studentId: string) =>
    api.get<RecalibratePrompt>(
      `/api/baseline/recalibrate-prompt/${studentId}`,
    ),

  /**
   * The child's pick on the served question, UNMARKED (B8, 1 Oct).
   *
   * `POST /api/baseline/recalibrate-prompt/{student_id}/response`, body
   * `BaselinePromptAnswer` `{itemId, value}` - the option's `value`, never its
   * label. The server marks it; the key never reaches the device. It used to
   * ride inside the submit's features as `item: {itemId, chosenOption}`, where
   * nobody marked it.
   *
   * Retried like the submit. A retry after a write that did land is harmless:
   * "answering twice on the same day is accepted and does not overwrite the
   * first answer".
   *
   * Resolves to whether it landed, and nothing else. The reply
   * (`BaselinePromptResult`) carries `correct`, the server's verdict on the
   * pick, and it is deliberately never read: nothing on the device has a use
   * for a verdict on a child (rule 9).
   */
  answerPrompt: (studentId: string, pick: { itemId: string; value: string }) =>
    postWithRetry(
      `/api/baseline/recalibrate-prompt/${studentId}/response`,
      pick,
    ),

  /** Submit the reduced feature vector at the end of the profiling run. */
  submit: (sessionId: string, features: Record<string, unknown>[]) =>
    api.post("/api/baseline/submit", { sessionId, features }),

  /**
   * Submit, and keep trying for a short while.
   *
   * The baseline run is several minutes of a child's attention and it happens
   * ONCE. The first version fired and forgot: a failed submit was swallowed,
   * the raw capture purged anyway, and the flow advanced to "All set" - so a
   * momentary blip cost the engine its entire picture of that child, silently
   * and unrecoverably.
   *
   * Three attempts with a widening gap covers the blip case without making a
   * child wait: the run never blocks on this, it resolves in the background
   * and the completion screen reports whichever way it lands.
   *
   * A 4xx is not retried - the batch is malformed or unauthorised and the next
   * attempt fails identically.
   */
  submitWithRetry: (
    sessionId: string,
    features: Record<string, unknown>[],
  ): Promise<boolean> =>
    postWithRetry("/api/baseline/submit", { sessionId, features }),
};
