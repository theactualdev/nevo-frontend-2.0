import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { withGate } from "@/test/setupGate";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/** D01b AC-05: "You can look around, but changes are paused until you confirm." */

const list = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => list() } };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const pending: Invitation = {
  id: "i1",
  token: null,
  role: "teacher",
  email: "bola@school.edu.ng",
  name: "Bola Eze",
  status: "pending",
  expiresAt: "2026-12-01T00:00:00Z",
  consentStatus: null,
  deliveryStatus: "sent",
};

describe("Invitations while the address is unconfirmed", () => {
  it("greys inviting, importing, resending and revoking, and says why", async () => {
    list.mockResolvedValue([pending]);
    const { container } = render(withGate(<InvitationsView />, "email_unconfirmed"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Resend" })).toBeDisabled());
    expect(screen.getByRole("button", { name: /New invite/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bulk import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
    expect(visibleText(container)).toMatch(/Paused until your email is confirmed\./);
  });
});
