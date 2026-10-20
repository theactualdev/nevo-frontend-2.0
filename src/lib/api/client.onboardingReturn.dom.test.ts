import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The page a child is refused rides to the continue route, query and all, so
 * finishing onboarding takes them back to the lesson they tapped Start on
 * (20 Oct production run). Where it goes is `onboardingDoor`'s, tested on its
 * own; jsdom will not let a test observe `location.assign` (see
 * `client.dom.test.ts`), so what is checked here is that the client hands the
 * decision the whole of the refused page.
 */

const { onboardingDoor } = vi.hoisted(() => ({
  onboardingDoor: vi.fn<(...args: unknown[]) => string | null>(() => null),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  clearSession: vi.fn(),
  getSession: () => ({
    token: "tok-live",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "u-1",
    role: "student",
  }),
  getToken: () => "tok-live",
}));
vi.mock("@/lib/auth/onboardingGate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/onboardingGate")>()),
  onboardingDoor: (...args: unknown[]) => onboardingDoor(...args),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("a lesson refused until onboarding is finished", () => {
  it("hands the door the refused page's path and its query", async () => {
    window.history.replaceState(
      null,
      "",
      "/student/lessons/les-1?assignment=asg-1",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ detail: { code: "onboarding_required" } }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    vi.resetModules();
    const { api } = await import("./client");

    await expect(api.get("/api/v1/lessons/les-1")).rejects.toThrow();

    expect(onboardingDoor).toHaveBeenCalledWith(
      "student",
      409,
      { detail: { code: "onboarding_required" } },
      "/student/lessons/les-1",
      "?assignment=asg-1",
    );
  });
});
