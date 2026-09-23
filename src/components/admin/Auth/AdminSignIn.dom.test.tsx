import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const { push, loginPassword, signIn, logout } = vi.hoisted(() => ({
  push: vi.fn(),
  loginPassword: vi.fn(),
  signIn: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", () => ({ authApi: { loginPassword, logout } }));
// The screen reads `signIn` off the auth context; mocking the hook is lighter
// than wrapping every render in a provider, and nothing here exercises it.
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn, status: "guest", user: null, signOut: vi.fn() }),
}));

import { AdminSignIn } from "./AdminSignIn";

/**
 * What a failed sign-in TELLS an administrator.
 *
 * Until now this door mapped every 401 and 403 to "We couldn't sign you in
 * with those details. Check them and try again" - and then relabelled the
 * primary button "Try again". So a proprietor whose account had been paused,
 * typing the CORRECT password, was told to check it and handed a control that
 * would refuse them again for as long as they kept pressing it. A rate-limited
 * admin was told the same, which is the one instruction that extends a
 * lockout.
 *
 * `classifyLoginFailure` already parsed the three documented cases, was
 * already tested, and was already role-neutral. Both student doors and the
 * teacher door used it; this was the last one that did not.
 *
 * These assert on the MESSAGE and the BUTTON, because those are the defect.
 * Asserting that sign-in failed would have passed throughout.
 */

beforeEach(() => {
  push.mockReset();
  loginPassword.mockReset();
  signIn.mockReset();
  logout.mockReset();
  logout.mockResolvedValue(undefined);
});

const submit = () => {
  render(<AdminSignIn />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "head@brightgate.edu.ng" },
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

const primary = () =>
  screen.getByRole("button", { name: /^(Sign in|Try again)$/i });

describe("a paused account", () => {
  it("is not told the password was wrong", async () => {
    fail(401, "account_paused");
    submit();

    expect(await screen.findByText(/isn.t open at the moment/i)).toBeInTheDocument();
    expect(screen.queryByText(/Check them and try again/i)).not.toBeInTheDocument();
  });

  it("is not invited to retry, by the message or by the button", async () => {
    // The retry is the thing that cannot work. The button is the more
    // dangerous half: the copy can say one thing while the control says "Try
    // again" directly beneath it.
    fail(401, "account_paused");
    submit();

    await screen.findByText(/isn.t open at the moment/i);
    expect(primary()).toHaveTextContent(/^Sign in$/);
  });

  it("names a colleague first, then a route that exists for a sole proprietor", async () => {
    // "Your school admin can tell you more" is the teacher line and it is a
    // circle here - a proprietor IS the school admin. The refusal does not say
    // which kind of admin this is, so the line has to serve both.
    fail(401, "account_paused");
    submit();

    const msg = await screen.findByText(/isn.t open at the moment/i);
    expect(msg).toHaveTextContent(/Another administrator at your school/i);
    expect(
      screen.getByRole("link", { name: /support@nevolearning\.com/i }),
    ).toHaveAttribute("href", "mailto:support@nevolearning.com");
  });

  it("is reached by a 403 as well as a 401", async () => {
    // Backend enforces withdrawal with a 403 on some routes and a 401 here;
    // the old branch already treated the pair alike and that part was right.
    fail(403, "account_paused");
    submit();

    expect(await screen.findByText(/isn.t open at the moment/i)).toBeInTheDocument();
  });
});

describe("a rate-limited account", () => {
  it("is told to wait, and the button stops saying Try again", async () => {
    fail(401, "too_many_attempts");
    submit();

    expect(await screen.findByText(/too many attempts/i)).toHaveTextContent(
      /wait a few minutes/i,
    );
    expect(primary()).toHaveTextContent(/^Sign in$/);
  });
});

describe("an ordinary wrong password", () => {
  it("still says D02's line, and still offers the retry", async () => {
    // The fix must not cost the case the screen was designed around.
    fail(401);
    submit();

    expect(
      await screen.findByText(/We couldn't sign you in with those details/i),
    ).toBeInTheDocument();
    expect(primary()).toHaveTextContent(/^Try again$/);
  });

  it("covers an unrecognised code too, rather than guessing", async () => {
    fail(401, "some_future_code");
    submit();

    expect(
      await screen.findByText(/We couldn't sign you in with those details/i),
    ).toBeInTheDocument();
  });
});

describe("a failure that is ours", () => {
  it("blames neither the administrator nor their account", async () => {
    fail(500);
    submit();

    expect(
      await screen.findByText(/Nothing on your end/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/isn.t open at the moment/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Check them and try again/i),
    ).not.toBeInTheDocument();
  });

  it("keeps the retry, because a retry is exactly what a 500 deserves", async () => {
    fail(500);
    submit();

    await screen.findByText(/Nothing on your end/i);
    expect(primary()).toHaveTextContent(/^Try again$/);
  });
});

/**
 * THE DOOR THAT CELEBRATED BEFORE IT CHECKED.
 *
 * A teacher's credentials were accepted here: the screen showed "You're in",
 * held for the success beat, pushed to an admin route, and only then did
 * `proxy.ts` bounce them back. The guard held, so nothing leaked - but a
 * correct password produced what read as a broken login.
 *
 * These assert on what the door DOES, not on whether sign-in "failed":
 * `signIn` must not be called, `push` must not be called, and the message must
 * name where they belong. Asserting a failure state would have passed on the
 * old code too, because the old code eventually failed as well - just later,
 * somewhere else, and after saying the opposite.
 */

const accept = (role: string) =>
  loginPassword.mockResolvedValueOnce({ userId: "u1", role });

describe("a valid account at the wrong door", () => {
  it("never stores the session or navigates", async () => {
    accept("teacher");
    submit();

    await screen.findByText(/this is the school admin sign-in/i);
    expect(signIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The success beat is the visible half of the bug.
    expect(screen.queryByText(/You.re in/i)).not.toBeInTheDocument();
  });

  it("names the door they belong at, and links it", async () => {
    accept("teacher");
    submit();

    const link = await screen.findByRole("link", { name: /sign in as a teacher/i });
    expect(link).toHaveAttribute("href", "/auth/teacher");
  });

  it("does not leave a live session behind when it refuses", async () => {
    // The login SUCCEEDED, so a session exists server-side. Refusing without
    // ending it leaves somebody told "not here" holding a session for
    // somewhere else.
    accept("student");
    submit();

    await screen.findByText(/this is the school admin sign-in/i);
    expect(logout).toHaveBeenCalled();
  });

  it("does not invite a retry that cannot work", async () => {
    accept("teacher");
    submit();

    await screen.findByText(/this is the school admin sign-in/i);
    expect(primary()).toHaveAccessibleName(/^Sign in$/i);
    expect(screen.queryByRole("button", { name: /Try again/i })).not.toBeInTheDocument();
  });

  it("lets both real admin roles through", async () => {
    // There is no plain "admin" - a proprietor comes back as `senco_admin`.
    // A door checking `role === "admin"` would refuse every real admin, which
    // is the failure mode `isAdminRole` exists to prevent.
    for (const role of ["senco_admin", "other_admin"]) {
      signIn.mockReset();
      accept(role);
      submit();

      await vi.waitFor(() => expect(signIn).toHaveBeenCalled());
      expect(signIn.mock.calls[0][0]).toMatchObject({ role });
    }
  });

  it("refuses a role no door serves, without inventing one", async () => {
    // A parent never signs in - they arrive by tokenised link - so there is
    // genuinely nowhere to send them and the copy must not pretend otherwise.
    accept("parent_guardian");
    submit();

    await screen.findByText(/can.t be used to sign in here/i);
    expect(screen.queryByRole("link", { name: /sign in as a/i })).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("refuses a role this build has never heard of", async () => {
    // `session.role as UserRole` was a cast, not a check: an unrecognised role
    // went into the session and the role-mirror cookie, where proxy.ts matches
    // no branch and bounces from everywhere with no explanation anywhere.
    accept("district_inspector");
    submit();

    await screen.findByText(/can.t be used to sign in here/i);
    expect(signIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
