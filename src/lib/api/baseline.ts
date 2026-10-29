import { api, ApiError } from "./client";
import { getSession } from "@/lib/auth/session";

/** How many times a baseline submit is attempted before we accept it failed. */
const BASELINE_SUBMIT_ATTEMPTS = 3;
/** Gap before each retry. Short enough that the answer arrives while the
 *  completion screen is still on screen. */
const BASELINE_SUBMIT_BACKOFF_MS = [800, 2400];

/**
 * Baseline cognitive profiling endpoints (SCRUM-104). The device sends the
 * trials as they happened and the server does the reduction (B9, 5 Oct); see
 * `lib/profiling/capture` for how a run becomes trials.
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
  /**
   * The served question and its options. OPTIONAL SINCE 5 OCT (B65): only the
   * question task has one, and requiring them of every dimension made the
   * other five look like served questions with nothing in them.
   */
  question?: string;
  options?: { value: string; label: string }[];
  /**
   * Whether a question was served at all (B65). The one thing that says a
   * question is to be shown: the dimension is not asked to imply it.
   */
  served?: boolean;
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
 * One trial, as it happened (`BaselineTrial`, B9). Not marked by the server's
 * key and not averaged: `correct` is what the device saw for a stimulus only
 * it held, and is ignored wherever `probeItemId` names a bank item the server
 * marks itself.
 */
export interface BaselineTrial {
  dimension: string;
  condition: string | null;
  response: string | null;
  correct: boolean | null;
  /** Integer milliseconds, 0 to 600000 in the contract. */
  responseTimeMs: number | null;
  probeItemId: string | null;
  /**
   * A trial the device could not present, or a motor target left untapped
   * (B117, 13 Oct). Sent only where the capture recorded one; absent is the
   * contract's false. A "Not sure" is a response, never a skip.
   */
  skipped?: boolean;
  /**
   * The words a timed reading put on screen (Teslim 18 Oct #6; the contract
   * takes a whole number, 1 to 10000): the sentence or the passage, never the
   * question or the options, counted by `wordsShown`. Sent only on a reading
   * trial the child read, beside a response time measured for it. Absent on
   * every other trial, including a sentence heard, as the contract asks
   * ("Omit when the activity is not timed reading").
   *
   * A count of words, not a speed. The server pairs it with `responseTimeMs`
   * to derive words per minute; the device never does (rule 3).
   */
  readingWordCount?: number;
  /**
   * What a Word Conflict trial's word said, and so the response it asks for
   * (Teslim, ed123cb): LEFT or RIGHT, required on every `inhibition` trial.
   * The server marks the trial itself against it - "marks responses itself
   * rather than trusting correct from the device". Absent on every other
   * dimension.
   */
  target?: "LEFT" | "RIGHT";
  /**
   * One of Word Conflict's eight practice trials (ed123cb: "Practice feedback
   * only; excluded from baseline scoring"). Sent only where the trial was
   * one; absent is the contract's false.
   */
  practice?: boolean;
}

/**
 * What a run was built for and sat on, which goes beside its trials
 * (`BaselineTrialsRequest`, 8 Oct, B76). Each is left out when the run did
 * not record it, and the contract reads a missing one as not told.
 */
export interface BaselineRunContext {
  /**
   * The spec's closed `AgeBand`, the set the roster already sends: the band
   * the task was sized for, and only a band the server gave (B118).
   */
  ageBand?:
    | "early_primary"
    | "upper_primary"
    | "junior_secondary"
    | "senior_secondary";
  /**
   * The spec's `BaselineFormFactor`. `mobile_touch` is still accepted and
   * stored as `phone_touch`, the word this app sends for a phone.
   */
  formFactor?: "tablet_touch" | "desktop_cursor" | "phone_touch" | "mobile_touch";
  /** Onboarding only: the warm-up has no motor step to run or skip. */
  motorStepSkipped?: boolean;
  /**
   * The motor step's taps, whole milliseconds, at most eight (13 Oct, B119):
   * what proves the step ran. Sent whenever it ran and never otherwise.
   */
  motorSamplesMs?: number[];
}

/**
 * Send, and keep trying for a short while. A 4xx is not retried - the request
 * is malformed or unauthorised and the next attempt fails identically.
 *
 * Takes the call rather than a path and a body so each `api.post` below keeps
 * its body as a literal, which is what `npm run contract` checks.
 */
async function withRetry(send: () => Promise<unknown>): Promise<boolean> {
  /*
   * ONLY EVER AS THE CHILD SIGNED IN WHEN IT STARTED (19 Oct browser-storage
   * audit). Trials sent with no token are a child's measurements put on the
   * wire for nobody, and a retry a few seconds on can outlive the session it
   * began in - a lapse, a 401 elsewhere, the next child signing in. So no
   * attempt goes without a token, and none goes once the session is not the
   * one this began with: it reports not sent, and the caller keeps the trials
   * for their owner as it does for any failed write.
   */
  const as = getSession();
  if (!as?.token) return false;
  for (let attempt = 0; attempt < BASELINE_SUBMIT_ATTEMPTS; attempt++) {
    const now = getSession();
    if (!now?.token || now.userId !== as.userId) return false;
    try {
      await send();
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
   * (`BaselinePromptResult`) no longer carries a verdict on the pick (B55),
   * and nothing on the device would have a use for one (rule 9).
   */
  answerPrompt: (studentId: string, pick: { itemId: string; value: string }) =>
    withRetry(() =>
      api.post(`/api/baseline/recalibrate-prompt/${studentId}/response`, {
        itemId: pick.itemId,
        value: pick.value,
      }),
    ),

  /**
   * Word that today's DEVICE task finished, on a day no question was served
   * (B54, 5 Oct). The same endpoint with no item: "a completion with no item
   * is accepted for exactly that reason".
   *
   * Nothing was sent on five days in six, so `doneToday` stayed false on the
   * account and a second tablet offered the child a second run - and took a
   * second measurement.
   */
  deviceTaskDone: (studentId: string) =>
    withRetry(() =>
      api.post(`/api/baseline/recalibrate-prompt/${studentId}/response`, {}),
    ),

  /**
   * The run's trials, raw, for the server to reduce (B9, 5 Oct).
   *
   * `POST /api/baseline/trials`, body `BaselineTrialsRequest`
   * `{sessionId, ageBand, formFactor, motorStepSkipped, motorSamplesMs,
   * trials}`. The four in the middle are the run's context (B76, 8 Oct; B119,
   * 13 Oct); whichever the run did not record is undefined, so it never
   * reaches the wire. `motorMissCount` is not sent: the step records no miss
   * (a touch off the target does nothing), and what counts as one is asked.
   * It replaced `POST /api/baseline/submit`, which took
   * a vector the device had already reduced - accuracy, mean response time,
   * spans - and which the spec now describes as the thing the architecture
   * forbids. Nothing here calls it any more.
   *
   * Kept trying for a short while, because the run is several minutes of a
   * child's attention and it happens ONCE: the first version fired and
   * forgot, and a momentary blip cost the engine its whole picture of that
   * child. A 4xx is not retried - the batch is malformed or unauthorised and
   * the next attempt fails identically.
   *
   * The contract takes one to 600 trials. An empty run has nothing to send,
   * so nothing is sent, and that is not a delivery.
   */
  submitTrials: (
    sessionId: string,
    trials: BaselineTrial[],
    context: BaselineRunContext = {},
  ): Promise<boolean> =>
    trials.length === 0
      ? Promise.resolve(false)
      : withRetry(() =>
          api.post("/api/baseline/trials", {
            sessionId,
            ageBand: context.ageBand,
            formFactor: context.formFactor,
            motorStepSkipped: context.motorStepSkipped,
            motorSamplesMs: context.motorSamplesMs,
            trials,
          }),
        ),
};
