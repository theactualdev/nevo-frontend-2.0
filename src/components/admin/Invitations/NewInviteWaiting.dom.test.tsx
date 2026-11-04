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
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, create: (d: unknown) => create(d) } };
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
