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

describe("submitWithRetry", () => {
  it("still posts the vector to the submit endpoint", async () => {
    await baselineApi.submitWithRetry("run-1", [{ module: "warmup" }]);

    expect(post).toHaveBeenCalledWith("/api/baseline/submit", {
      sessionId: "run-1",
      features: [{ module: "warmup" }],
    });
  });
});
