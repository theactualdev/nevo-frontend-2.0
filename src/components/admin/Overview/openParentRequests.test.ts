import { beforeEach, describe, expect, it, vi } from "vitest";

const { rightsLog } = vi.hoisted(() => ({ rightsLog: vi.fn() }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { rightsLog: (q: unknown) => rightsLog(q) } }));

import { openParentRequests } from "./openParentRequests";

/**
 * L51: the open requests from parents, read off every page of the rights log
 * (it has a total but no count by state). Unknown is null, never a short count.
 */

const rows = (n: number, open: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, resolvedAt: i < open ? null : "2026-11-22T09:00:00Z" }));

beforeEach(() => rightsLog.mockReset());

describe("openParentRequests", () => {
  it("counts the unresolved rows on every page, and stops at the total", async () => {
    rightsLog
      .mockResolvedValueOnce({ entries: rows(100, 7), total: 130, limit: 100, offset: 0 })
      .mockResolvedValueOnce({ entries: rows(30, 2), total: 130, limit: 100, offset: 100 });
    await expect(openParentRequests()).resolves.toBe(9);
    expect(rightsLog).toHaveBeenCalledTimes(2);
    expect(rightsLog).toHaveBeenLastCalledWith({ limit: 100, offset: 100 });
  });

  it("is zero for a school with none", async () => {
    rightsLog.mockResolvedValueOnce({ entries: [], total: 0, limit: 100, offset: 0 });
    await expect(openParentRequests()).resolves.toBe(0);
  });

  it("is unknown past its page cap with pages still to read - never a partial count", async () => {
    // A log far longer than any school's: every page full, the total never reached.
    rightsLog.mockImplementation(async (q: { offset: number }) => ({
      entries: rows(100, 1),
      total: 1_000_000,
      limit: 100,
      offset: q.offset,
    }));
    await expect(openParentRequests()).resolves.toBeNull();
    expect(rightsLog).toHaveBeenCalledTimes(20);
  });

  it("is unknown when any page fails - never the pages it managed", async () => {
    rightsLog
      .mockResolvedValueOnce({ entries: rows(100, 7), total: 130, limit: 100, offset: 0 })
      .mockRejectedValueOnce(new Error("500"));
    await expect(openParentRequests()).resolves.toBeNull();
  });
});
