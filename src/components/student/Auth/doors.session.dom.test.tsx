import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProviders } from "@/context/providers";
import { ForgotPinScreen } from "./ForgotPinScreen";
import { ReturningSignInScreen } from "./ReturningSignInScreen";
import { SsoCallback } from "./SsoCallback";
import LoginPage from "@/app/auth/login/page";
import { isHeldAtDoor } from "@/lib/auth/doorSession";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A DOOR SENDS NOTHING AS THE SESSION IT FOUND STORED (19 Oct browser-storage
 * audit).
 *
 * With Amara's session still stored, Forgot PIN, the SSO callback and the
 * sign-in screens made the app's routine reads as her - the session check,
 * settings, notifications, the consent read - and a refused SSO sign-in's own
 * signal stream posted as her. The real hooks and network layer run here,
 * inside the real root providers; only `fetch` and the router are replaced.
 */

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams({ provider: "google", code: "c-1", state: "state-1" }),
  usePathname: () => "/auth/login",
}));

let sent: { url: string; auth: string | null }[] = [];

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push({ url, auth: headers.Authorization ?? null });
      // The SSO callback is refused; everything else answers.
      const refused = url.includes("/auth/sso/callback");
      return new Response(JSON.stringify(refused ? { detail: "bad" } : {}), {
        status: refused ? 400 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  setSession({
    token: "tok-amara",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "amara",
    role: "student",
  });
  // Her own sign-in moment has passed: nothing of hers is on its way.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  sent = [];
});

afterEach(async () => {
  cleanup();
  clearSession();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openTheDoor(door: ReactNode) {
  // The root providers every page has: the session check, settings and
  // notifications are theirs.
  render(<AppProviders>{door}</AppProviders>);
  // Past the stream's first flush, and anything the page reads on its own.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7_000);
  });
}

const asAmara = () => sent.filter((r) => r.auth === "Bearer tok-amara");

describe("a door with another child's session stored", () => {
  it.each([
    ["Forgot PIN", <ForgotPinScreen key="f" />],
    ["the sign-in screen (00c)", <ReturningSignInScreen key="r" />],
    ["the PIN door", <LoginPage key="l" />],
    ["the SSO callback, refused", <SsoCallback key="s" />],
  ])("%s sends nothing as them", async (_name, door) => {
    await openTheDoor(door);

    expect(asAmara()).toEqual([]);
    expect(sent.some((r) => r.url.includes("/api/signals"))).toBe(false);
  });

  it("holds their token only while it is open", async () => {
    render(
      <AppProviders>
        <ForgotPinScreen />
      </AppProviders>,
    );
    expect(isHeldAtDoor("tok-amara")).toBe(true);

    cleanup();

    expect(isHeldAtDoor("tok-amara")).toBe(false);
  });
});
