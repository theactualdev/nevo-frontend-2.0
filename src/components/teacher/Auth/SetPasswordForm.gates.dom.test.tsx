import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { params, acceptInvitation, acceptJoin, completePasswordReset } = vi.hoisted(() => ({
  params: { value: new URLSearchParams() },
  acceptInvitation: vi.fn(),
  acceptJoin: vi.fn(),
  completePasswordReset: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api", () => ({
  authApi: { loginPassword: vi.fn(), completePasswordReset },
  teamApi: { acceptInvitation },
}));
vi.mock("@/lib/api/invites", () => ({
  invitesApi: { acceptJoin, lookupJoin: vi.fn(() => new Promise(() => {})) },
}));

import { SetPasswordForm } from "./SetPasswordForm";

/**
 * T238. The gates in front of the activation and reset writes: which endpoint
 * a token goes to, a link with no token, and the consent box.
 *
 * The endpoint choice is the one that once broke every invite: join tokens
 * were posted to the admin-team endpoint, which does not know them, so no
 * teacher invited from the admin console could activate at all.
 */

const fill = () => {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "lessons42" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "lessons42" } });
};

beforeEach(() => {
  params.value = new URLSearchParams();
  acceptInvitation.mockReset().mockReturnValue(new Promise(() => {}));
  acceptJoin.mockReset().mockReturnValue(new Promise(() => {}));
  completePasswordReset.mockReset().mockReturnValue(new Promise(() => {}));
});

describe("which endpoint a token goes to", () => {
  it("sends a join link's token to the join endpoint, in the path", () => {
    params.value = new URLSearchParams("token=j-1&via=join");
    render(<SetPasswordForm mode="activation" />);
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Activate my account" }));

    expect(acceptJoin).toHaveBeenCalledWith("j-1", { password: "lessons42" });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("sends an admin-team invitation's token to the team endpoint, in the body", () => {
    params.value = new URLSearchParams("token=inv-1&email=new@school.ng");
    render(<SetPasswordForm mode="activation" />);
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Activate my account" }));

    expect(acceptInvitation).toHaveBeenCalledWith({ invitationToken: "inv-1", password: "lessons42" });
    expect(acceptJoin).not.toHaveBeenCalled();
  });
});

describe("the consent box on activation", () => {
  it("holds Activate until it is ticked", () => {
    params.value = new URLSearchParams("token=inv-1");
    render(<SetPasswordForm mode="activation" />);
    fill();

    expect(screen.getByRole("button", { name: "Activate my account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Activate my account" })).toBeEnabled();
  });

  it("is not asked for on a reset, which is not an agreement", () => {
    params.value = new URLSearchParams("token=r-1");
    render(<SetPasswordForm mode="reset" />);
    fill();

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new password" })).toBeEnabled();
  });
});

describe("a link with no token", () => {
  it("says the activation link is missing its code, and sends nothing", () => {
    render(<SetPasswordForm mode="activation" />);
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Activate my account" }));

    expect(screen.getByText(/activation link is missing its code/)).toBeInTheDocument();
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(acceptJoin).not.toHaveBeenCalled();
  });

  it("says the reset link is missing its code, and sends nothing", () => {
    render(<SetPasswordForm mode="reset" />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByText(/reset link is missing its code/)).toBeInTheDocument();
    expect(completePasswordReset).not.toHaveBeenCalled();
  });
});
