import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { post, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public readonly status: number) {
      super(`HTTP ${status}`);
    }
  }
  return { post: vi.fn(), ApiError };
});
vi.mock("./client", () => ({
  api: { post, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError,
}));

import { baselineApi } from "./baseline";

/**
 * Where the warm-up's pick goes (B8, 1 Oct).
 *
 * It rode inside the submit's features as `item: {itemId, chosenOption}`,
 * where nobody marked it, while the answer key sat on the device. It now goes
 * to its own endpoint and is marked there. The body is built here, so it is
 * asserted here: the screen tests mock this function and only ever see the
 * arguments they passed in.
 */

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset();
  post.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("answerPrompt", () => {
  it("posts the pick to the prompt's own response endpoint, as the spec names it", async () => {
    await expect(
      baselineApi.answerPrompt("child-1", { itemId: "item-7", value: "opt-b" }),
    ).resolves.toBe(true);

    expect(post).toHaveBeenCalledWith(
      "/api/baseline/recalibrate-prompt/child-1/response",
      { itemId: "item-7", value: "opt-b" },
    );
  });

  it("tries again after a blip, since a second answer never overwrites the first", async () => {
    post.mockRejectedValueOnce(new ApiError(503)).mockResolvedValueOnce({});

    const landed = baselineApi.answerPrompt("child-1", {
      itemId: "item-7",
      value: "opt-b",
    });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(landed).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("does not retry a refusal, and says it did not land", async () => {
    post.mockRejectedValue(new ApiError(422));

    await expect(
      baselineApi.answerPrompt("child-1", { itemId: "item-7", value: "x" }),
    ).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("deviceTaskDone (B54)", () => {
  it("tells the prompt's endpoint the device task finished, with no item", async () => {
    // A completion with no item is what sets `doneToday` on a device-task
    // day; nothing at all was sent on those days before.
    await expect(baselineApi.deviceTaskDone("child-1")).resolves.toBe(true);

    expect(post).toHaveBeenCalledWith(
      "/api/baseline/recalibrate-prompt/child-1/response",
      {},
    );
  });
});

describe("submitTrials (B9)", () => {
  const trial = {
    dimension: "attention",
    condition: "incongruent",
    response: "1",
    correct: false,
    responseTimeMs: 910,
    probeItemId: null,
  };

  it("posts the trials raw to /trials, as the spec names the body", async () => {
    await expect(baselineApi.submitTrials("run-1", [trial])).resolves.toBe(
      true,
    );

    expect(post).toHaveBeenCalledWith("/api/baseline/trials", {
      sessionId: "run-1",
      trials: [trial],
    });
  });

  /*
   * THE RUN'S CONTEXT, B76 (8 Oct). `BaselineTrialsRequest` is
   * `{sessionId, ageBand, formFactor, motorStepSkipped, trials}` in the live
   * spec. Asserted on the body as it goes over the wire - `JSON.stringify`, as
   * the client sends it - because a key the run did not record must not be
   * there at all, and `toHaveBeenCalledWith` cannot tell missing from
   * undefined.
   */
  const CONTRACT = [
    "ageBand",
    "formFactor",
    "motorStepSkipped",
    "sessionId",
    "trials",
  ];
  const wire = () =>
    JSON.parse(JSON.stringify(post.mock.calls[0][1])) as Record<
      string,
      unknown
    >;

  it("sends the onboarding run's band, device and motor skip beside its trials", async () => {
    await baselineApi.submitTrials("run-1", [trial], {
      ageBand: "senior_secondary",
      formFactor: "desktop_cursor",
      motorStepSkipped: true,
    });

    expect(Object.keys(wire()).sort()).toEqual(CONTRACT);
    expect(wire()).toEqual({
      sessionId: "run-1",
      ageBand: "senior_secondary",
      formFactor: "desktop_cursor",
      motorStepSkipped: true,
      trials: [trial],
    });
  });

  it("leaves out the motor skip for a warm-up, which has no motor step", async () => {
    await baselineApi.submitTrials("warmup-1", [trial], {
      ageBand: "early_primary",
      formFactor: "mobile_touch",
    });

    expect(Object.keys(wire()).sort()).toEqual(
      CONTRACT.filter((k) => k !== "motorStepSkipped"),
    );
  });

  it("sends only the session and the trials when the run recorded no context", async () => {
    // A run parked before B76: not told, never a guessed band or device.
    await baselineApi.submitTrials("run-1", [trial]);

    expect(wire()).toEqual({ sessionId: "run-1", trials: [trial] });
  });

  it("no longer sends a reduced vector to /submit", async () => {
    await baselineApi.submitTrials("run-1", [trial]);

    expect(post.mock.calls.map(([path]) => path)).not.toContain(
      "/api/baseline/submit",
    );
    expect(baselineApi).not.toHaveProperty("submitWithRetry");
    expect(baselineApi).not.toHaveProperty("submit");
  });

  it("sends nothing for a run with no answers, which the contract refuses", async () => {
    await expect(baselineApi.submitTrials("run-1", [])).resolves.toBe(false);

    expect(post).not.toHaveBeenCalled();
  });

  it("tries again after a blip, and not after a refusal", async () => {
    post.mockRejectedValueOnce(new ApiError(503)).mockResolvedValueOnce({});
    const landed = baselineApi.submitTrials("run-1", [trial]);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(landed).resolves.toBe(true);

    post.mockReset();
    post.mockRejectedValue(new ApiError(422));
    await expect(baselineApi.submitTrials("run-1", [trial])).resolves.toBe(
      false,
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});
