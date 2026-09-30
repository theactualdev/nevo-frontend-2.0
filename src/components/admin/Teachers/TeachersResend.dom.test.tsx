import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { withGate } from "@/test/setupGate";
import type { Invitation } from "@/lib/api/invites";
import { TeachersView } from "./TeachersView";

/**
 * D6 draws "Resend invite" on an Invited row and a toast, "Invite resent to
 * <email>". The list had neither - the only way to resend was to leave for
 * Invitations and find them again. And the one thing the toast must never do
 * is claim a send the backend did not confirm.
 */

const invitesList = vi.fn();
const resend = vi.fn();

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      list: async () => [
        { id: "t1", name: "Folake Adeyemi", email: "f@school.edu.ng", status: "active" },
        { id: "t2", name: "Tunde Bello", email: "T@School.edu.ng", status: "invited" },
      ],
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, teacherClasses: async () => [] } };
});
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: {
      ...actual.invitesApi,
      list: () => invitesList(),
      resend: (id: string) => resend(id),
    },
  };
});

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

const resendButton = () => screen.findByRole("button", { name: "Resend Tunde Bello's invite" });

beforeEach(() => {
  vi.clearAllMocks();
  invitesList.mockResolvedValue([invite()]);
  resend.mockResolvedValue(invite());
});

describe("resending from the Teachers list", () => {
  it("offers Resend on the invited row only, and the row still opens the teacher", async () => {
    render(<TeachersView />);
    await resendButton();
    expect(screen.getAllByRole("button", { name: /invite/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Tunde Bello" }).getAttribute("href")).toBe(
      "/admin/teachers/t2",
    );
  });

  it("resends that teacher's invitation and says so, as D6 does", async () => {
    const { container } = render(<TeachersView />);
    fireEvent.click(await resendButton());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Invite resent to t@school.edu.ng"));
    expect(resend).toHaveBeenCalledWith("inv-bello");
    expect(screen.getByRole("button", { name: "Tunde Bello's invite resent" })).toBeDisabled();
    expect(visibleText(container)).not.toMatch(/No email/);
  });

  it("never says resent when no email went out, and hands over the link instead", async () => {
    resend.mockResolvedValue(invite({ deliveryStatus: "email_not_configured" }));
    const { container } = render(<TeachersView />);
    fireEvent.click(await resendButton());

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "No email went out - their link is in the row below",
      ),
    );
    expect(visibleText(container)).toMatch(
      /No email was sent to Tunde Bello - this school has no mail set up in Nevo/,
    );
    expect(visibleText(container)).not.toMatch(/Invite resent/);
    // Back to a button they can press again.
    expect(screen.getByRole("button", { name: "Resend Tunde Bello's invite" })).not.toBeDisabled();
  });

  it("says a failed resend failed, and lets them try again", async () => {
    resend.mockRejectedValueOnce(new Error("500"));
    render(<TeachersView />);
    fireEvent.click(await resendButton());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/didn.t resend/));
    expect(screen.getByRole("button", { name: "Resend Tunde Bello's invite" })).not.toBeDisabled();
  });

  it("offers no Resend when the invitation can't be found or read", async () => {
    invitesList.mockResolvedValue([invite({ status: "accepted" })]);
    const first = render(<TeachersView />);
    await screen.findByRole("link", { name: "Tunde Bello" });
    await waitFor(() => expect(invitesList).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /invite/ })).toBeNull();
    first.unmount();

    invitesList.mockRejectedValue(new Error("403"));
    render(<TeachersView />);
    await screen.findByRole("link", { name: "Tunde Bello" });
    await waitFor(() => expect(invitesList).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /invite/ })).toBeNull();
  });

  it("pauses while setup is unfinished", async () => {
    render(withGate(<TeachersView />, "email_unconfirmed"));
    expect(await resendButton()).toBeDisabled();
  });
});
