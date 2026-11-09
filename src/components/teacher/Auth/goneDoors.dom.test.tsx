import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * A DOOR THAT HAS GONE NEVER NAVIGATES (the hub, 8 Nov).
 *
 * Back pressed while the server answers - the SSO handshake, or a password
 * sign-in. The answer lands with the door already gone, and its "You're in"
 * timer, set after the door's own cleanup had run, was never cleared: it
 * moved the teacher from wherever they had gone.
 */

const { push, replace, ssoCallback, loginPassword, logout, signIn } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  ssoCallback: vi.fn(),
  loginPassword: vi.fn(),
  logout: vi.fn(),
  signIn: vi.fn(),
}));
const router = vi.hoisted(() => ({ push, replace, prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () =>
    new URLSearchParams({ provider: "microsoft", code: "auth-code-123", state: "state-abc" }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn, signOut: vi.fn(), status: "guest", user: null }),
}));
vi.mock("@/lib/api", () => ({ authApi: { ssoCallback, loginPassword, logout } }));
vi.mock("@/lib/api/auth", () => ({ authApi: { ssoCallback, loginPassword, logout } }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  setSession: vi.fn(),
}));

import { TeacherSsoCallback } from "./TeacherSsoCallback";
import { TeacherSignIn } from "./TeacherSignIn";

/** A promise this test settles, standing in for a reply still on its way. */
function later<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Past every hold either door has (900 and 1400). */
const pastTheBeat = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  logout.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the teacher SSO callback", () => {
  const HANDSHAKE = {
    accessToken: "tok",
    tokenType: "bearer",
    expiresAt: "2999-01-01T00:00:00Z",
    userId: "t-1",
    role: "teacher",
    replacedSession: false,
    destination: "home_dashboard",
  };

  it("moves nobody when Back is pressed before the handshake answers", async () => {
    const handshake = later<typeof HANDSHAKE>();
    ssoCallback.mockReturnValue(handshake.promise);
    const { unmount } = render(<TeacherSsoCallback />);

    unmount(); // Back.
    await act(async () => handshake.settle(HANDSHAKE));
    await pastTheBeat();

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("still moves a teacher who stays, after the beat", async () => {
    ssoCallback.mockResolvedValue(HANDSHAKE);
    render(<TeacherSsoCallback />);
    await act(async () => {});

    await pastTheBeat();

    expect(replace).toHaveBeenCalledWith("/teacher/dashboard");
  });
});

describe("the teacher sign-in door", () => {
  const SESSION = { accessToken: "tok", userId: "t-1", role: "teacher", expiresAt: "2099-01-01T00:00:00Z" };
  const signInNow = () => {
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ms.adeyemi@school.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/i }));
  };

  it("moves nobody when Back is pressed before the sign-in answers", async () => {
    const answer = later<typeof SESSION>();
    loginPassword.mockReturnValue(answer.promise);
    const { unmount } = render(<TeacherSignIn />);
    signInNow();

    unmount(); // Back.
    await act(async () => answer.settle(SESSION));
    await pastTheBeat();

    expect(push).not.toHaveBeenCalled();
  });

  it("still moves a teacher who stays, after the beat", async () => {
    loginPassword.mockResolvedValue(SESSION);
    render(<TeacherSignIn />);
    signInNow();
    await act(async () => {});

    await pastTheBeat();

    expect(push).toHaveBeenCalledWith("/teacher/dashboard");
  });
});
