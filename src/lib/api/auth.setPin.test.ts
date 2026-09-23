import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({
  api: { post, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
  apiErrorCode: () => null,
}));

import { authApi } from "./auth";

/**
 * What `POST /api/v1/auth/pin` is actually sent.
 *
 * Tested here rather than through the screen because the screen mocks this
 * function - a mutation that stopped sending `currentPin` altogether passed
 * every screen test, since the screen only ever sees the arguments it passed
 * in. The body is built here, so it is asserted here.
 */

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

describe("changing an existing PIN", () => {
  it("carries the current PIN, which the server now enforces", async () => {
    await authApi.setPin("2222", "1111");

    expect(post).toHaveBeenCalledWith("/api/v1/auth/pin", {
      pin: "2222",
      currentPin: "1111",
    });
  });
});

describe("setting a first PIN", () => {
  it("omits the field rather than sending it empty", async () => {
    /*
     * The SSO path has nothing to prove and no current PIN to send. Omitted
     * and null are different claims: a null would be us asserting "there is no
     * current PIN" about an account, which is the server's business and not
     * something this client knows.
     */
    await authApi.setPin("2222");

    expect(post).toHaveBeenCalledWith("/api/v1/auth/pin", { pin: "2222" });
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect("currentPin" in body).toBe(false);
  });

  it("omits it for an empty string too", async () => {
    // A caller that has collected nothing has collected nothing.
    await authApi.setPin("2222", "");

    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect("currentPin" in body).toBe(false);
  });
});
