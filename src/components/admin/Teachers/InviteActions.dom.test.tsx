import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { withGate } from "@/test/setupGate";
import type { Invitation } from "@/lib/api/invites";
import type { TeacherDetail } from "@/lib/api/teachers";
import { InviteActions } from "./InviteActions";

/**
 * BACKLOG 82 (SCRUM-40): an invited teacher's own page resends and revokes
 * their invitation, with D19's calls, words and refusals - it used to send the
 * admin away to Invitations for either.
 */

const invitesList = vi.fn();
const resend = vi.fn();
const revoke = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: {
      ...actual.invitesApi,
      list: () => invitesList(),
      resend: (id: string) => resend(id),
      revoke: (id: string) => revoke(id),
    },
  };
});

const TEACHER = {
  id: "t2",
  name: "Tunde Bello",
  email: "T@School.edu.ng",
  status: "invited",
  classIds: [],
} as unknown as TeacherDetail;
const HERE = { href: "/admin/teachers/t2", label: "Tunde Bello" };

const invite = (over: Partial<Invitation> = {}): Invitation =>
  ({
    id: "inv-bello",
    token: "tok-bello",
    role: "teacher",
    email: "t@school.edu.ng",
    name: "Tunde Bello",
    status: "pending",
    expiresAt: "2099-01-01T00:00:00Z",
    deliveryStatus: "sent",
    consentStatus: null,
    ...over,
  }) as Invitation;

const show = () => render(withGate(<InviteActions teacher={TEACHER} here={HERE} />, null));

beforeEach(() => {
  vi.clearAllMocks();
  invitesList.mockResolvedValue([invite()]);
  resend.mockResolvedValue(invite());
  revoke.mockResolvedValue(undefined);
});

describe("an invited teacher's page", () => {
  it("offers Resend and Revoke on a live invitation, and no way off to Invitations", async () => {
    show();

    expect(await screen.findByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage the invitation" })).toBeNull();
  });

  it("resends it, and says so in D19's words", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Invite resent to t@school.edu.ng"),
    );
    expect(resend).toHaveBeenCalledWith("inv-bello");
  });

  it("never says resent when no email went out", async () => {
    resend.mockResolvedValue(invite({ deliveryStatus: "email_not_configured" }));
    const { container } = show();
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    await waitFor(() => expect(resend).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).not.toMatch(/Invite resent/));
  });

  it("asks before revoking, in D19's words, then says the link no longer works", async () => {
    const { container } = show();
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));

    expect(visibleText(container)).toMatch(/Revoke this invite\?/);
    expect(visibleText(container)).toMatch(
      /Tunde Bello\s?.s link will stop working immediately, and any classes assigned to them come off too\./,
    );
    expect(revoke).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole("button", { name: "Revoke" });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(visibleText(container)).toMatch(/Tunde Bello.s link no longer works/));
    expect(revoke).toHaveBeenCalledWith("inv-bello");
    expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
  });

  it("keeps the invite when Keep is chosen", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(screen.queryByText(/Revoke this invite\?/)).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("offers only Resend on an expired one, as D19 does", async () => {
    invitesList.mockResolvedValue([invite({ expiresAt: "2020-01-01T00:00:00Z" })]);
    show();

    expect(await screen.findByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("says a failed resend in D19's words, with the way to try again", async () => {
    resend.mockRejectedValue(new Error("down"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Resend" }));

    expect(
      await screen.findByText("That didn't resend. We're on it - try again in a moment."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend" })).not.toBeDisabled();
  });

  it("keeps the way to Invitations, with Back to this page, when no invitation is found", async () => {
    invitesList.mockResolvedValue([invite({ email: "someone@else.ng" })]);
    show();

    const link = await screen.findByRole("link", { name: "Manage the invitation" });
    expect(link.getAttribute("href")).toBe(
      "/admin/invitations?back=%2Fadmin%2Fteachers%2Ft2&backLabel=Tunde%20Bello",
    );
    expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
  });

  it("keeps the same way when the invitations cannot be read", async () => {
    invitesList.mockRejectedValue(new Error("down"));
    show();

    expect(await screen.findByRole("link", { name: "Manage the invitation" })).toBeInTheDocument();
  });

  it("pauses both while setup is unfinished, as D19 does", async () => {
    render(withGate(<InviteActions teacher={TEACHER} here={HERE} />, "email_unconfirmed"));

    expect(await screen.findByRole("button", { name: "Resend" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
  });
});
