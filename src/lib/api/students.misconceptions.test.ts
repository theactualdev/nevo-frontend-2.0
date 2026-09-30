import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./client", () => ({ api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));

import { classInsightsApi } from "./students";

/**
 * The small-cell privacy floor is the SERVER'S, per rule 3 (the engine owns
 * the cutoffs). The client used to pin it at 3 on every request, which would
 * silently override a server raise meant to protect smaller classes.
 */
beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue([]);
});

describe("shared misconceptions", () => {
  it("sends no privacy floor of its own, so the server's default stands", async () => {
    await classInsightsApi.misconceptions("c-1");

    expect(get).toHaveBeenCalledTimes(1);
    const [path, opts] = get.mock.calls[0];
    expect(path).toBe("/api/misconceptions/class/c-1");
    expect(opts?.params?.minimumStudents).toBeUndefined();
  });
});
