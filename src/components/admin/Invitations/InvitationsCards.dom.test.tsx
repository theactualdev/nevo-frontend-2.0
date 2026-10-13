import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * Cards at tablet width, ruled by Lydia on 7 Oct: "A table at tablet width is
 * a row of truncated columns." jsdom applies no media queries, so this checks
 * the structure the breakpoint switches between: the column headings exist
 * only for the table, the email has a full line of its own on a card, and
 * nothing on a card is cut to an ellipsis.
 */

const list = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => list() } };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (over: Partial<Invitation> = {}): Invitation => ({
  id: "i1",
  token: null,
  role: "teacher",
  email: "n.obi@brightgate.edu.ng",
  name: "Dr. N. Obi",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z",
  consentStatus: null,
  deliveryStatus: "sent",
  ...over,
});

describe("an invitation below 1024px", () => {
  it("has no column headings - those belong to the table", async () => {
    list.mockResolvedValue([invite()]);
    render(<InvitationsView />);
    await screen.findByText("Dr. N. Obi");
    const heading = screen.getByText("Actions").parentElement as HTMLElement;
    expect(heading.className).toMatch(/max-lg:hidden/);
  });

  it("puts the email on its own line under the name, and keeps the table's column for wide screens", async () => {
    list.mockResolvedValue([invite()]);
    render(<InvitationsView />);
    const [card, column] = await screen.findAllByText("n.obi@brightgate.edu.ng");
    expect(card.className).toMatch(/lg:hidden/);
    expect(column.className).toMatch(/max-lg:hidden/);
  });

  it("does not truncate the name on a card", async () => {
    list.mockResolvedValue([invite({ name: "Mrs. Oluwaseun Adeyemi-Bankole" })]);
    render(<InvitationsView />);
    const name = await screen.findByText("Mrs. Oluwaseun Adeyemi-Bankole");
    expect(name.className).toMatch(/max-lg:whitespace-normal/);
  });

  it("gives an email-only invite no second email line", async () => {
    list.mockResolvedValue([invite({ name: null })]);
    render(<InvitationsView />);
    // The email is the name line and the table's column - not a third time.
    expect(await screen.findAllByText("n.obi@brightgate.edu.ng")).toHaveLength(2);
  });
});
