import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { setSession } from "@/lib/auth/session";
import type { TeamMember } from "@/lib/api/team";
import { AdminTeamView } from "./AdminTeamView";
import { ScopeChecklist } from "./EditAccess";

/**
 * SCRUM-39 D3 "Editing an admin": "Same sheet, pre-filled, titled to the
 * person. Removing the last scope is blocked with a plain line, not a modal:
 * 'An admin needs at least one area.'" `PUT .../scopes` was deployed with no
 * caller, so access set at invite could never change.
 */

const list = vi.fn();
const updateScopes = vi.fn();

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: {
      ...actual.teamApi,
      list: async () => actual.toAdminTeam(await list()),
      updateScopes: (id: string, s: unknown) => updateScopes(id, s),
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: async () => ({ name: "Brightgate", profile: { onboarding: { band: "boutique" } } }),
    },
  };
});

const member = (id: string, first: string, scopes: TeamMember["scopes"]): TeamMember => ({
  userId: id,
  adminId: `a-${id}`,
  email: `${first.toLowerCase()}@school.edu.ng`,
  firstName: first,
  lastName: "Adebayo",
  role: "admin",
  status: "active",
  scopes,
});

const ME = member("u-me", "Folake", ["oversight"]);
const BUKOLA = member("u-2", "Bukola", ["billing", "roster"]);

beforeEach(() => {
  vi.clearAllMocks();
  setSession({
    token: "t",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "u-me",
    role: "admin",
  });
  list.mockResolvedValue([ME, BUKOLA]);
  updateScopes.mockResolvedValue(BUKOLA);
});

const openBukola = async () => {
  const row = (await screen.findByText("Bukola Adebayo")).closest("div.flex") as HTMLElement;
  fireEvent.click(within(row.parentElement as HTMLElement).getByRole("button", { name: "Edit access" }));
  return screen.getByRole("dialog", { name: "Bukola Adebayo's access" });
};

describe("editing an admin's access", () => {
  it("opens the same sheet, pre-filled and titled to the person", async () => {
    render(<AdminTeamView />);
    const sheet = await openBukola();

    const billing = within(sheet).getByRole("checkbox", { name: /Billing/ });
    const roster = within(sheet).getByRole("checkbox", { name: /Roster/ });
    const oversight = within(sheet).getByRole("checkbox", { name: /General Oversight/ });
    expect(billing).toBeChecked();
    expect(roster).toBeChecked();
    expect(oversight).not.toBeChecked();
  });

  it("will not leave an admin with no area, and says so plainly", async () => {
    render(<AdminTeamView />);
    const sheet = await openBukola();

    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Billing/ }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Roster/ }));

    expect(within(sheet).getByText("An admin needs at least one area.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Save access" })).toBeDisabled();
  });

  it("saves the new areas and re-reads the team", async () => {
    render(<AdminTeamView />);
    const sheet = await openBukola();

    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Roster/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save access" }));

    await waitFor(() => expect(updateScopes).toHaveBeenCalledWith("u-2", ["billing"]));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("offers no edit on your own row", async () => {
    render(<AdminTeamView />);
    await screen.findByText("Bukola Adebayo");
    const buttons = screen.getAllByRole("button", { name: "Edit access" });
    expect(buttons).toHaveLength(1);
  });
});

describe("the Curriculum scope, no longer granted (Lydia, 7 Oct)", () => {
  it("is not offered when inviting someone new", () => {
    render(<ScopeChecklist on={new Set(["oversight", "roster"])} setOn={() => {}} disabled={false} />);
    expect(screen.queryByRole("checkbox", { name: /Curriculum/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /SENCo/ })).toBeInTheDocument();
  });

  it("is not offered to an admin who does not hold it", async () => {
    render(<AdminTeamView />);
    const sheet = await openBukola();
    expect(within(sheet).queryByRole("checkbox", { name: /Curriculum/ })).toBeNull();
  });

  it("shows to an admin who holds it, so it can be taken away - and stays put once unticked", async () => {
    list.mockResolvedValue([ME, member("u-2", "Bukola", ["roster", "curriculum"])]);
    render(<AdminTeamView />);
    const sheet = await openBukola();
    const curriculum = within(sheet).getByRole("checkbox", { name: /Curriculum/ });
    expect(curriculum).toBeChecked();
    fireEvent.click(curriculum);
    expect(within(sheet).getByRole("checkbox", { name: /Curriculum/ })).not.toBeChecked();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(updateScopes).toHaveBeenCalledWith("u-2", ["roster"]));
  });
});
