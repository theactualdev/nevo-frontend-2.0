import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { publishIdentity, useCurrentUser } from "./useCurrentUser";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CurrentUser } from "@/lib/api/users";

/**
 * The school code on the identity, from `users/me`'s `school.code`.
 *
 * C03 draws it beside Home's greeting since 30 Sep, when it replaced the
 * class code as the thing a teacher reads out. `code` is nullable on
 * `SchoolSummary`, so absent and blank both mean no box.
 */

const user = (school: CurrentUser["school"]) =>
  ({
    userId: "u-1",
    role: "teacher",
    firstName: "Amina",
    lastName: "Bello",
    displayName: "Amina Bello",
    email: "amina@school.test",
    school,
    subjects: [],
    profileImageUrl: null,
  }) as unknown as CurrentUser;

const SCHOOL = { id: "sch-1", name: "E2E Probe School", slug: "e2e-probe" };

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "u-1",
    role: "teacher",
  });
});

describe("the school code on the identity", () => {
  it("survives the mapping from the wire", async () => {
    publishIdentity(user({ ...SCHOOL, code: "K7DQ" }));
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current?.schoolCode).toBe("K7DQ"));
  });

  it("is absent when the school has none", async () => {
    publishIdentity(user({ ...SCHOOL, code: null } as never));
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current?.school).toBe("E2E Probe School"));
    expect(result.current?.schoolCode).toBeNull();
  });

  it("treats a blank code as no code", async () => {
    publishIdentity(user({ ...SCHOOL, code: "   " }));
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current?.school).toBe("E2E Probe School"));
    expect(result.current?.schoolCode).toBeNull();
  });

  it("is absent for a user with no school", async () => {
    publishIdentity(user(null));
    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current?.userId).toBe("u-1"));
    expect(result.current?.schoolCode).toBeNull();
  });
});
