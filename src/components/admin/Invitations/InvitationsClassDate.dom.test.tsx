import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * D19's Class and Invited columns, from `classId` and `createdAt` (9 Oct), and
 * the Students tab now that a child is never sent an invitation.
 */

const list = vi.fn<() => Promise<Invitation[]>>();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => list() } };
});
vi.mock("@/lib/api/classes", () => ({
  classesApi: {
    list: async () => [
      { id: "c-2a", name: "JSS 2A" },
      { id: "c-3b", name: "JSS 3B" },
    ],
  },
}));

const invite = (over: Partial<Invitation> = {}): Invitation => ({
  id: Math.random().toString(36).slice(2),
  token: null,
  role: "teacher",
  email: "teacher@school.edu.ng",
  name: "Folake Adeyemi",
  status: "pending",
  classId: null,
  createdAt: null,
  expiresAt: "2099-01-01T00:00:00Z",
  consentStatus: null,
  deliveryStatus: "sent",
  ...over,
});

beforeEach(() => {
  list.mockReset();
});

describe("D19's Class and Invited columns", () => {
  it("shows the class an invite was sent for and the day it went", async () => {
    list.mockResolvedValue([
      invite({ name: "Folake Adeyemi", classId: "c-2a", createdAt: "2026-07-08T09:00:00Z" }),
    ]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Folake Adeyemi/));
    const text = visibleText(container);
    expect(text).toMatch(/JSS 2A/);
    expect(text).toMatch(/8 Jul/);
  });

  it("shows a dash, not a guess, when either is missing", async () => {
    list.mockResolvedValue([invite({ name: "No class yet", classId: null, createdAt: null })]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No class yet/));
    expect(visibleText(container)).not.toMatch(/Invited \d/);
  });

  it("filters by class", async () => {
    list.mockResolvedValue([
      invite({ name: "In 2A", classId: "c-2a" }),
      invite({ name: "In 3B", classId: "c-3b" }),
    ]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/In 3B/));
    fireEvent.change(screen.getByLabelText("Filter by class"), { target: { value: "c-2a" } });
    await waitFor(() => expect(visibleText(container)).not.toMatch(/In 3B/));
    expect(visibleText(container)).toMatch(/In 2A/);
  });
});

describe("the Students tab, now that children are not invited", () => {
  async function openStudents() {
    const tab = await screen.findByRole("tab", { name: "Students" });
    fireEvent.click(tab);
  }

  it("sends the admin to Students instead of offering an invite that would be refused", async () => {
    list.mockResolvedValue([]);
    const { container } = render(<InvitationsView />);
    await openStudents();
    await waitFor(() => expect(visibleText(container)).toMatch(/Children aren.t sent invitations/));
    expect(screen.getByRole("link", { name: "Go to Students" })).toHaveAttribute("href", "/admin/students");
    expect(screen.queryByRole("button", { name: /New invite/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Bulk import/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send first invite" })).toBeNull();
  });

  it("still lists invitations sent to students earlier", async () => {
    list.mockResolvedValue([invite({ role: "student", name: "Amara Okafor" })]);
    const { container } = render(<InvitationsView />);
    await openStudents();
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).toMatch(/Invitations sent to students earlier are listed below/);
  });

  it("keeps inviting teachers on the Teachers tab", async () => {
    list.mockResolvedValue([]);
    render(<InvitationsView />);
    expect(await screen.findByRole("button", { name: /New invite/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bulk import/ })).toBeInTheDocument();
  });
});
