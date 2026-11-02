import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { NewInviteModal } from "./NewInviteModal";

/**
 * Inviting a teacher who already has an invitation waiting (409
 * `invitation_already_pending`, ed123cb) is not a fault, and trying again is
 * refused the same way. It used to say "Something went wrong. We're on it."
 * Lydia's words, 31 Oct (Q11b).
 */

const create = vi.fn();
const reissue = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: {
      ...actual.invitesApi,
      create: (d: unknown) => create(d),
      reissue: (id: string) => reissue(id),
    },
  };
});

const send = () => {
  render(<NewInviteModal classes={[]} onClose={vi.fn()} onSent={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Folake Adeyemi" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
};

describe("a teacher who already has an invitation waiting", () => {
  it("says so, and to resend it, rather than that something went wrong", async () => {
    create.mockRejectedValueOnce(
      new ApiError(409, "conflict", {
        detail: { code: "invitation_already_pending", invitationId: "inv-1" },
      }),
    );
    send();
    expect(await screen.findByText("This person already has an invitation waiting.")).toBeInTheDocument();
    expect(screen.getByText("Resend it instead.")).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("still says something went wrong when it did", async () => {
    create.mockRejectedValueOnce(new ApiError(500, "down"));
    send();
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});

describe("a teacher whose invitation was revoked (Lydia, 2 Nov)", () => {
  const revoked = () =>
    new ApiError(409, "conflict", {
      detail: { code: "invitation_reissue_available", invitationId: "inv-old" },
    });

  it("says it was revoked, and reissues that invitation from here", async () => {
    create.mockRejectedValueOnce(revoked());
    reissue.mockResolvedValueOnce({
      id: "inv-old",
      token: "tok",
      role: "teacher",
      email: "folake@school.edu.ng",
      name: "Folake Adeyemi",
      status: "pending",
      expiresAt: "2099-01-01T00:00:00Z",
      deliveryStatus: "sent",
      consentStatus: null,
    });
    send();
    expect(await screen.findByText("This teacher’s invitation was revoked.")).toBeInTheDocument();
    expect(screen.getByText("Reissue it instead.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reissue invitation" }));
    expect(await screen.findByText("Invitation reissued to folake@school.edu.ng")).toBeInTheDocument();
    expect(reissue).toHaveBeenCalledWith("inv-old");
  });

  it("says why when the reissue is refused, and stays on the form's answer", async () => {
    create.mockRejectedValueOnce(revoked());
    reissue.mockRejectedValueOnce(
      new ApiError(409, "conflict", { detail: { code: "teacher_email_in_use" } }),
    );
    send();
    fireEvent.click(await screen.findByRole("button", { name: "Reissue invitation" }));
    expect(
      await screen.findByText(
        "This email address is now used by another account, so the invitation cannot be reissued.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("This teacher’s invitation was revoked.")).toBeInTheDocument();
  });

  it("falls back to the plain failure when the server names no invitation to reissue", async () => {
    create.mockRejectedValueOnce(
      new ApiError(409, "conflict", { detail: { code: "invitation_reissue_available" } }),
    );
    send();
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });

});
