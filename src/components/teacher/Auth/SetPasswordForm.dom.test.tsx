import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push, params, loginPassword, completePasswordReset, acceptInvitation, acceptJoin } =
  vi.hoisted(() => ({
    push: vi.fn(),
    params: { value: new URLSearchParams() },
    loginPassword: vi.fn(),
    completePasswordReset: vi.fn(),
    acceptInvitation: vi.fn(),
    acceptJoin: vi.fn(),
  }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api", () => ({
  authApi: { loginPassword, completePasswordReset },
  teamApi: { acceptInvitation },
}));
vi.mock("@/lib/api/invites", () => ({ invitesApi: { acceptJoin } }));

import { SetPasswordForm } from "./SetPasswordForm";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { clearSession, getSession, setSession } from "@/lib/auth/session";

/**
 * WHO THE SET-PASSWORD SCREEN HANDS YOU TO.
 *
 * Two faults, one component:
 *
 *  - It ended nothing. Activating on a staffroom machine where another teacher
 *    was still signed in, any route that finished at the sign-in door was
 *    bounced by `proxy.ts` straight into THAT teacher's console - a signed-in
 *    teacher has no use for their own door.
 *  - It assumed a teacher. An invited admin was told "Your teacher account is
 *    active" and sent to the teacher door, and an admin's reset finished there.
 */

const HOLD_MS = 2500; // past the 1.6s success beat

const signedInAs = (userId: string, role: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role: role as never,
  });

/** What the real `authApi.loginPassword` does: store the session it gets. */
const logsInAs = (userId: string, role: string) =>
  loginPassword.mockImplementation(async () => {
    signedInAs(userId, role);
    return { accessToken: `tok-${userId}`, expiresAt: "", userId, role };
  });

const fillAndSubmit = (activation: boolean) => {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "lessons42" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "lessons42" } });
  if (activation) fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", {
      name: activation ? "Activate my account" : "Save new password",
    }),
  );
};

const pushedTo = async () => {
  await waitFor(() => expect(push).toHaveBeenCalled(), { timeout: HOLD_MS });
  return push.mock.calls[0][0] as string;
};

beforeEach(() => {
  push.mockReset();
  loginPassword.mockReset();
  completePasswordReset.mockReset().mockResolvedValue(undefined);
  acceptInvitation.mockReset().mockResolvedValue({ role: "teacher" });
  acceptJoin.mockReset().mockResolvedValue(undefined);
  clearSession();
  window.localStorage.clear();
});

afterEach(() => clearSession());

describe("activating on a device someone else is signed into", () => {
  beforeEach(() => {
    params.value = new URLSearchParams("token=inv-1&email=new@school.ng");
    signedInAs("t-previous", "teacher");
  });

  it("ends the previous teacher's session, so the door does not bounce into their console", async () => {
    loginPassword.mockRejectedValue(new Error("network"));
    render(<SetPasswordForm mode="activation" />);
    fillAndSubmit(true);

    expect(await pushedTo()).toBe("/auth/teacher");
    expect(getSession()).toBeNull();
    expect(document.cookie).not.toMatch(/nevo\.role=teacher/);
  });

  it("ends it when there is no address to sign in as, too", async () => {
    params.value = new URLSearchParams("token=inv-1");
    render(<SetPasswordForm mode="activation" />);
    fillAndSubmit(true);

    expect(await pushedTo()).toBe("/auth/teacher");
    expect(getSession()).toBeNull();
  });

  it("ends it BEFORE signing the new teacher in, so the new session survives", async () => {
    logsInAs("t-new", "teacher");
    render(<SetPasswordForm mode="activation" />);
    fillAndSubmit(true);

    expect(await pushedTo()).toBe("/teacher/dashboard");
    expect(getSession()?.userId).toBe("t-new");
  });

  it("ends nothing when the activation itself failed", async () => {
    // Nothing was activated, so nobody new is at the keyboard.
    acceptInvitation.mockRejectedValue(new Error("expired"));
    render(<SetPasswordForm mode="activation" />);
    fillAndSubmit(true);

    expect(await screen.findByText(/couldn't activate your account/)).toBeInTheDocument();
    expect(getSession()?.userId).toBe("t-previous");
  });
});

describe("a reset on a device someone is signed into", () => {
  it("ends the session before sending them to sign in", async () => {
    params.value = new URLSearchParams("token=rst-1");
    signedInAs("t-previous", "teacher");
    render(<SetPasswordForm mode="reset" />);
    fillAndSubmit(false);

    expect(await pushedTo()).toBe("/auth/teacher");
    expect(getSession()).toBeNull();
  });
});

describe("an invited admin", () => {
  beforeEach(() => {
    params.value = new URLSearchParams("token=inv-1&email=deputy@school.ng");
  });

  it("is taken to the admin console and told it is an admin account", async () => {
    logsInAs("a-1", "senco_admin");
    render(<SetPasswordForm mode="activation" door="admin" />);
    fillAndSubmit(true);

    expect(await screen.findByText("Your school admin account is active.")).toBeInTheDocument();
    expect(screen.queryByText(/teacher account/)).not.toBeInTheDocument();
    expect(await pushedTo()).toBe("/admin");
  });

  it("goes by the role the server returned, even on the teacher's route", async () => {
    // An admin invite sent before the admin route existed still lands here.
    logsInAs("a-1", "other_admin");
    render(<SetPasswordForm mode="activation" />);
    fillAndSubmit(true);

    expect(await screen.findByText("Your school admin account is active.")).toBeInTheDocument();
    expect(await pushedTo()).toBe("/admin");
  });

  it("is sent to the admin door when the sign-in hop fails", async () => {
    loginPassword.mockRejectedValue(new Error("network"));
    render(<SetPasswordForm mode="activation" door="admin" />);
    fillAndSubmit(true);

    expect(
      await screen.findByText("Your school admin account is active. Sign in to get started."),
    ).toBeInTheDocument();
    expect(await pushedTo()).toBe("/auth/admin");
  });

  it("carries no session for a role no staff console serves", async () => {
    logsInAs("p-1", "parent_guardian");
    render(<SetPasswordForm mode="activation" door="admin" />);
    fillAndSubmit(true);

    expect(await pushedTo()).toBe("/auth/admin");
    expect(getSession()).toBeNull();
  });
});

describe("an invited teacher", () => {
  it("is still taken to the teacher console, in the drawn words", async () => {
    params.value = new URLSearchParams("token=inv-1&email=new@school.ng");
    logsInAs("t-new", "teacher");
    render(<SetPasswordForm mode="activation" />);
    fillAndSubmit(true);

    expect(await screen.findByText("Your teacher account is active.")).toBeInTheDocument();
    expect(await pushedTo()).toBe("/teacher/dashboard");
  });
});

describe("where a reset finishes", () => {
  beforeEach(() => {
    params.value = new URLSearchParams("token=rst-1");
  });

  it("finishes at the admin door on the admin's reset", async () => {
    render(<TeacherPasswordReset signInHref="/auth/admin" resetHref="/auth/admin/reset" />);
    fillAndSubmit(false);

    expect(await pushedTo()).toBe("/auth/admin");
  });

  it("recovers an expired admin link on the admin's reset screen", async () => {
    completePasswordReset.mockRejectedValue(new Error("expired"));
    render(<TeacherPasswordReset signInHref="/auth/admin" resetHref="/auth/admin/reset" />);
    fillAndSubmit(false);

    expect(await pushedTo()).toBe("/auth/admin/reset?expired=1");
  });

  it("finishes on the landing page at the role-neutral route", async () => {
    render(<TeacherPasswordReset signInHref="/" resetHref="/auth/forgot-password" />);
    fillAndSubmit(false);

    expect(await pushedTo()).toBe("/");
  });

  it("is unchanged on the teacher's own route", async () => {
    render(<TeacherPasswordReset />);
    fillAndSubmit(false);

    expect(await pushedTo()).toBe("/auth/teacher");
  });
});

/**
 * THE ROUTES THEMSELVES. The props above are only half of it: the admin pages
 * have to pass them, and a page that forgot would put every admin back on the
 * teacher door with every test here still green.
 */
describe("the admin's own routes", () => {
  it("activates an admin on the admin route as an admin", async () => {
    const { default: AdminActivatePage } = await import("@/app/auth/admin/activate/page");
    params.value = new URLSearchParams("token=inv-1&email=deputy@school.ng");
    loginPassword.mockRejectedValue(new Error("network"));
    render(<AdminActivatePage />);
    fillAndSubmit(true);

    expect(await screen.findByText(/Your school admin account is active/)).toBeInTheDocument();
    expect(await pushedTo()).toBe("/auth/admin");
  });

  it("finishes an admin's reset at the admin door", async () => {
    const { default: AdminResetPage } = await import("@/app/auth/admin/reset/page");
    params.value = new URLSearchParams("token=rst-1");
    render(<AdminResetPage />);
    fillAndSubmit(false);

    expect(await pushedTo()).toBe("/auth/admin");
  });
});
