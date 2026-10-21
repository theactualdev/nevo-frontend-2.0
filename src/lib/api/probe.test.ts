import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./client", () => ({
  api: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import { probeApi } from "./probe";

/**
 * The lesson-scoped probe (SCRUM-266, Teslim 21 Oct): readiness and `next`
 * take a `lessonId` as a query, and with it the server asks about that
 * lesson's concepts. The half that can be wrong: the lesson not reaching the
 * server, or an empty one reaching it when there is none. (`answer` carries
 * it in the body it is handed: `DomainProbeModule`'s tests pin that.)
 */

const LESSON = "9c1e77aa-1111-4222-8333-444455556666";

beforeEach(() => {
  get.mockReset().mockResolvedValue({});
});

describe("the lesson Module 4 is finished for", () => {
  it("goes on readiness as `?lessonId=`, and nothing goes without one", async () => {
    await probeApi.readiness(LESSON);
    await probeApi.readiness();

    expect(get.mock.calls).toEqual([
      ["/api/v1/students/me/onboarding", { params: { lessonId: LESSON } }],
      ["/api/v1/students/me/onboarding", undefined],
    ]);
  });

  it("goes on the probe's next as `?lessonId=`, and nothing goes without one", async () => {
    await probeApi.next("sub-bio", LESSON);
    await probeApi.next("sub-bio");

    expect(get.mock.calls).toEqual([
      ["/api/v1/probe/sub-bio/next", { params: { lessonId: LESSON } }],
      ["/api/v1/probe/sub-bio/next", undefined],
    ]);
  });
});
