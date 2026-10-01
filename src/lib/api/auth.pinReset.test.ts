import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({
  api: { post, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
  apiErrorCode: () => null,
}));

import { authApi } from "./auth";

/**
 * What 00a's "Let my teacher know" sends (D3). `PinResetRequest` is exactly
 * `{schoolCode, loginIdentifier}`, both required - and nothing about a PIN,
 * because nobody but the child ever sets one.
 */

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

describe("asking for a forgotten PIN to be cleared", () => {
  it("posts the remembered pair to the request route, and no PIN", async () => {
    await authApi.requestPinReset({
      schoolCode: "NEVO-1",
      loginIdentifier: "ada.o",
    });

    expect(post).toHaveBeenCalledWith("/api/v1/auth/pin/reset", {
      schoolCode: "NEVO-1",
      loginIdentifier: "ada.o",
    });
    expect(JSON.stringify(post.mock.calls[0][1])).not.toMatch(/pin"/i);
  });
});
