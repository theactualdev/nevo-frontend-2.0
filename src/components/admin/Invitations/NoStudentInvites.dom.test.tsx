import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * Lydia's L2, 14 Oct: children do not get invitations, links or emails, and
 * the student invite path is removed rather than left unreachable - "A route
 * that cannot be used is a route somebody will try to use." The backend's
 * `InvitableRole` is `teacher` only (SCRUM-215).
 *
 * So no Students tab, no older student invitation in the list, no student
 * fields in the New invite form - and one quiet line pointing at Students,
 * where a child is actually added.
 */

const list = vi.fn<() => Promise<Invitation[]>>();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => list() } };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (over: Partial<Invitation> = {}): Invitation => ({
  id: Math.random().toString(36).slice(2),
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

describe("the Invitations screen, now that children are not invited", () => {
  it("has no Students tab, hides older student invitations, points to Students, and asks no date of birth", async () => {
    list.mockResolvedValue([
      invite({ name: "Folake Adeyemi" }),
      // An older invitation to a child, still returned by the list.
      invite({ role: "student", name: "Amara Okafor", email: null, consentStatus: "withdrawn" }),
    ]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Folake Adeyemi/));

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Students" })).toBeNull();
    expect(visibleText(container)).not.toMatch(/Amara Okafor/);

    expect(visibleText(container)).toMatch(/Children aren't sent invitations/);
    expect(screen.getByRole("link", { name: "Students" })).toHaveAttribute(
      "href",
      "/admin/students",
    );

    fireEvent.click(screen.getByRole("button", { name: /New invite/ }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a teacher" });
    expect(within(dialog).queryByLabelText(/date of birth/i)).toBeNull();
    expect(visibleText(dialog)).not.toMatch(/date of birth|under 18|parent/i);
  });
});
