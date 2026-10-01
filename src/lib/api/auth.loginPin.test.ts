import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({
  api: { post, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
  apiErrorCode: () => null,
}));
vi.mock("@/lib/auth/session", () => ({
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

import { authApi } from "./auth";

/**
 * What `POST /api/v1/auth/login/pin` is actually sent.
 *
 * Both sign-in screens mock `loginPin`, so they only ever see the arguments
 * they passed in. The field the server reads is decided here, so it is
 * asserted here.
 */

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({
    accessToken: "tok",
    expiresAt: "2026-10-02T00:00:00Z",
    userId: "student-1",
    role: "student",
  });
});

describe("signing in with a PIN", () => {
  it("sends the identifier as admissionNumber, the contract's name since 1 Oct", async () => {
    await authApi.loginPin({
      schoolCode: "NEVO-1234",
      loginIdentifier: "amara.o",
      pin: "1234",
    });

    expect(post).toHaveBeenCalledWith("/api/v1/auth/login/pin", {
      schoolCode: "NEVO-1234",
      admissionNumber: "amara.o",
      pin: "1234",
    });
  });

  it("no longer sends the old name, which the server accepts only for now", async () => {
    await authApi.loginPin({
      schoolCode: "NEVO-1234",
      loginIdentifier: "amara.o",
      pin: "1234",
    });

    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect("loginIdentifier" in body).toBe(false);
  });
});
