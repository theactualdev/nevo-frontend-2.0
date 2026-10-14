import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `allOpen` reads every concern nobody has marked as seen (14 Oct:
 * `openOnly`, `limit`, `offset`), and says whether it got to the end - the
 * Learning Support screen counts them and may say "none are waiting" only
 * on a complete read.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, api: { ...actual.api, get: (path: string, opts: unknown) => get(path, opts) } };
});

import { escalationsApi, type Escalation } from "./escalations";

const row = (id: string): Escalation => ({
  id,
  studentId: "s1",
  studentFirstName: "Ada",
  teacherId: "t1",
  note: "…",
  recentPicture: "",
  generatedAt: "2026-10-14T09:00:00Z",
  acknowledged: false,
});
const page = (n: number, from = 0) => Array.from({ length: n }, (_, i) => row(`e${from + i}`));

beforeEach(() => get.mockReset());

describe("escalationsApi.allOpen", () => {
  it("asks for open ones only, and stops at a short page", async () => {
    get.mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(3, 100));
    const { open, complete } = await escalationsApi.allOpen();
    expect(open).toHaveLength(103);
    expect(complete).toBe(true);
    expect(get).toHaveBeenNthCalledWith(1, "/api/v1/escalations", {
      params: { openOnly: true, limit: 100, offset: 0 },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/escalations", {
      params: { openOnly: true, limit: 100, offset: 100 },
    });
  });

  it("is complete on an empty first page", async () => {
    get.mockResolvedValueOnce([]);
    expect(await escalationsApi.allOpen()).toEqual({ open: [], complete: true });
  });

  it("says it isn't complete when the pages run out on a full one", async () => {
    get.mockResolvedValue(page(100));
    const { open, complete } = await escalationsApi.allOpen(2);
    expect(open).toHaveLength(200);
    expect(complete).toBe(false);
  });
});
