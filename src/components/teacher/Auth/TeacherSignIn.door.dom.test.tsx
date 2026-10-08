import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const { params, replace, loginPassword, logout } = vi.hoisted(() => ({
  params: { current: new URLSearchParams() },
  replace: vi.fn(),
  loginPassword: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  useSearchParams: () => params.current,
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { loginPassword, logout } }));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn: vi.fn(), status: "guest", user: null, signOut: vi.fn() }),
}));

import { TeacherSignIn } from "./TeacherSignIn";
import { SIGNED_OUT_DOOR, SIGNED_OUT_PARAM } from "./signedOut";

/**
 * The teacher door, for three things it got wrong about what had happened:
 * T207 - which field was at fault, T206 - whether a slow sign-in had failed,
 * T228 - that the teacher had just signed out.
 */

const fill = () => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@school.ng" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "lessons42" } });
};
const signIn = () => fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
const passwordBox = () => screen.getByLabelText("Password").parentElement as HTMLElement;

/** A login the test settles when it chooses. */
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
const SESSION = { userId: "t-1", role: "teacher", accessToken: "tok", expiresAt: "2999-01-01T00:00:00Z" };

beforeEach(() => {
  params.current = new URLSearchParams();
  replace.mockReset();
  loginPassword.mockReset();
  logout.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("which field is at fault (T207)", () => {
  it("marks the password when the email and password did not match", async () => {
    loginPassword.mockRejectedValue(new ApiError(401, "no", {}));
    render(<TeacherSignIn />);
    fill();
    signIn();

    await screen.findByText(/didn.t match/);
    expect(passwordBox().className).toMatch(/border-nevo-violet/);
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not mark it when the account is paused, which is no typo", async () => {
    loginPassword.mockRejectedValue(new ApiError(401, "no", { detail: { code: "account_paused" } }));
    render(<TeacherSignIn />);
    fill();
    signIn();

    await screen.findByText(/isn.t open at the moment/);
    expect(passwordBox().className).not.toMatch(/border-nevo-violet/);
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid");
  });

  it("does not mark it when Nevo could not be reached", async () => {
    loginPassword.mockRejectedValue(new Error("network"));
    render(<TeacherSignIn />);
    fill();
    signIn();

    await screen.findByText(/couldn.t reach Nevo/);
    expect(passwordBox().className).not.toMatch(/border-nevo-violet/);
  });

  it("does not mark it for school SSO, which never touched the password", () => {
    render(<TeacherSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with school SSO/ }));

    expect(passwordBox().className).not.toMatch(/border-nevo-violet/);
  });
});

describe("a sign-in that answers after we gave up on it (T206)", () => {
  it("is ended, rather than leaving a session behind a screen saying there is none", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const late = deferred();
    loginPassword.mockReturnValue(late.promise);
    render(<TeacherSignIn />);
    fill();
    signIn();

    await act(async () => void vi.advanceTimersByTime(20_000));
    expect(screen.getByText(/couldn.t reach Nevo/)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    await act(async () => late.resolve(SESSION));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("is left alone once the teacher has tried again - the session may be theirs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const late = deferred();
    loginPassword.mockReturnValueOnce(late.promise).mockReturnValueOnce(new Promise(() => {}));
    render(<TeacherSignIn />);
    fill();
    signIn();
    await act(async () => void vi.advanceTimersByTime(20_000));
    signIn();

    await act(async () => late.resolve(SESSION));
    expect(logout).not.toHaveBeenCalled();
  });

  it("is not ended when it simply failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const late = deferred();
    loginPassword.mockReturnValue(late.promise.then(() => Promise.reject(new Error("x"))));
    render(<TeacherSignIn />);
    fill();
    signIn();
    await act(async () => void vi.advanceTimersByTime(20_000));

    await act(async () => late.resolve(undefined));
    expect(logout).not.toHaveBeenCalled();
  });
});

describe("arriving from signing out (T228, SCRUM-88)", () => {
  const arrive = () => {
    params.current = new URL(SIGNED_OUT_DOOR, "https://nevo.test").searchParams;
  };

  it("is where signing out sends a teacher", () => {
    const door = new URL(SIGNED_OUT_DOOR, "https://nevo.test");

    expect(door.pathname).toBe("/auth/teacher");
    expect(door.searchParams.get(SIGNED_OUT_PARAM)).toBe("1");
  });

  it("says Signed out, in a region that was there before it spoke", () => {
    arrive();
    render(<TeacherSignIn />);

    expect(screen.getByRole("status")).toHaveTextContent("Signed out");
  });

  it("lets it go after a second and a half, and takes it off the address", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    arrive();
    render(<TeacherSignIn />);

    act(() => void vi.advanceTimersByTime(1400));
    expect(screen.getByRole("status")).toHaveTextContent("Signed out");
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(replace).toHaveBeenCalledWith("/auth/teacher");
  });

  it("keeps anything else on the address", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    params.current = new URLSearchParams(`${SIGNED_OUT_PARAM}=1&next=/teacher/insights`);
    render(<TeacherSignIn />);
    act(() => void vi.advanceTimersByTime(1500));

    expect(replace).toHaveBeenCalledWith(`/auth/teacher?next=${encodeURIComponent("/teacher/insights")}`);
  });

  it("says nothing to anyone who did not just sign out", () => {
    render(<TeacherSignIn />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
