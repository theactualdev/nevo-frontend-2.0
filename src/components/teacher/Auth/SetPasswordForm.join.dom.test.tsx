import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push, params, loginPassword, acceptJoin, lookupJoin } = vi.hoisted(() => ({
  push: vi.fn(),
  params: { value: new URLSearchParams() },
  loginPassword: vi.fn(),
  acceptJoin: vi.fn(),
  lookupJoin: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api", () => ({
  authApi: { loginPassword, completePasswordReset: vi.fn() },
  teamApi: { acceptInvitation: vi.fn() },
}));
vi.mock("@/lib/api/invites", () => ({ invitesApi: { acceptJoin, lookupJoin } }));

import { SetPasswordForm } from "./SetPasswordForm";
import { ApiError } from "@/lib/api/client";
import { clearSession, getSession } from "@/lib/auth/session";

/**
 * T209. A join link's accept answers with a session of its own, and it was
 * thrown away: the teacher was signed in a second time with the address on the
 * link - and with no address there, sent to the door to do it by hand.
 */

const SESSION = {
  accessToken: "tok-joined",
  tokenType: "bearer",
  expiresAt: "2999-01-01T00:00:00Z",
  userId: "t-joined",
  role: "teacher",
};

const activate = () => {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "lessons42" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "lessons42" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Activate my account" }));
};

beforeEach(() => {
  params.value = new URLSearchParams("token=j-1&via=join");
  push.mockReset();
  loginPassword.mockReset();
  acceptJoin.mockReset();
  lookupJoin
    .mockReset()
    .mockResolvedValue({ status: "valid", role: "teacher", schoolName: null, expiresAt: "" });
});
afterEach(() => clearSession());

describe("joining by link", () => {
  it("keeps the session the join answered with, and signs in no second time", async () => {
    acceptJoin.mockResolvedValue({
      userId: "t-joined",
      role: "teacher",
      loginIdentifier: null,
      session: SESSION,
    });
    render(<SetPasswordForm mode="activation" />);
    activate();

    await waitFor(() => expect(getSession()?.userId).toBe("t-joined"));
    expect(getSession()?.token).toBe("tok-joined");
    expect(loginPassword).not.toHaveBeenCalled();
  });

  it("goes to the console, even with no address on the link", async () => {
    acceptJoin.mockResolvedValue({
      userId: "t-joined",
      role: "teacher",
      loginIdentifier: null,
      session: SESSION,
    });
    render(<SetPasswordForm mode="activation" />);
    activate();

    expect(await screen.findByText("Taking you to your console…")).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/dashboard"), {
      timeout: 2500,
    });
  });

  it("still sends them to sign in when the join carried no session", async () => {
    acceptJoin.mockResolvedValue({
      userId: "t-joined",
      role: "teacher",
      loginIdentifier: null,
      session: null,
    });
    render(<SetPasswordForm mode="activation" />);
    activate();

    expect(await screen.findByText("Taking you to sign in…")).toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it("keeps no session for a role no staff console serves", async () => {
    acceptJoin.mockResolvedValue({
      userId: "s-1",
      role: "student",
      loginIdentifier: null,
      session: { ...SESSION, userId: "s-1", role: "student" },
    });
    render(<SetPasswordForm mode="activation" />);
    activate();

    expect(await screen.findByText("Taking you to sign in…")).toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it("names the school the link is from, which the landing knew and passed on to nobody", async () => {
    lookupJoin.mockResolvedValue({
      status: "valid",
      role: "teacher",
      schoolName: "Brightgate Academy",
      expiresAt: "",
    });
    render(<SetPasswordForm mode="activation" />);

    expect(await screen.findByText("Brightgate Academy")).toBeInTheDocument();
    expect(lookupJoin).toHaveBeenCalledWith("j-1");
  });

  it("asks nothing about an invitation that is not a join link", () => {
    params.value = new URLSearchParams("token=inv-1&email=new@school.ng");
    render(<SetPasswordForm mode="activation" />);

    expect(lookupJoin).not.toHaveBeenCalled();
  });
});

/**
 * 4c5706a: an invited teacher's reserved account can stop matching their
 * invite, and the accept answers 409 `invited_teacher_conflict` every time.
 */
describe("an invite that no longer matches the account", () => {
  const conflict = () =>
    new ApiError(409, "conflict", { detail: { code: "invited_teacher_conflict" } });

  it("says so, names the school administrator as the way on, and offers no retry", async () => {
    acceptJoin.mockRejectedValue(conflict());
    render(<SetPasswordForm mode="activation" />);
    activate();

    expect(
      await screen.findByRole("heading", { name: "This invite no longer matches your account" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ask your school administrator to review your invite/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activate my account/ })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("signs nobody in and goes nowhere", async () => {
    acceptJoin.mockRejectedValue(conflict());
    render(<SetPasswordForm mode="activation" />);
    activate();

    await screen.findByRole("heading", { name: "This invite no longer matches your account" });
    expect(getSession()).toBeNull();
    expect(loginPassword).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the school the link is from above it", async () => {
    lookupJoin.mockResolvedValue({
      status: "valid",
      role: "teacher",
      schoolName: "Brightgate Academy",
      expiresAt: "",
    });
    acceptJoin.mockRejectedValue(conflict());
    render(<SetPasswordForm mode="activation" />);
    await screen.findByText("Brightgate Academy");
    activate();

    await screen.findByRole("heading", { name: "This invite no longer matches your account" });
    expect(screen.getByText("Brightgate Academy")).toBeInTheDocument();
  });

  it("leaves any other refusal of the link on the form, as before", async () => {
    acceptJoin.mockRejectedValue(
      new ApiError(409, "used", { detail: { code: "join_link_used" } }),
    );
    render(<SetPasswordForm mode="activation" />);
    activate();

    expect(await screen.findByText(/couldn't activate your account/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Activate my account/ })).toBeInTheDocument();
  });

  it("does not blame the link when Nevo could not be reached", async () => {
    acceptJoin.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SetPasswordForm mode="activation" />);
    activate();

    expect(await screen.findByText(/couldn’t reach Nevo just now/)).toBeInTheDocument();
    expect(screen.queryByText(/may have expired/)).toBeNull();
  });
});

/**
 * ed123cb: the LOOKUP answers the same 409, so the screen says so before the
 * teacher has chosen a password the accept would only refuse.
 */
describe("an invite the lookup already says no longer matches", () => {
  const conflict = () =>
    new ApiError(409, "conflict", {
      detail: {
        code: "invited_teacher_conflict",
        message:
          "This teacher invitation needs a school administrator's review before it can be accepted.",
        invitationId: "inv-1",
      },
    });

  it("shows the state without the form ever being filled", async () => {
    lookupJoin.mockRejectedValue(conflict());
    render(<SetPasswordForm mode="activation" />);

    expect(
      await screen.findByRole("heading", { name: "This invite no longer matches your account" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(acceptJoin).not.toHaveBeenCalled();
  });

  it("uses our words for the teacher, not the server's to an administrator", async () => {
    lookupJoin.mockRejectedValue(conflict());
    render(<SetPasswordForm mode="activation" />);

    await screen.findByRole("heading", { name: "This invite no longer matches your account" });
    expect(screen.queryByText(/needs a school administrator's review/)).toBeNull();
  });

  it("leaves the form alone on any other lookup failure", async () => {
    lookupJoin.mockRejectedValue(new ApiError(503, "down"));
    render(<SetPasswordForm mode="activation" />);

    await waitFor(() => expect(lookupJoin).toHaveBeenCalled());
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /no longer matches/ })).toBeNull();
  });
});
