import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * Copy link, Resend and Revoke used to appear on every row that had not
 * joined - so an expired invite offered Revoke and a revoked one offered a
 * dead link to copy. The frame: Resend on pending or expired, Revoke on
 * pending only, and a link only while it works.
 */

const list = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => list() } };
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

    const revoked = within(row("Chidi Eze"));
    expect(revoked.queryByRole("button")).toBeNull();
    expect(revoked.getByText("Nothing to do")).toBeInTheDocument();
  });
});
