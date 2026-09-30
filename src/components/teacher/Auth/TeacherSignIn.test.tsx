import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const { push, loginPassword, logout, signIn } = vi.hoisted(() => ({
  push: vi.fn(),
  loginPassword: vi.fn(),
  logout: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { loginPassword, logout } }));
// The screen reads `signIn` off the auth context. Mocking the hook is lighter
// than wrapping every render in a provider, and nothing here exercises it.
vi.mock("@/hooks", () => ({ useAuth: () => ({ signIn, status: "guest", user: null, signOut: vi.fn() }) }));

import { TeacherSignIn } from "./TeacherSignIn";

/**
 * The "Continue with school SSO" control.
 *
 * It used to hold a spinner reading "Taking you to Microsoft…" for 1.4 seconds
 * and then push to `/auth/teacher/sso-callback` with no provider, code or
 * state - precisely the shape that callback renders its ERROR phase for. So the
 * most prominent secondary control on the first screen a school sees mimed a
 * handoff to a named provider and then failed, every time.
 *
 * It cannot be wired from here: `POST /auth/sso/start` needs a `schoolSlug`
 * that nothing pre-auth yields, and nothing in the API creates an SSO
 * connection at all. So the property worth pinning is that this button NEVER
 * claims to be doing something it cannot do.
 */

beforeEach(() => {
  push.mockReset();
  loginPassword.mockReset();
  logout.mockReset().mockResolvedValue(undefined);
  signIn.mockReset();
});

const clickSso = () =>
  fireEvent.click(screen.getByRole("button", { name: /Continue with school SSO/i }));

describe("the school SSO button", () => {
  it("navigates nowhere, even after the delay the old hop used", () => {
    // FAKE TIMERS MATTER HERE. The bug deferred its push by 1.4s, so a
    // synchronous "push not called" assertion passes against the bug - it was
    // true, just not yet. Checked by reintroducing the real thing: without
    // advancing the clock this test stayed green while the hop was back.
    vi.useFakeTimers();
    try {
      render(<TeacherSignIn />);
      clickSso();
      expect(push).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(push).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("names no provider it has not actually reached", () => {
    // "Taking you to Microsoft…" was invented copy for a handoff that never
    // happened, on a screen where the school knows which provider they use.
    render(<TeacherSignIn />);
    clickSso();

    expect(screen.queryByText(/Microsoft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Taking you to/i)).not.toBeInTheDocument();
  });

  it("says plainly that school sign-in is not set up", () => {
    render(<TeacherSignIn />);
    clickSso();

    expect(screen.getByText(/School sign-in isn't set up for Nevo yet/i)).toBeInTheDocument();
  });

  it("is never a dead end - it points at the route that works", () => {
    // A teacher who taps this still has to get into their console today.
    render(<TeacherSignIn />);
    clickSso();

    expect(screen.getByText(/Use your email and password for now/i)).toBeInTheDocument();
    expect(screen.getByText(/school admin can tell you when that changes/i)).toBeInTheDocument();
  });

  it("leaves the password form usable underneath", () => {
    // The notice must not replace the screen: the thing it tells you to do
    // has to still be there when you have read it.
    render(<TeacherSignIn />);
    clickSso();

    expect(screen.getByRole("button", { name: /^Sign in$/i })).toBeInTheDocument();
  });

  it("does not attempt a sign-in", () => {
    render(<TeacherSignIn />);
    clickSso();

    expect(loginPassword).not.toHaveBeenCalled();
  });
});

/**
 * What a failed sign-in TELLS a teacher.
 *
 * Until 14 Sep this door mapped every 401 and 403 to "That email and password
 * didn't match" - so a teacher whose password was RIGHT, on an account that had
 * been paused, was told they had mistyped it. They retype it, and retype it,
 * and it keeps being correct and keeps being refused. A rate-limited teacher
 * was told to "try again", which is the one instruction that extends a lockout.
 *
 * Backend documents the three cases on the endpoint itself, and
 * `classifyLoginFailure` has been parsing them - tested, role-neutral - since
 * the student doors shipped it. Only the two staff doors were left behind.
 *
 * These assert on the MESSAGE, because the message is the defect. Asserting
 * that sign-in failed would have passed throughout.
 */
describe("what a failed sign-in says", () => {
  const submit = () => {
    render(<TeacherSignIn />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a.adeyemi@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/i }));
  };

  const fail = (status: number, code?: string) =>
    loginPassword.mockRejectedValueOnce(
      new ApiError(status, "no", code ? { detail: { code } } : {}),
    );

  it("does not tell a paused teacher their password was wrong", async () => {
    fail(401, "account_paused");
    submit();

    const msg = await screen.findByText(/open at the moment/i);
    expect(msg).toBeInTheDocument();
    expect(screen.queryByText(/email and password/i)).not.toBeInTheDocument();
  });

  it("does not tell a paused teacher to try again", async () => {
    // The retry is the thing that cannot work. Pointing at the school admin is
    // the only route that can.
    fail(401, "account_paused");
    submit();

    const msg = await screen.findByText(/open at the moment/i);
    expect(msg).toHaveTextContent(/school admin/i);
    expect(msg).not.toHaveTextContent(/try again/i);
  });

  it("tells a rate-limited teacher to wait, not to retry", async () => {
    fail(401, "too_many_attempts");
    submit();

    expect(await screen.findByText(/too many attempts/i)).toHaveTextContent(
      /wait a few minutes/i,
    );
  });

  it("still says the ordinary thing for an ordinary wrong password", async () => {
    fail(401);
    submit();

    expect(await screen.findByText(/email and password/i)).toBeInTheDocument();
  });

  it("blames neither the teacher nor their account when the failure is ours", async () => {
    // A 500 or a dead network is not a fact about this teacher's credentials.
    fail(500);
    submit();

    expect(screen.queryByText(/email and password/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Nothing on your end/i)).toBeInTheDocument();
  });
});

/**
 * The school eyebrow.
 *
 * This door shipped "Corona Secondary School · Lagos" as a literal above
 * "Welcome back", so every teacher at every school was greeted by one tenant's
 * name on the first screen they ever see. It is the frame's own text, taken
 * literally: the frame resolves school identity pre-auth from a school-specific
 * URL, and nothing hands this door a school.
 *
 * The assertion is deliberately about ANY school name rather than the string
 * "Corona", because the failure this guards is not that one fixture leaked. It
 * is that a pre-auth screen claims to know which school you are at. Swapping
 * Corona for a different hardcoded school would pass a Corona-only test.
 */
describe("the school eyebrow", () => {
  it("names no school at all before the teacher has signed in", () => {
    render(<TeacherSignIn />);

    expect(screen.queryByText(/Corona/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Secondary School/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bSchool\b\s*·/)).not.toBeInTheDocument();
    // Nothing pre-auth yields a school, so any "School" claim here is invented.
    expect(screen.queryByText(/coronaschools/i)).not.toBeInTheDocument();
  });

  it("still welcomes the teacher", () => {
    // The eyebrow went; the greeting must not have gone with it.
    render(<TeacherSignIn />);

    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in to your teacher console/i),
    ).toBeInTheDocument();
  });
});

/**
 * THE TEACHER DOOR LET ANY ROLE IN.
 *
 * An admin signing in here got "You're in", a stored session, and a push to
 * `/teacher/dashboard` - where `proxy.ts` bounced them straight back here
 * with that session still live. The admin door has refused at the door since
 * 23 Sep; this one never did.
 */
describe("somebody whose account belongs at another door", () => {
  const signInWith = (role: string) => {
    loginPassword.mockResolvedValueOnce({
      accessToken: "tok",
      expiresAt: "",
      userId: "u-1",
      role,
    });
    render(<TeacherSignIn />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "deputy@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in$/i }));
  };

  it("is told where they belong, with the way there", async () => {
    signInWith("senco_admin");

    expect(
      await screen.findByText(/Your account is a school admin account/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign in as a school admin/i }),
    ).toHaveAttribute("href", "/auth/admin");
  });

  it("is never signed in here or sent on, even after the success beat", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      signInWith("other_admin");
      await screen.findByText(/this is the teacher sign-in/);
      vi.advanceTimersByTime(5000);

      expect(signIn).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(screen.queryByText(/You.re in/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not leave carrying the session the login made", async () => {
    signInWith("senco_admin");
    await screen.findByText(/this is the teacher sign-in/);

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("sends a student to the student door", async () => {
    signInWith("student");

    expect(
      await screen.findByRole("link", { name: /sign in as a student/i }),
    ).toHaveAttribute("href", "/auth/sign-in");
  });

  it("names no door for a role none serves", async () => {
    signInWith("parent_guardian");

    expect(
      await screen.findByText(/this account can.t be used to sign in here/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in as/i })).not.toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("still lets a teacher through", async () => {
    signInWith("teacher");

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/dashboard"), {
      timeout: 3000,
    });
    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ role: "teacher" }));
    expect(logout).not.toHaveBeenCalled();
  });
});
