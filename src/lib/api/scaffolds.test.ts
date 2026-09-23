import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./client", () => ({ api: { get, post, patch: vi.fn() } }));

import { scaffoldsApi } from "./scaffolds";

/**
 * Transport only. The engine decides; these tests pin that the decision
 * arrives whole and that the ids in the path are the ones asked for.
 */

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

const state = {
  studentId: "s-1",
  conceptId: "c-1",
  currentIntensity: "hints_only",
  consecutiveCorrect: 3,
  responseTimeImprovementStreak: 1,
  reducedHintStreak: 0,
  lastResponseTimeMs: 4200,
  lastHintCount: 1,
};

describe("state", () => {
  it("asks for one child on one concept", async () => {
    get.mockResolvedValue(state);

    const res = await scaffoldsApi.state("s-1", "c-1");

    expect(get).toHaveBeenCalledWith(
      "/api/intelligence/scaffolds/state/s-1/c-1",
    );
    expect(res.currentIntensity).toBe("hints_only");
  });

  it("escapes both ids rather than pasting them into the path", async () => {
    get.mockResolvedValue(state);

    await scaffoldsApi.state("s/1", "fractions & ratio");

    expect(get).toHaveBeenCalledWith(
      "/api/intelligence/scaffolds/state/s%2F1/fractions%20%26%20ratio",
    );
  });

  it("carries the engine parameters, which exist to be sent and not shown", async () => {
    // Typed because the contract sends them. The Zero-Tag ruling keeps them
    // off every surface, including accessible names - but erasing them from
    // the type is the `fromContent` defect, not compliance.
    get.mockResolvedValue(state);

    const res = await scaffoldsApi.state("s-1", "c-1");

    expect(res.consecutiveCorrect).toBe(3);
    expect(res.responseTimeImprovementStreak).toBe(1);
    expect(res.reducedHintStreak).toBe(0);
  });
});

describe("attempt", () => {
  it("returns the decision whole, including the words we do not render", async () => {
    /*
     * `studentMessage` is required on the wire and has no home on any frame.
     * It is typed so it is not erased while design decides where it goes - the
     * opposite mistake from rendering it somewhere we invented.
     */
    post.mockResolvedValue({
      state,
      previousIntensity: "full_support",
      nextIntensity: "partial_support",
      outcome: "correct",
      levelChanged: true,
      changeReason: "three in a row",
      studentMessage: "You're getting this.",
    });

    const res = await scaffoldsApi.attempt({
      studentId: "s-1",
      conceptId: "c-1",
      problemId: "p-1",
      responseCorrect: true,
    });

    expect(res.nextIntensity).toBe("partial_support");
    expect(res.levelChanged).toBe(true);
    expect(res.changeReason).toBe("three in a row");
    expect(res.studentMessage).toBe("You're getting this.");
    expect(post).toHaveBeenCalledWith("/api/intelligence/scaffolds/attempt", {
      studentId: "s-1",
      conceptId: "c-1",
      problemId: "p-1",
      responseCorrect: true,
    });
  });
});

describe("history", () => {
  it("narrows server-side rather than filtering what came back", async () => {
    get.mockResolvedValue([]);

    await scaffoldsApi.history("s-1", { conceptId: "c-1", limit: 20 });

    expect(get).toHaveBeenCalledWith(
      "/api/intelligence/scaffolds/history/s-1",
      { params: { conceptId: "c-1", limit: 20 } },
    );
  });
});
