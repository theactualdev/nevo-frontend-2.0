import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "@/hooks";
import { ApiError } from "@/lib/api/client";
import { clearSession, getSession, setSession } from "@/lib/auth/session";

/**
 * Opening the app on a bad connection used to delete a valid session.
 *
 * `AuthProvider` validates a stored token against `GET /auth/session` on mount,
 * and cleared it in a bare `.catch()` — so a 500, a timeout, a cold-starting
 * backend or a classroom 3G blip all read as "this token is dead". A child
 * opening Nevo on a poor signal was signed out before they saw anything, and
 * the PIN screen they landed on needs the network too, so they got "we couldn't
 * check that just now" instead of their lessons. Nothing about their session
 * was wrong.
 *
 * Only a 401 or 403 is the server saying the token is no longer good. Anything
 * else means WE DO NOT KNOW — and the session carries its own expiry, so the
 * safe answer is to keep it.
 */

const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, authApi: { ...actual.authApi, session } };
});
vi.mock("@/lib/signals/ephemeralStore", () => ({
  setEphemeralStudent: vi.fn(),
  endEphemeralSession: vi.fn(),
}));

function Probe() {
  const { status } = useAuth();
  return <p>status:{status}</p>;
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

const storeSession = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  session.mockReset();
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  clearSession();
  window.localStorage.clear();
});

describe("AuthProvider — when the server cannot be reached", () => {
  it("keeps the session when the network fails", async () => {
    // `client.ts` throws ApiError(0) from a rejected fetch. This is the
    // classroom-3G case, and the one that cost children their session.
    storeSession();
    session.mockRejectedValue(new ApiError(0, "Network"));

    renderAuth();

    await screen.findByText("status:authenticated");
    expect(getSession()).not.toBeNull();
  });

  it("keeps it when the backend is having a bad minute", async () => {
    // A cold-starting Render instance answers 502/503 before it answers
    // anything useful.
    storeSession();
    session.mockRejectedValue(new ApiError(503, "Service Unavailable"));

    renderAuth();

    await screen.findByText("status:authenticated");
    expect(getSession()).not.toBeNull();
  });

  it("does not leave the child waiting on a decision it cannot make", async () => {
    // Staying on "loading" forever would be a different way of failing them:
    // the app never renders and nothing says why.
    storeSession();
    session.mockRejectedValue(new ApiError(0, "Network"));

    renderAuth();

    await waitFor(() =>
      expect(screen.queryByText("status:loading")).toBeNull(),
    );
  });
});

describe("AuthProvider — when the server says no", () => {
  it("clears the session on a 401", async () => {
    // The server has looked at this token and rejected it. That is worth
    // acting on, and it is the only thing that is.
    storeSession();
    session.mockRejectedValue(new ApiError(401, "Unauthorized"));

    renderAuth();

    await screen.findByText("status:unauthenticated");
    expect(getSession()).toBeNull();
  });

  it("clears it on a 403 too", async () => {
    storeSession();
    session.mockRejectedValue(new ApiError(403, "Forbidden"));

    renderAuth();

    await screen.findByText("status:unauthenticated");
    expect(getSession()).toBeNull();
  });
});

describe("AuthProvider — the ordinary path", () => {
  it("authenticates when the server confirms the session", async () => {
    storeSession();
    session.mockResolvedValue({ userId: "student-1", role: "student" });

    renderAuth();

    await screen.findByText("status:authenticated");
    expect(getSession()).not.toBeNull();
  });

  it("is unauthenticated when there was no session to begin with", async () => {
    session.mockRejectedValue(new ApiError(0, "Network"));

    renderAuth();

    await screen.findByText("status:unauthenticated");
    expect(session).not.toHaveBeenCalled();
  });
});

/**
 * "Sign out" did not reliably sign the child out.
 *
 * The token and the route guard's role cookie were cleared in `logout`'s
 * `finally` - after the server answered. Every caller navigates at once, and a
 * hard navigation carries the cookie that is still there: the guard saw a
 * student, bounced the sign-in door back to the dashboard, and the unload could
 * cancel the request before its `finally` ever ran.
 */
describe("AuthProvider — signing out", () => {
  function SignOutProbe() {
    const { signOut } = useAuth();
    return (
      <button type="button" onClick={signOut}>
        out
      </button>
    );
  }

  it("clears the session before anything can navigate, and still revokes it", async () => {
    storeSession();
    session.mockResolvedValue({ userId: "student-1", role: "student" });
    // A revoke that never answers - the slow-network case.
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <AuthProvider>
        <SignOutProbe />
      </AuthProvider>,
    );
    screen.getByRole("button", { name: "out" }).click();

    // Synchronously gone - the very next line is where a caller navigates.
    expect(getSession()).toBeNull();
    expect(document.cookie).not.toMatch(/nevo\.role=student/);

    // And the revoke went with the token it was for - read before the clear,
    // sent a microtask later - and survives an unload.
    const logoutCall = () =>
      (fetchSpy.mock.calls as unknown as [string, RequestInit][]).find(([url]) =>
        String(url).includes("/auth/logout"),
      );
    await waitFor(() => expect(logoutCall()).toBeDefined());
    const call = logoutCall();
    expect((call![1].headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    expect(call![1].keepalive).toBe(true);
    vi.unstubAllGlobals();
  });
});
