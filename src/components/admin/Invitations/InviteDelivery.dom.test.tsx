import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invitation, InvitationDeliveryStatus } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * "Invite resent to <name>" was said over a response that told us nobody was
 * emailed.
 *
 * `resend` returns the refreshed row, `deliveryStatus` is on it, and it was
 * never read - so the admin pressed Resend on a teacher who had not joined,
 * was told the invite reached them, and waited. Pressing it again does the
 * same nothing. The link is the only way in, and this screen offered no way to
 * get one.
 */

const list = vi.fn();
const resend = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: {
      ...actual.invitesApi,
      list: () => list(),
      resend: (id: string) => resend(id),
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (over: Partial<Invitation> = {}): Invitation => ({
  id: "inv1",
  token: null,
  role: "teacher",
  email: "adeyemi.f@school.edu.ng",
  name: "Folake Adeyemi",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z", // far off: InvitationsView judges expiry against today
  consentStatus: null,
  deliveryStatus: "sent",
  ...over,
});

const refreshed = (
  // NULLABLE ON PURPOSE. The fixture used to be typed
  // `InvitationDeliveryStatus`, which excluded null - so the branch that
  // claimed delivery from an unread field could not even be expressed here.
  deliveryStatus: InvitationDeliveryStatus | null,
  token: string | null = "tok1",
): Invitation => invite({ deliveryStatus, token });

describe("InvitationsView resend", () => {
  it("does not claim an email reached them when none was sent", async () => {
    list.mockResolvedValue([invite()]);
    resend.mockResolvedValue(refreshed("email_not_configured"));

    const { container } = render(<InvitationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/No email went out/i),
    );
    expect(visibleText(container)).not.toMatch(/Invite resent to/);

    // And the recovery is right there, persistently - not in a 3s toast.
    expect(visibleText(container)).toMatch(/\/join\/tok1/);
    expect(visibleText(container)).toMatch(
      /No email was sent to Folake Adeyemi/i,
    );
  });

  it("treats not_requested the same way", async () => {
    list.mockResolvedValue([invite()]);
    resend.mockResolvedValue(refreshed("not_requested"));

    const { container } = render(<InvitationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/\/join\/tok1/));
    expect(visibleText(container)).not.toMatch(/Invite resent to/);
  });

  it("says it resent when the backend actually emailed them", async () => {
    list.mockResolvedValue([invite()]);
    resend.mockResolvedValue(refreshed("sent"));

    const { container } = render(<InvitationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /Invite resent to adeyemi\.f@school\.edu\.ng/,
      ),
    );
    expect(visibleText(container)).not.toMatch(/No email went out/i);
    expect(visibleText(container)).not.toMatch(/\/join\//);
  });

  it("offers a copy-link on a row that carries a token, and none on one that does not", async () => {
    list.mockResolvedValue([
      invite({ id: "a", name: "Has token", token: "abc" }),
      invite({ id: "b", name: "No token", token: null }),
    ]);

    render(<InvitationsView />);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Resend" })).toHaveLength(2),
    );
    // `token` is nullable in the contract and only promised on create, so the
    // affordance appears exactly where a link can actually be built.
    expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(1);
  });
  it("does not claim delivery when the response carried no status at all", async () => {
    /*
     * `deliveryStatus` is nullable in the contract and `client.ts` casts the
     * JSON unchecked, so an omitted key arrives as null or undefined. The check
     * was `needsManualDelivery(...)`, which treats "not known to be manual" as
     * emailed - so this said "Invite resent to <email>" over a response that
     * established nothing.
     */
    list.mockResolvedValue([invite()]);
    resend.mockResolvedValue(refreshed(null));

    const { container } = render(<InvitationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't confirm an email/i),
    );
    expect(visibleText(container)).not.toMatch(/Invite resent to/);
    expect(visibleText(container)).toMatch(/\/join\/tok1/);
  });

  it("does not send them back to the button they just pressed", async () => {
    // The handout's default hint is "Resend from the invitations list to get
    // one" - correct for the bulk-import caller, circular here.
    list.mockResolvedValue([invite()]);
    resend.mockResolvedValue(refreshed("email_not_configured", null));

    const { container } = render(<InvitationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/no link came back/i),
    );
    expect(visibleText(container)).not.toMatch(/Resend from the invitations list/i);
    expect(visibleText(container)).toMatch(/Revoke and invite them again/i);
    // And it must not point at a link that is not there.
    expect(visibleText(container)).not.toMatch(/this link is the only way in/i);
    expect(visibleText(container)).not.toMatch(/link is in the row below/i);
  });
});
