import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { params } = vi.hoisted(() => ({ params: { current: new URLSearchParams() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => params.current,
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signOut: vi.fn(),
    status: "guest",
    user: null,
  }),
}));
// A promise that never settles. The screen calls `authApi.ssoCallback` on
// mount and leaves the signing-in phase as soon as it resolves or rejects, so
// resolving it here would race the assertions off the phase under test.
vi.mock("@/lib/api", () => ({
  authApi: { ssoCallback: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/auth/session", () => ({ setSession: vi.fn() }));

import { TeacherSsoCallback } from "./TeacherSsoCallback";

/**
 * C02b, the screen a teacher lands on coming back from their school's identity
 * provider.
 *
 * WHAT WAS WRONG. The signing-in line read
 * `Signing you in through ${TEACHER_INVITE.school}`, a fixture, so a teacher of
 * any school was told they were being signed in through the fixture's school
 * - on an auth screen, mid-handshake, at the moment they are deciding
 * whether to trust what they are looking at.
 *
 * Nothing on this screen knows the school: the teacher arrives BEFORE the token
 * exchange, so there is no session to read one off, and the callback carries a
 * provider and a code rather than a school name.
 *
 * NOTE FOR WHOEVER EDITS THESE. `shown` is `incomplete ? "error" : phase`, and
 * `incomplete` is true unless provider, code AND state are all on the URL. A
 * render with no search params shows the ERROR phase, so a "no school name
 * appears" assertion written that way passes without ever rendering the line it
 * claims to check. The first draft of this file did exactly that. `signingIn()`
 * below is what puts the screen on the phase under test.
 */

const signingIn = () => {
  params.current = new URLSearchParams({
    provider: "microsoft",
    code: "auth-code-123",
    state: "state-abc",
  });
};

beforeEach(() => {
  params.current = new URLSearchParams();
});

describe("the signing-in line", () => {
  it("names no school", () => {
    signingIn();
    render(<TeacherSsoCallback />);

    // Guard against the vacuous pass described above: prove we are on the
    // signing-in phase before asserting what it does not say.
    expect(screen.getByRole("status", { name: /working/i })).toBeInTheDocument();

    expect(screen.queryByText(/Brightgate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Secondary School/i)).not.toBeInTheDocument();
  });

  it("still says what is happening", () => {
    // Removing the school must not leave the teacher watching a bare spinner.
    signingIn();
    render(<TeacherSsoCallback />);

    expect(
      screen.getByText(/Signing you in through your school/i),
    ).toBeInTheDocument();
  });
});

describe("the error phase", () => {
  it("names no school either", () => {
    // An incomplete link is the state a teacher is most likely to screenshot
    // and send to their IT lead, so a wrong school name here travels furthest.
    render(<TeacherSsoCallback />);

    expect(screen.queryByText(/Brightgate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Secondary School/i)).not.toBeInTheDocument();
  });
});
