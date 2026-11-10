import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, api: { ...actual.api, post } };
});

import { attentionApi } from "./attention";

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const RETURN = {
  action: "return" as const,
  segmentId: "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e",
  clientEventId: "9868c7a0-20d2-485c-82b9-45463fd15557",
  clientAwayDurationMs: 120_000,
};

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

describe("attentionApi.report", () => {
  it("sends the report as it is, to its sitting", async () => {
    await attentionApi.report(SESSION, RETURN);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/students/me/sessions/${SESSION}/attention`,
      RETURN,
      undefined,
    );
  });

  it("lets an away outlive the page", async () => {
    const away = {
      action: "away" as const,
      segmentId: RETURN.segmentId,
      clientEventId: "d547cd66-31eb-4a46-9c64-b2048b2a27f7",
    };
    await attentionApi.report(SESSION, away, { keepalive: true });

    expect(post.mock.calls[0][2]).toEqual({ keepalive: true });
  });

  it("carries a return's time on screen as it is given", async () => {
    const back = { ...RETURN, clientVisibleForMs: 9_000 };
    await attentionApi.report(SESSION, back);

    expect(post.mock.calls[0][1]).toEqual(back);
  });
});
