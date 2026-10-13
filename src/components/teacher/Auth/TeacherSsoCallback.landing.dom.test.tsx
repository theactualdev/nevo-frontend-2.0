import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const { replace, ssoCallback, setSession } = vi.hoisted(() => ({
  replace: vi.fn(),
  ssoCallback: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams({ provider: "microsoft", code: "auth-code-123", state: "state-abc" }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn: vi.fn(), signOut: vi.fn(), status: "guest", user: null }),
}));
vi.mock("@/lib/api", () => ({ authApi: { ssoCallback } }));
vi.mock("@/lib/auth/session", () => ({ setSession }));

import { TeacherSsoCallback } from "./TeacherSsoCallback";

/**
 * T225. `SsoCallbackResponse.destination` is an enum - "home_dashboard" or
 * "observed_interaction" - and it was handed to the router as a path, so a
 * teacher's successful SSO sign-in would have ended on a 404.
 */

const answered = (over: Record<string, unknown>) =>
  ssoCallback.mockResolvedValue({
    accessToken: "tok",
    tokenType: "bearer",
    expiresAt: "2999-01-01T00:00:00Z",
    userId: "t-1",
    role: "teacher",
    replacedSession: false,
    destination: "home_dashboard",
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replace.mockReset();
  setSession.mockReset();
});
afterEach(() => vi.useRealTimers());

const settle = async () => {
  render(<TeacherSsoCallback />);
  // The answer first, then the hold its success screen waits out.
  await act(async () => {});
  await act(async () => void vi.advanceTimersByTime(2000));
};

describe("where a teacher's SSO sign-in lands", () => {
  it("is the console's home, not the enum's name", async () => {
    answered({});
    await settle();

    expect(replace).toHaveBeenCalledWith("/teacher/dashboard");
    expect(replace).not.toHaveBeenCalledWith("home_dashboard");
  });

  it("is the console's home for a first use too - that enum is about a child", async () => {
    answered({ destination: "observed_interaction" });
    await settle();

    expect(replace).toHaveBeenCalledWith("/teacher/dashboard");
  });

  it("stores no session for a role no console serves", async () => {
    answered({ role: "parent_guardian" });
    await settle();

    expect(setSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
