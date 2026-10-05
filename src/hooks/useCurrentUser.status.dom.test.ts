import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/users")>();
  return { ...actual, usersApi: { ...actual.usersApi, me } };
});

import { useCurrentUserStatus } from "./useCurrentUser";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * WHICH NULL, AND FOR HOW LONG.
 *
 * The identity read answered null while in flight and null after failing, so
 * the profile page said "Teacher" and "Your details aren't connected yet"
 * over both - and a failure was cached like an answer, so it kept saying it
 * until a full reload.
 *
 * Each test signs in as a different user: the cache is per module and per
 * user, which is the thing under test.
 */

const USER = (id: string) => ({
  userId: id,
  role: "teacher",
  firstName: "Ola",
  lastName: "Bello",
  displayName: "Ola Bello",
  email: "ola@school.test",
  school: null,
  subjects: [],
  profileImageUrl: null,
});

const signInAs = (id: string) => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: id,
    role: "teacher",
  });
};

beforeEach(() => {
  me.mockReset();
});

describe("the identity read", () => {
  it("is loading before it answers - not failed, not nobody", () => {
    signInAs("u-loading");
    me.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCurrentUserStatus());

    expect(result.current.status).toBe("loading");
  });

  it("is ready with the teacher once it answers", async () => {
    signInAs("u-ready");
    me.mockResolvedValue(USER("u-ready"));
    const { result } = renderHook(() => useCurrentUserStatus());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.identity?.name).toBe("Ola Bello");
  });

  it("says it failed when it failed", async () => {
    signInAs("u-failed");
    me.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCurrentUserStatus());

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.identity).toBeNull();
  });

  it("asks again next time rather than keeping the failure", async () => {
    signInAs("u-retry");
    me.mockRejectedValueOnce(new Error("network"));
    const first = renderHook(() => useCurrentUserStatus());
    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    first.unmount();

    me.mockResolvedValueOnce(USER("u-retry"));
    const second = renderHook(() => useCurrentUserStatus());

    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    expect(me).toHaveBeenCalledTimes(2);
  });
});
