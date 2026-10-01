import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { SsoCallback } from "./SsoCallback";
import { ApiError } from "@/lib/api/client";
import { clearSession, getSession } from "@/lib/auth/session";

/**
 * The defect this pins: a REAL identity-provider handshake was signed into a
 * FABRICATED account.
 *
 * `code` and `state` were handed to `resolveMockSso`, which ignored both and
 * invented `{ id: "sso-<random>", schoolId: "school-demo" }`. `signIn()` was
 * called on that, so `AuthContext` reported `authenticated` - but no token was
 * ever stored, so `useHasSession()` stayed false and every screen the child
 * opened rendered fixtures. A school signing in through an identity provider
 * would have onboarded every one of its children into an account that did not
 * exist.
 *
 * So the assertion that matters is not "it says You're in". It is that a
 * SESSION EXISTS afterwards, with the server's own token in it - the thing the
 * old code never produced and the thing every later screen depends on.
 */

const { ssoCallback, signIn, push, replace, params } = vi.hoisted(() => ({
  ssoCallback: vi.fn(),
  signIn: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => params,
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { ssoCallback } }));
const { myConsentGate } = vi.hoisted(() => ({ myConsentGate: vi.fn() }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));

const setUrl = (q: string) => {
  [...params.keys()].forEach((k) => params.delete(k));
  new URLSearchParams(q).forEach((v, k) => params.set(k, v));
};

beforeEach(() => {
  vi.clearAllMocks();
  myConsentGate.mockResolvedValue({ blocked: false });
  clearSession();
  setUrl("");
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("student SsoCallback", () => {
  it("stores the server's own session for a real handshake", async () => {
    setUrl("provider=microsoft&code=real-code&state=real-state");
    ssoCallback.mockResolvedValue({
      accessToken: "server-token",
      tokenType: "bearer",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "student-77",
      role: "student",
      destination: "observed_interaction",
    });

    render(<SsoCallback />);

    await waitFor(() => expect(getSession()).not.toBeNull());
    // The token is the whole point: without it `useHasSession()` is false and
    // every screen falls back to fixtures behind an "authenticated" flag.
    expect(getSession()?.token).toBe("server-token");
    expect(getSession()?.userId).toBe("student-77");
    expect(ssoCallback).toHaveBeenCalledWith({
      provider: "microsoft",
      code: "real-code",
      state: "real-state",
    });
    // No invented school: `users/me` is what knows it, once the session exists.
    expect(signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "student-77",
        schoolId: "",
        method: "sso",
      }),
    );
  });

  it("signs nobody in when the provider sent no handshake", async () => {
    render(<SsoCallback />);

    await waitFor(() =>
      expect(screen.getByText(/couldn.t sign you in/i)).toBeTruthy(),
    );
    expect(ssoCallback).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });

  it("signs nobody in when the handshake is refused", async () => {
    setUrl("provider=microsoft&code=bad&state=bad");
    ssoCallback.mockRejectedValue(new Error("401"));

    render(<SsoCallback />);

    await waitFor(() =>
      expect(screen.getByText(/couldn.t sign you in/i)).toBeTruthy(),
    );
    expect(signIn).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });

  it("does not accept a partial handshake", async () => {
    // The contract requires all three. Two of them is not a handshake, and the
    // old default-to-success path is exactly how that became an account.
    setUrl("provider=microsoft&code=real-code");

    render(<SsoCallback />);

    await waitFor(() =>
      expect(screen.getByText(/couldn.t sign you in/i)).toBeTruthy(),
    );
    expect(ssoCallback).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });
});

const SESSION = {
  accessToken: "server-token",
  tokenType: "bearer",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: "student-77",
  role: "student",
  replacedSession: false,
};

/** Let the success hold run out, as the child waits on "You're in". */
const holdPasses = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1000));
  });
};

/**
 * `destination` is the contract's ENUM. Routed to as a path, a successful
 * sign-in would have gone to "home_dashboard" - a 404 - with consent unread.
 */
describe("where a successful SSO sign-in lands", () => {
  it("takes a child's first use into the sequence", async () => {
    setUrl("provider=microsoft&code=c&state=state-1");
    ssoCallback.mockResolvedValue({ ...SESSION, destination: "observed_interaction" });

    render(<SsoCallback />);
    await holdPasses();

    expect(replace).toHaveBeenCalledWith("/student/onboarding/sequence");
  });

  it("takes a returning child Home, through the consent check", async () => {
    setUrl("provider=microsoft&code=c&state=state-1");
    ssoCallback.mockResolvedValue({ ...SESSION, destination: "home_dashboard" });

    render(<SsoCallback />);
    await holdPasses();

    expect(myConsentGate).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/student/dashboard");
    expect(replace).not.toHaveBeenCalledWith("home_dashboard");
  });

  it("holds a child the server says may not proceed", async () => {
    setUrl("provider=microsoft&code=c&state=state-1");
    myConsentGate.mockResolvedValue({ blocked: true });
    ssoCallback.mockResolvedValue({ ...SESSION, destination: "home_dashboard" });

    render(<SsoCallback />);
    await holdPasses();

    expect(replace).toHaveBeenCalledWith("/student/waiting");
  });
});

describe("the error screen offers only what works", () => {
  it("has no Try again when there was never a handshake to retry", async () => {
    render(<SsoCallback />);

    await screen.findByText(/couldn.t sign you in/i);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText(/try once more/i)).toBeNull();
  });

  it("has no Try again once the server has refused the code, which is single-use", async () => {
    setUrl("provider=microsoft&code=c&state=state-1");
    ssoCallback.mockRejectedValue(new ApiError(401, "Unauthorized"));

    render(<SsoCallback />);

    await screen.findByText(/couldn.t sign you in/i);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers Try again when the request never reached the server", async () => {
    setUrl("provider=microsoft&code=c&state=state-1");
    ssoCallback
      .mockRejectedValueOnce(new ApiError(0, "Network"))
      .mockResolvedValue({ ...SESSION, destination: "home_dashboard" });

    render(<SsoCallback />);
    (await screen.findByRole("button", { name: "Try again" })).click();

    await waitFor(() => expect(getSession()?.token).toBe("server-token"));
  });

  it("says Contact your school without pretending to be a way somewhere", async () => {
    // IA: "no navigation, informational only". It pushed the PIN door, which
    // an SSO child has no PIN for.
    render(<SsoCallback />);

    await screen.findByText("Contact your school");
    expect(
      screen.queryByRole("button", { name: "Contact your school" }),
    ).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("carries the icon mark, as 00b draws it", async () => {
    render(<SsoCallback />);

    await screen.findByText(/couldn.t sign you in/i);
    expect(
      (screen.getByAltText("Nevo") as HTMLImageElement).getAttribute("src"),
    ).toBe("/brand/logo-icon-purple.png");
  });
});

/**
 * D2, 1 Oct, at the school door too: a child about to be held is not told
 * they are in. Every entry path resolves consent the same way, so every one
 * of them skips the beat for a held child.
 */
describe("a held child arriving through their school", () => {
  const handshake = () => {
    setUrl("provider=microsoft&code=real-code&state=real-state");
    ssoCallback.mockResolvedValue({
      accessToken: "server-token",
      tokenType: "bearer",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "student-77",
      role: "student",
      destination: "home_dashboard",
    });
  };

  it("goes straight to the waiting screen, never You're in", async () => {
    handshake();
    myConsentGate.mockResolvedValue({ blocked: true });

    render(<SsoCallback />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/student/waiting"));
    expect(screen.queryByText(/You.re in/)).toBeNull();
  });

  it("still says You're in to a child who is on their way in", async () => {
    handshake();

    render(<SsoCallback />);

    expect(await screen.findByText(/You.re in/)).toBeInTheDocument();
  });
});
