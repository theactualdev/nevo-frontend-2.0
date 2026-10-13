import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { push, loginPassword, logout, signIn, params } = vi.hoisted(() => ({
  push: vi.fn(),
  loginPassword: vi.fn(),
  logout: vi.fn(),
  signIn: vi.fn(),
  params: { value: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { loginPassword, logout } }));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signIn, status: "guest", user: null, signOut: vi.fn() }) }));

import { TeacherSignIn } from "./TeacherSignIn";

/**
 * The door's one job, which nothing tested: a teacher whose details are right
 * gets in, and lands where the guard turned them away from - but only ever on
 * a teacher page, never wherever a crafted `?next=` points (audit T246).
 */

const SESSION = { accessToken: "tok", userId: "t-1", role: "teacher", expiresAt: "2099-01-01T00:00:00Z" };

const signInWith = async () => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ms.adeyemi@school.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
  fireEvent.click(screen.getByRole("button", { name: /^Sign in$/i }));
  // The login resolves, then the success beat holds before the push.
  await act(async () => {});
  act(() => vi.advanceTimersByTime(2000));
};

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  loginPassword.mockReset().mockResolvedValue(SESSION);
  logout.mockReset().mockResolvedValue(undefined);
  signIn.mockReset();
  params.value = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a teacher with the right details", () => {
  it("is signed in as themselves and taken to the dashboard", async () => {
    render(<TeacherSignIn />);
    await signInWith();

    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ id: "t-1", role: "teacher" }));
    expect(push).toHaveBeenCalledWith("/teacher/dashboard");
  });

  it("goes back to the teacher page the guard turned them away from", async () => {
    params.value = new URLSearchParams("next=/teacher/classes/c-1");
    render(<TeacherSignIn />);
    await signInWith();

    expect(push).toHaveBeenCalledWith("/teacher/classes/c-1");
  });

  it("is never sent off the console by a crafted next", async () => {
    for (const next of ["https://evil.example/phish", "//evil.example", "/admin/billing", "/student/dashboard"]) {
      push.mockReset();
      params.value = new URLSearchParams(`next=${encodeURIComponent(next)}`);
      const { unmount } = render(<TeacherSignIn />);
      await signInWith();

      expect(push, next).toHaveBeenCalledWith("/teacher/dashboard");
      unmount();
    }
  });

  it("is not moved before the success beat has shown", async () => {
    render(<TeacherSignIn />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ms.adeyemi@school.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/i }));
    await act(async () => {});

    expect(push).not.toHaveBeenCalled();
  });
});
