import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { params, requestPasswordReset } = vi.hoisted(() => ({
  params: { value: new URLSearchParams() },
  requestPasswordReset: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api", () => ({
  authApi: { requestPasswordReset, loginPassword: vi.fn(), completePasswordReset: vi.fn() },
  teamApi: { acceptInvitation: vi.fn() },
}));
vi.mock("@/lib/api/invites", () => ({ invitesApi: { acceptJoin: vi.fn() } }));

import { SetPasswordForm } from "./SetPasswordForm";
import { TeacherPasswordReset } from "./TeacherPasswordReset";

/**
 * The staff password screens against their frames (Nevo Set Password, C02d):
 * the wordmark, the requirement wording, the strength label and match line,
 * the reset callout, the trust line and the contact footer under a hairline -
 * on every state, sent and expired included.
 */

const TROUBLE = "Having trouble? Contact your school administrator.";
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  params.value = new URLSearchParams();
  requestPasswordReset.mockReset().mockResolvedValue({});
});

describe("setting a password", () => {
  it("carries the wordmark and the frame's requirement wording", () => {
    render(<SetPasswordForm mode="activation" />);

    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(screen.getByText("Contains a number")).toBeInTheDocument();
    expect(screen.queryByText("At least one number")).not.toBeInTheDocument();
  });

  it("states strength in navy, at the frame's weight", () => {
    render(<SetPasswordForm mode="activation" />);
    type("Password", "abc12345");

    const label = screen.getByText(/^(Weak|Fair|Strong)$/);
    expect(label.className).toMatch(/text-nevo-navy/);
    expect(label.className).toMatch(/font-semibold/);
  });

  it("marks the match line with an icon and colour, either way", () => {
    render(<SetPasswordForm mode="activation" />);
    type("Password", "abc12345");
    type("Confirm password", "abc1");

    const notYet = screen.getByText("Passwords don't match yet");
    expect(notYet.className).toMatch(/text-\[#7c7ea8\]/);
    expect(notYet.querySelector("svg")).not.toBeNull();

    type("Confirm password", "abc12345");
    const match = screen.getByText("Passwords match");
    expect(match.className).toMatch(/text-nevo-navy/);
    expect(match.querySelector("svg")).not.toBeNull();
  });

  it("puts the trust line beside its shield, and the footer under a hairline", () => {
    render(<SetPasswordForm mode="activation" />);

    const trust = screen.getByText("Your information is protected from the moment you sign in.");
    expect(trust.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(TROUBLE).parentElement?.className).toMatch(/border-t/);
  });

  it("draws the reset note as the frame's violet callout", () => {
    render(<SetPasswordForm mode="reset" />);

    const note = screen.getByText(/saving a new password signs you out/);
    expect(note.parentElement?.className).toMatch(/bg-nevo-violet\/16/);
  });
});

describe("resetting a password", () => {
  it("keeps the wordmark and the footer once the link is sent", async () => {
    render(<TeacherPasswordReset />);
    type("Email", "ms.adeyemi@school.test");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    // The screen holds a 1.1s "sending" beat before it says so.
    expect(await screen.findByText("Check your inbox", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(screen.getByText(TROUBLE)).toBeInTheDocument();
  });

  it("keeps them on an expired link", () => {
    params.value = new URLSearchParams("expired=1");
    render(<TeacherPasswordReset />);

    expect(screen.getByText("This link has expired")).toBeInTheDocument();
    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(screen.getByText(TROUBLE)).toBeInTheDocument();
  });

  it("keeps them on the first step", () => {
    render(<TeacherPasswordReset />);

    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(screen.getByText(TROUBLE)).toBeInTheDocument();
  });
});
