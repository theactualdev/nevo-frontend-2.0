import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, isAnonymousPath } from "./client";
import { authApi } from "./auth";
import { studentEntryApi } from "./studentEntry";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THE DOORS NEVER CARRY A STORED SESSION'S TOKEN (19 Oct browser-storage
 * audit).
 *
 * With Amara's session still on a shared tablet, Kofi's PIN sign-in at the
 * picker went up with Amara's Authorization - and so did 05 Entry's lookup, a
 * first PIN and a request for a PIN to be cleared. None of these is anyone's
 * yet; they are how an account is found or entered. Only `fetch` is replaced
 * here, to read what each request carried.
 */

let sent: { url: string; auth: string | null }[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push({ url: String(input), auth: headers.Authorization ?? null });
      const body = String(input).includes("/auth/login/")
        ? {
            accessToken: "tok-kofi",
            tokenType: "bearer",
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            userId: "kofi",
            role: "student",
          }
        : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  setSession({
    token: "tok-amara",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "amara",
    role: "student",
  });
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

const authOf = (fragment: string) =>
  sent.find((r) => r.url.includes(fragment))?.auth;

describe("requests through a door, with another child's session stored", () => {
  it("send the PIN sign-in as nobody", async () => {
    await authApi.loginPin({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      pin: "1234",
    });

    expect(authOf("/api/v1/auth/login/pin")).toBeNull();
  });

  it("send 05's lookup, a first PIN and a PIN-reset request as nobody", async () => {
    await studentEntryApi
      .lookup({ schoolCode: "K7DQ", admissionNumber: "BGA/2031" })
      .catch(() => {});
    await studentEntryApi
      .setPin({ schoolCode: "K7DQ", admissionNumber: "BGA/2031", pin: "1234" })
      .catch(() => {});
    await authApi
      .requestPinReset({ schoolCode: "K7DQ", loginIdentifier: "NV-1" })
      .catch(() => {});

    expect(authOf("/api/v1/student-entry/lookup")).toBeNull();
    expect(authOf("/api/v1/student-entry/pin")).toBeNull();
    expect(authOf("/api/v1/auth/pin/reset")).toBeNull();
    expect(sent.some((r) => r.auth === "Bearer tok-amara")).toBe(false);
  });

  it("still send everything else as the child signed in", async () => {
    await api.get("/api/v1/users/me");
    await authApi.setPin("1234").catch(() => {});

    expect(authOf("/api/v1/users/me")).toBe("Bearer tok-amara");
    // Setting your own PIN is not a door: it is the signed-in child's.
    expect(authOf("/api/v1/auth/pin")).toBe("Bearer tok-amara");
  });
});

describe("isAnonymousPath", () => {
  it("names the doors, and nothing that needs a session", () => {
    for (const door of [
      "/api/v1/auth/login/pin",
      "/api/v1/auth/login/password",
      "/api/v1/auth/pin/reset",
      "/api/v1/auth/forgot-password",
      "/api/v1/auth/password-reset/complete",
      "/api/v1/auth/sso/callback",
      "/api/v1/student-entry/lookup",
      "/api/v1/student-entry/pin",
    ]) {
      expect(isAnonymousPath(door)).toBe(true);
    }
    for (const signedIn of [
      "/api/v1/auth/pin",
      "/api/v1/auth/session",
      "/api/v1/auth/session/refresh",
      "/api/v1/auth/logout",
      "/api/v1/users/me",
      "/api/signals",
    ]) {
      expect(isAnonymousPath(signedIn)).toBe(false);
    }
  });
});
