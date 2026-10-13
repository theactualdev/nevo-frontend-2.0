import { beforeEach, describe, expect, it, vi } from "vitest";

const { patch, del } = vi.hoisted(() => ({ patch: vi.fn(), del: vi.fn() }));
vi.mock("./client", () => ({ api: { patch, del, get: vi.fn(), post: vi.fn() } }));

import { applyToAssignments, assignmentsApi, cancelAssignments } from "./assignments";

/**
 * An assignment is per-student even when a teacher created it for a class, so
 * "cancel this for JSS 2A" is thirty writes. Thirty writes can half-succeed.
 *
 * This console's most expensive recurring defect is a failed write that looked
 * exactly like a successful one, so the property worth pinning is not "it
 * works" - it is that a partial result is never reported as a whole one.
 */

beforeEach(() => {
  patch.mockReset();
  patch.mockResolvedValue({});
});

describe("update", () => {
  it("PATCHes the one assignment, sending only what changed", async () => {
    await assignmentsApi.update("a-1", { status: "cancelled" });
    expect(patch).toHaveBeenCalledWith("/api/v1/assignments/a-1", {
      status: "cancelled",
    });
  });

  it("encodes the id rather than interpolating it raw", async () => {
    await assignmentsApi.update("a/1", { dueAt: null });
    expect(patch).toHaveBeenCalledWith("/api/v1/assignments/a%2F1", { dueAt: null });
  });
});

describe("applyToAssignments", () => {
  it("reports every id when they all land", async () => {
    const { ok, failed } = await applyToAssignments(["a", "b", "c"], {
      status: "cancelled",
    });

    expect(ok).toEqual(["a", "b", "c"]);
    expect(failed).toEqual([]);
    expect(patch).toHaveBeenCalledTimes(3);
  });

  it("does NOT throw when some fail, and names which", async () => {
    // The assertion this file exists for. `Promise.all` would reject on the
    // first failure and lose the fact that two of three landed - leaving the
    // screen unable to say anything true.
    patch
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({});

    const { ok, failed } = await applyToAssignments(["a", "b", "c"], {
      status: "cancelled",
    });

    expect(ok).toEqual(["a", "c"]);
    expect(failed).toEqual(["b"]);
  });

  it("still attempts every id after one fails", async () => {
    // A short-circuit would leave later children untouched while the teacher
    // was told the class was done.
    patch.mockRejectedValueOnce(new Error("boom"));
    await applyToAssignments(["a", "b", "c"], { status: "cancelled" });
    expect(patch).toHaveBeenCalledTimes(3);
  });

  it("reports a total failure as a total failure", async () => {
    patch.mockRejectedValue(new Error("down"));
    const { ok, failed } = await applyToAssignments(["a", "b"], { dueAt: null });

    expect(ok).toEqual([]);
    expect(failed).toEqual(["a", "b"]);
  });
});

/**
 * SCRUM-225: a cancellation is a DELETE that carries its reason, and it keeps
 * the row - so it is safe now, where it used to drop the record.
 */
describe("cancelling with a reason", () => {
  beforeEach(() => del.mockReset());

  it("sends the reason in the body, for each assignment", async () => {
    del.mockResolvedValue(undefined);
    await cancelAssignments(["a-1", "a 2"], "housekeeping");

    expect(del).toHaveBeenCalledWith("/api/v1/assignments/a-1", { body: { reason: "housekeeping" } });
    expect(del).toHaveBeenCalledWith("/api/v1/assignments/a%202", { body: { reason: "housekeeping" } });
  });

  it("reports what landed and what did not, never all-or-nothing", async () => {
    del.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("down"));
    expect(await cancelAssignments(["a-1", "a-2"], "wrong_class")).toEqual({
      ok: ["a-1"],
      failed: ["a-2"],
    });
  });
});
