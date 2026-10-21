import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, api: { ...actual.api, get } };
});

import { ageChecksApi, holdStage, type AgeCheck } from "./ageChecks";

const check = (over: Partial<AgeCheck>): AgeCheck => ({
  id: "ac",
  studentId: "s",
  studentFirstName: "Tunde",
  schoolDateOfBirth: "2013-03-14",
  state: "mismatch",
  differs: true,
  blocksAccess: true,
  enrolledAgeBand: null,
  holdReasons: [],
  schoolNotifiedAt: null,
  deletionDueAt: null,
  schoolRecheckedAt: null,
  parentReconfirmedAt: null,
  ...over,
});

beforeEach(() => get.mockReset());

describe("held", () => {
  it("is the server's blocksAccess and nothing else", async () => {
    get.mockResolvedValue([
      check({ id: "a", blocksAccess: true }),
      check({ id: "b", blocksAccess: false, state: "mismatch" }),
      check({ id: "c", blocksAccess: false, state: "resolved" }),
    ]);
    expect((await ageChecksApi.held()).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("holdStage", () => {
  it("reads the stage from which re-checks the server has recorded - nothing compared", () => {
    expect(holdStage(check({}))).toBe("school");
    expect(holdStage(check({ schoolRecheckedAt: "2026-10-21T09:00:00Z" }))).toBe("parent");
    expect(
      holdStage(check({ schoolRecheckedAt: "2026-10-21T09:00:00Z", parentReconfirmedAt: "2026-10-21T10:00:00Z" })),
    ).toBe("both");
  });
});
