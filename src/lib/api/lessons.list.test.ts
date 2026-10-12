import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./client", () => ({ api: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } }));

import { lessonsApi } from "./lessons";

/**
 * The library read, a page at a time (12 Oct). `GET /api/content/lessons`
 * stopped at 200 with no way to ask for the next 200; it takes `offset` now,
 * and the walk in `useLessonLibrary` is only as good as what this sends.
 */

beforeEach(() => {
  get.mockReset().mockResolvedValue([]);
});

describe("the lesson list", () => {
  it("asks for a page by limit and offset", async () => {
    await lessonsApi.list({ limit: 200, offset: 400 });

    expect(get).toHaveBeenCalledWith("/api/content/lessons", {
      params: { limit: 200, offset: 400 },
    });
  });

  it("sends no offset for the first page", async () => {
    await lessonsApi.list({ limit: 200, offset: 0 });

    expect(get).toHaveBeenCalledWith("/api/content/lessons", { params: { limit: 200 } });
  });

  it("sends nothing it was not asked for", async () => {
    await lessonsApi.list();

    expect(get).toHaveBeenCalledWith("/api/content/lessons", { params: undefined });
  });
});
