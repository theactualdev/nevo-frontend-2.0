import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { clearSession, sessionUserIdFromStorage, setSession } from "@/lib/auth/session";
import { elsewhereDoor, useSessionElsewhere } from "./sessionElsewhere";

/**
 * C02. A sign-out in one tab left every other teacher tab on the console, which
 * then fell back to the walkthrough's persona over a real teacher's page.
 *
 * jsdom will not let `location.assign` be replaced or spied on, so the
 * decision is checked through the two pure halves the hook joins, and the hook
 * only for listening at all.
 */

const KEY = "nevo.auth.session";
const stored = (userId: string) =>
  JSON.stringify({ token: "t", expiresAt: "2999-01-01T00:00:00Z", userId, role: "teacher" });

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe("reading another tab's change", () => {
  it("ignores storage that is not the session", () => {
    expect(sessionUserIdFromStorage({ key: "nevo.a11y", newValue: "{}" })).toBeUndefined();
  });

  it("reads who is signed in now", () => {
    expect(sessionUserIdFromStorage({ key: KEY, newValue: stored("t-2") })).toBe("t-2");
  });

  it("reads a removed session as nobody", () => {
    expect(sessionUserIdFromStorage({ key: KEY, newValue: null })).toBeNull();
  });

  it("reads cleared storage as nobody", () => {
    // \`localStorage.clear()\` arrives with no key at all.
    expect(sessionUserIdFromStorage({ key: null, newValue: null })).toBeNull();
  });

  it("reads an unreadable session as nobody, not as the same teacher", () => {
    expect(sessionUserIdFromStorage({ key: KEY, newValue: "{not json" })).toBeNull();
  });
});

describe("where this tab goes", () => {
  it("to the door, when another tab signs this teacher out", () => {
    expect(elsewhereDoor("t-1", null)).toBe("/auth/teacher");
  });

  it("to the console's home, when another tab signs someone else in", () => {
    expect(elsewhereDoor("t-1", "t-2")).toBe("/teacher/dashboard");
  });

  it("nowhere, for a token refresh - the same teacher", () => {
    expect(elsewhereDoor("t-1", "t-1")).toBeNull();
  });

  it("nowhere, for storage that is not the session", () => {
    expect(elsewhereDoor("t-1", undefined)).toBeNull();
  });

  it("nowhere, on the signed-out walkthrough, which has nothing to lose", () => {
    expect(elsewhereDoor(null, "t-2")).toBeNull();
  });
});

describe("the hook", () => {
  it("listens for other tabs while mounted, and stops after", () => {
    setSession({ token: "t", expiresAt: "2999-01-01T00:00:00Z", userId: "t-1", role: "teacher" as never });
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useSessionElsewhere());

    expect(add).toHaveBeenCalledWith("storage", expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});
