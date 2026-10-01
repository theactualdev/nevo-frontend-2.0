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
   * DECLARED BECAUSE THE WIRE CARRIES IT. NEVER READ.
   *
   * The answer key arrives on the device with the question. The frontend
   * marks nothing (rule 3, and the attempts contract's own words: "clients
   * never ... decide whether they were correct"), so the warm-up records which
   * option was picked and leaves marking to whoever receives it.
   */
  answer: string;
}

export const baselineApi = {
  /** The dimension the engine wants recalibrated next. */
  recalibratePrompt: (studentId: string) =>
    api.get<RecalibratePrompt>(
      `/api/baseline/recalibrate-prompt/${studentId}`,
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
  submitWithRetry: async (
    sessionId: string,
    features: Record<string, unknown>[],
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < BASELINE_SUBMIT_ATTEMPTS; attempt++) {
      try {
        await api.post("/api/baseline/submit", { sessionId, features });
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
  },
};
