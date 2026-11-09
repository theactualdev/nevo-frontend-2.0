import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SsoCallback } from "./SsoCallback";
import { clearSession } from "@/lib/auth/session";

/**
 * A SCREEN THAT HAS GONE NEVER NAVIGATES (the hub, 8 Nov).
 *
 * A child who presses Back during "Signing you in" has left 00b. Its handshake
 * - and the consent read after it - still answers, and the redirect it led to
 * fired anyway, moving them from wherever they had gone; a "You're in" timer
 * set after the screen's own cleanup had run was never cleared at all.
 *
 * Back is the screen unmounting: the route changes, and 00b goes.
 */

const { ssoCallback, signIn, router, params, myConsentGate } = vi.hoisted(() => ({
  ssoCallback: vi.fn(),
  signIn: vi.fn(),
  // One router for the file, as Next's own is.
  router: { push: vi.fn(), replace: vi.fn() },
  params: new URLSearchParams("provider=microsoft&code=real-code&state=real-state"),
  myConsentGate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => params,
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { ssoCallback } }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));

const HANDSHAKE = {
  accessToken: "server-token",
  tokenType: "bearer",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: "student-77",
  role: "student",
  destination: "home_dashboard",
};

/** A promise this test settles, standing in for a reply still on its way. */
function later<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Past every hold the screen has (`SUCCESS_HOLD_MS` is 900). */
const pastTheBeat = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
});

describe("Back during 00b: nothing moves the child after the screen has gone", () => {
  it("pressed during 'Signing you in', before the handshake answers", async () => {
    const handshake = later<typeof HANDSHAKE>();
    ssoCallback.mockReturnValue(handshake.promise);
    myConsentGate.mockResolvedValue({ blocked: false });
    const { unmount } = render(<SsoCallback />);

    unmount(); // Back.
    await act(async () => handshake.settle(HANDSHAKE));
    await pastTheBeat();

    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("pressed while the consent read is still on its way", async () => {
    ssoCallback.mockResolvedValue(HANDSHAKE);
    const gate = later<{ blocked: boolean }>();
    myConsentGate.mockReturnValue(gate.promise);
    const { unmount } = render(<SsoCallback />);
    await act(async () => {});

    unmount(); // Back.
    await act(async () => gate.settle({ blocked: false }));
    await pastTheBeat();

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("pressed for a held child too, whose redirect has no beat to wait out", async () => {
    ssoCallback.mockResolvedValue(HANDSHAKE);
    const gate = later<{ blocked: boolean }>();
    myConsentGate.mockReturnValue(gate.promise);
    const { unmount } = render(<SsoCallback />);
    await act(async () => {});

    unmount(); // Back.
    await act(async () => gate.settle({ blocked: true }));
    await pastTheBeat();

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("pressed during the 'You're in' beat", async () => {
    ssoCallback.mockResolvedValue(HANDSHAKE);
    myConsentGate.mockResolvedValue({ blocked: false });
    const { unmount } = render(<SsoCallback />);
    expect(await screen.findByText(/You.re in/)).toBeInTheDocument();

    unmount(); // Back.
    await pastTheBeat();

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("still moves a child who stays, after the beat", async () => {
    ssoCallback.mockResolvedValue(HANDSHAKE);
    myConsentGate.mockResolvedValue({ blocked: false });
    render(<SsoCallback />);
    expect(await screen.findByText(/You.re in/)).toBeInTheDocument();

    await pastTheBeat();

    expect(router.replace).toHaveBeenCalledWith("/student/dashboard");
  });
});
