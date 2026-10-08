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
      schoolName: "Corona Secondary",
      expiresAt: "",
    });
    render(<SetPasswordForm mode="activation" />);

    expect(await screen.findByText("Corona Secondary")).toBeInTheDocument();
    expect(lookupJoin).toHaveBeenCalledWith("j-1");
  });

  it("asks nothing about an invitation that is not a join link", () => {
    params.value = new URLSearchParams("token=inv-1&email=new@school.ng");
    render(<SetPasswordForm mode="activation" />);

    expect(lookupJoin).not.toHaveBeenCalled();
  });
});
