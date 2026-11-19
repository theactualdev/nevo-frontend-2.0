import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { setSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
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

describe("the founder's General Oversight (8 Oct)", () => {
  it("stays ticked and cannot be changed, and the sheet says why", async () => {
    list.mockResolvedValue([ME, member("u-2", "Bukola", ["oversight", "billing"])].map((m) =>
      m.userId === "u-2" ? { ...m, founding: true } : m,
    ));
    render(<AdminTeamView />);
    const sheet = await openBukola();
    const oversight = within(sheet).getByRole("checkbox", { name: /General Oversight/ });
    expect(oversight).toBeChecked();
    expect(oversight).toBeDisabled();
    expect(within(sheet).getByText(/so the school can never lock itself out/)).toBeInTheDocument();
  });
});

/**
 * BACKLOG 87: a save the server refuses for good - the last General Oversight
 * admin, a Learning Support grant still active, any 409 - is said in the
 * server's words, and never with "try again", which would not change it.
 */
describe("a save the server refuses", () => {
  const untickRoster = async () => {
    render(<AdminTeamView />);
    const sheet = await openBukola();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Roster/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save access" }));
    return sheet;
  };

  it("says the server's own refusal, and no try again", async () => {
    updateScopes.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: { code: "last_oversight_admin", message: "Someone has to keep General Oversight." },
      }),
    );
    const sheet = await untickRoster();

    expect(
      await within(sheet).findByText("Someone has to keep General Oversight."),
    ).toBeInTheDocument();
    // No retry in what the save says (the holders read keeps its own).
    expect(within(sheet).queryByText(/try again in a moment/i)).toBeNull();
  });

  it("says it did not save, without try again, when a refusal carries no words", async () => {
    updateScopes.mockRejectedValue(new ApiError(409, "Conflict", {}));
    const sheet = await untickRoster();

    expect(
      await within(sheet).findByText(/That didn.t save, and nothing changed\. The areas you chose are still here\.$/),
    ).toBeInTheDocument();
    // No retry in what the save says (the holders read keeps its own).
    expect(within(sheet).queryByText(/try again in a moment/i)).toBeNull();
  });

  it("still offers try again for a save that merely failed", async () => {
    updateScopes.mockRejectedValue(new ApiError(500, "Server", {}));
    const sheet = await untickRoster();

    expect(await within(sheet).findByText(/try again in a moment/)).toBeInTheDocument();
  });
});
