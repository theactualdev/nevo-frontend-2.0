import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { me, replace } = vi.hoisted(() => ({ me: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api/permissions", () => ({ permissionsApi: { me } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
}));

import { ADMIN_CONSOLE_HOME, useTeacherConsoleAccess } from "./useTeacherConsoleAccess";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * T2/L9: the teacher console admits a teacher, and an admin who holds the
 * Teacher permission (backend 6b5d496). Nobody else, and a teacher never waits.
 */

const signIn = (role: string) =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "u-1",
    role,
  });

const answer = (scopes: string[]) =>
  me.mockResolvedValue({ userId: "u-1", schoolId: "sch-1", role: "other_admin", scopes, navigation: [] });

beforeEach(() => {
  me.mockReset();
  replace.mockReset();
});
afterEach(() => clearSession());

describe("a teacher", () => {
  it("is let straight in, and nothing is asked", () => {
    signIn("teacher");
    const { result } = renderHook(() => useTeacherConsoleAccess());

    expect(result.current).toBe("allowed");
    expect(me).not.toHaveBeenCalled();
  });
});

describe("an admin", () => {
  it("waits for the answer before the console renders", () => {
    signIn("other_admin");
    me.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeacherConsoleAccess());

    expect(result.current).toBe("checking");
  });

  it("is let in with the Teacher permission", async () => {
    signIn("senco_admin");
    answer(["oversight", "teacher"]);
    const { result } = renderHook(() => useTeacherConsoleAccess());

    await waitFor(() => expect(result.current).toBe("allowed"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("is sent back to the admin console without it", async () => {
    signIn("other_admin");
    answer(["oversight", "roster"]);
    const { result } = renderHook(() => useTeacherConsoleAccess());

    await waitFor(() => expect(result.current).toBe("leaving"));
    expect(replace).toHaveBeenCalledWith(ADMIN_CONSOLE_HOME);
  });

  it("is told the check failed rather than let in or turned away", async () => {
    signIn("other_admin");
    me.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useTeacherConsoleAccess());

    await waitFor(() => expect(result.current).toBe("failed"));
    expect(replace).not.toHaveBeenCalled();
  });
});
