import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * D19 confirms a resend with a line under that row - "Invite resent to
 * n.obi@…" - which stays. It was a three-second toast at the foot of the
 * screen, so an admin working down a list of pending invites could not see
 * which ones they had already done.
 */

const list = vi.fn();
const resend = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: { ...actual.invitesApi, list: () => list(), resend: (id: string) => resend(id) },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (name: string, over: Partial<Invitation> = {}): Invitation => ({
  id: name,
  token: `tok-${name}`,
  role: "teacher",
  email: `${name.split(" ")[0].toLowerCase()}@school.edu.ng`,
  name,
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z",
  consentStatus: null,
  deliveryStatus: "sent",
  ...over,
});

// The first match is the row's own name; a link handout below it repeats it.
const row = (name: string) => screen.getAllByText(name)[0].closest("div.px-6") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([invite("Amaka Obi"), invite("Bayo Ade")]);
});

describe("a confirmed resend", () => {
  it("is said in that row, and stays", async () => {
    resend.mockImplementation(async (id: string) => invite(id));
    render(<InvitationsView />);
    await screen.findByText("Bayo Ade");

    fireEvent.click(within(row("Amaka Obi")).getByRole("button", { name: "Resend" }));
    await waitFor(() =>
      expect(within(row("Amaka Obi")).getByText("Invite resent to amaka@school.edu.ng")).toBeInTheDocument(),
    );
    // In that row only.
    expect(within(row("Bayo Ade")).queryByText(/Invite resent/)).toBeNull();

    // Still there after the toast's three seconds would have gone.
    await new Promise((r) => setTimeout(r, 3200));
    expect(within(row("Amaka Obi")).getByText("Invite resent to amaka@school.edu.ng")).toBeInTheDocument();
  }, 10_000);

  /*
   * SCRUM-212. What `resend_invite` actually returns: the new token, expiry
   * and delivery, with role, name, email and status null. The row used to be
   * swapped for this, lost its role, fell out of the teachers-only list, and a
   * list of one read "No invites yet".
   */
  const backendAnswer = (id: string, over: Partial<Invitation> = {}) =>
    ({
      id,
      token: `new-${id}`,
      role: null,
      email: null,
      name: null,
      status: null,
      classId: null,
      createdAt: "2026-10-20T09:00:00Z",
      expiresAt: "2099-02-01T00:00:00Z",
      consentStatus: null,
      deliveryStatus: "sent",
      ...over,
    }) as unknown as Invitation;

  it("keeps the row when the answer carries only what the backend sends", async () => {
    list.mockResolvedValue([invite("Amaka Obi")]);
    resend.mockImplementation(async (id: string) => backendAnswer(id));
    render(<InvitationsView />);
    await screen.findByText("Amaka Obi");

    fireEvent.click(within(row("Amaka Obi")).getByRole("button", { name: "Resend" }));
    await waitFor(() =>
      expect(within(row("Amaka Obi")).getByText("Invite resent to amaka@school.edu.ng")).toBeInTheDocument(),
    );
    expect(screen.queryByText("No invites yet")).toBeNull();
  });

  it("never reads an old 'sent' off the row as news about this resend", async () => {
    resend.mockImplementation(async (id: string) => backendAnswer(id, { deliveryStatus: null }));
    render(<InvitationsView />);
    await screen.findByText("Bayo Ade");

    fireEvent.click(within(row("Amaka Obi")).getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(resend).toHaveBeenCalled());
    // The row still stands, and nothing claims an email went.
    await screen.findAllByText("Amaka Obi");
    expect(screen.queryByText(/Invite resent/)).toBeNull();
  });

  it("is never claimed for a resend nobody was emailed about", async () => {
    resend.mockImplementation(async (id: string) =>
      invite(id, { deliveryStatus: "email_not_configured" }),
    );
    render(<InvitationsView />);
    await screen.findByText("Bayo Ade");

    fireEvent.click(within(row("Amaka Obi")).getByRole("button", { name: "Resend" }));
    await waitFor(() =>
      expect(within(row("Amaka Obi")).getByText(/No email was sent to Amaka Obi/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Invite resent/)).toBeNull();
  });
});
