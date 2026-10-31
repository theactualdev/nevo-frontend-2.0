import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * Copy link, Resend and Revoke used to appear on every row that had not
 * joined - so an expired invite offered Revoke and a revoked one offered a
 * dead link to copy. The frame: Resend on pending or expired, Revoke on
 * pending only, and a link only while it works.
 */

const list = vi.fn();
const reissue = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: { ...actual.invitesApi, list: () => list(), reissue: (id: string) => reissue(id) },
  };
});

// Braced: an arrow that returns the mock has vitest call it as cleanup.
beforeEach(() => {
  reissue.mockReset();
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (name: string, status: string, expiresAt = "2099-01-01T00:00:00Z"): Invitation => ({
  id: name,
  token: `tok-${name}`,
  role: "teacher",
  email: `${name}@school.edu.ng`,
  name,
  status,
  expiresAt,
  consentStatus: null,
  deliveryStatus: "sent",
});

const row = (name: string) => screen.getByText(name).closest("div.px-6") as HTMLElement;

describe("invitation row actions", () => {
  it("offers each action only where it means something", async () => {
    list.mockResolvedValue([
      invite("Amaka Obi", "pending"),
      invite("Bayo Ade", "expired", "2020-01-01T00:00:00Z"),
      invite("Chidi Eze", "revoked"),
    ]);
    render(<InvitationsView />);
    await waitFor(() => expect(screen.getByText("Chidi Eze")).toBeInTheDocument());

    const pending = within(row("Amaka Obi"));
    expect(pending.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(pending.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(pending.getByRole("button", { name: "Revoke" })).toBeInTheDocument();

    const expired = within(row("Bayo Ade"));
    expect(expired.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(expired.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(expired.queryByRole("button", { name: "Copy link" })).toBeNull();

    // A revoked teacher comes back only through the original invitation
    // (ed123cb; Lydia's words, 31 Oct).
    const revoked = within(row("Chidi Eze"));
    expect(revoked.getAllByRole("button").map((b) => b.textContent)).toEqual(["Reissue invitation"]);
  });

  it("labels an invite whose account changed 'Account changed', and offers no Resend (Lydia, Q11c)", async () => {
    list.mockResolvedValue([invite("Dayo Ike", "conflicted")]);
    render(<InvitationsView />);
    await waitFor(() => expect(screen.getByText("Dayo Ike")).toBeInTheDocument());

    const changed = within(row("Dayo Ike"));
    expect(changed.getByText("Account changed")).toBeInTheDocument();
    expect(changed.queryByRole("button", { name: "Resend" })).toBeNull();
    expect(changed.queryByRole("button", { name: "Copy link" })).toBeNull();
    // Still live on the server, so it can still be revoked.
    expect(changed.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });
});

describe("reissuing a revoked invitation (ed123cb; Lydia, Q11a)", () => {
  it("reissues it, and the row is pending again", async () => {
    list.mockResolvedValue([invite("Chidi Eze", "revoked")]);
    reissue.mockResolvedValue({ ...invite("Chidi Eze", "pending"), deliveryStatus: "sent" });
    render(<InvitationsView />);
    await waitFor(() => expect(screen.getByText("Chidi Eze")).toBeInTheDocument());

    fireEvent.click(within(row("Chidi Eze")).getByRole("button", { name: "Reissue invitation" }));
    await waitFor(() => expect(reissue).toHaveBeenCalledWith("Chidi Eze"));
    await waitFor(() => expect(within(row("Chidi Eze")).getByText("Pending")).toBeInTheDocument());
  });

  it("says so in her words when the account it was reserved for has changed", async () => {
    list.mockResolvedValue([invite("Chidi Eze", "revoked")]);
    reissue.mockRejectedValue(
      new ApiError(409, "conflict", { detail: { code: "reserved_teacher_state_changed" } }),
    );
    render(<InvitationsView />);
    await waitFor(() => expect(screen.getByText("Chidi Eze")).toBeInTheDocument());

    fireEvent.click(within(row("Chidi Eze")).getByRole("button", { name: "Reissue invitation" }));
    expect(
      await screen.findByText(
        "This invitation cannot be reissued, because the account it was reserved for has changed.",
      ),
    ).toBeInTheDocument();
  });

  it("says it can't be reissued, without a reason it has no words for, on another refusal", async () => {
    list.mockResolvedValue([invite("Chidi Eze", "revoked")]);
    reissue.mockRejectedValue(new ApiError(409, "conflict", { detail: { code: "teacher_email_in_use" } }));
    render(<InvitationsView />);
    await waitFor(() => expect(screen.getByText("Chidi Eze")).toBeInTheDocument());

    fireEvent.click(within(row("Chidi Eze")).getByRole("button", { name: "Reissue invitation" }));
    expect(await screen.findByText("This invitation cannot be reissued.")).toBeInTheDocument();
    expect(screen.queryByText(/try again/)).toBeNull();
  });
});
