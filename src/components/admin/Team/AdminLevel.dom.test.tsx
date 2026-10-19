import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { setSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/team";
import { AdminTeamView } from "./AdminTeamView";

/**
 * D03b's administrator level line (design fc0b7ae; Lydia's P2, 14 Oct): on a
 * person's record beside Learning Support. A senior administrator changes
 * someone else's; nobody changes their own; the last senior is met calmly.
 */

const list = vi.fn();
const promoteSenior = vi.fn();
const demoteStandard = vi.fn();

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: {
      ...actual.teamApi,
      list: async () => actual.toAdminTeam(await list()),
      promoteSenior: (id: string) => promoteSenior(id),
      demoteStandard: (id: string) => demoteStandard(id),
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

const member = (
  id: string,
  first: string,
  accessLevel: TeamMember["accessLevel"],
  over: Partial<TeamMember> = {},
): TeamMember => ({
  userId: id,
  adminId: `a-${id}`,
  email: `${first.toLowerCase()}@school.edu.ng`,
  firstName: first,
  lastName: "Adebayo",
  role: "admin",
  status: "active",
  scopes: ["roster"],
  accessLevel,
  ...over,
});

const ME_SENIOR = member("u-me", "Folake", "senior", { scopes: ["oversight"], founding: true });
const ME_STANDARD = member("u-me", "Folake", "standard", { scopes: ["oversight"] });
const BUKOLA = member("u-2", "Bukola", "standard");
const GRACE = member("u-3", "Grace", "senior");

beforeEach(() => {
  vi.clearAllMocks();
  setSession({
    token: "t",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "u-me",
    role: "admin",
  });
  list.mockResolvedValue([ME_SENIOR, BUKOLA, GRACE]);
  promoteSenior.mockImplementation(async (id: string) => ({ ...BUKOLA, userId: id, accessLevel: "senior" }));
  demoteStandard.mockImplementation(async (id: string) => ({ ...GRACE, userId: id, accessLevel: "standard" }));
});

const open = async (name: string) => {
  const row = (await screen.findByText(`${name} Adebayo`)).closest("div.flex") as HTMLElement;
  fireEvent.click(within(row.parentElement as HTMLElement).getByRole("button", { name: "Edit access" }));
  return screen.getByRole("dialog", { name: `${name} Adebayo's access` });
};

describe("on someone else's record", () => {
  it("says Standard, and offers a senior viewer Make senior", async () => {
    render(<AdminTeamView />);
    const sheet = await open("Bukola");

    expect(within(sheet).getByText("Administrator level")).toBeInTheDocument();
    expect(within(sheet).getByText("Standard")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Make Bukola Adebayo senior" }));

    await waitFor(() => expect(promoteSenior).toHaveBeenCalledWith("u-2"));
    expect(await within(sheet).findByText("Senior")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Return Bukola Adebayo to standard" })).toBeInTheDocument();
    // The list re-reads, so the row is the server's.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("returns a senior to standard", async () => {
    render(<AdminTeamView />);
    const sheet = await open("Grace");

    fireEvent.click(within(sheet).getByRole("button", { name: "Return Grace Adebayo to standard" }));
    await waitFor(() => expect(demoteStandard).toHaveBeenCalledWith("u-3"));
    expect(await within(sheet).findByText("Standard")).toBeInTheDocument();
  });

  it("meets the last senior calmly, and changes nothing", async () => {
    demoteStandard.mockRejectedValue(
      new ApiError(409, "Conflict", { detail: { code: "last_senior_admin", message: "last" } }),
    );
    render(<AdminTeamView />);
    const sheet = await open("Grace");

    fireEvent.click(within(sheet).getByRole("button", { name: "Return Grace Adebayo to standard" }));
    const dialog = await screen.findByRole("dialog", { name: "Someone needs to be a senior administrator" });
    expect(dialog).toHaveTextContent(
      "Grace Adebayo is the only senior administrator at your school right now. Make someone else senior first, then you can change this.",
    );
    expect(within(sheet).getByText("Senior")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Someone needs to be a senior administrator" })).not.toBeInTheDocument();
  });

  it("offers a standard viewer the level and nothing to press", async () => {
    list.mockResolvedValue([ME_STANDARD, BUKOLA, GRACE]);
    render(<AdminTeamView />);
    const sheet = await open("Grace");

    expect(within(sheet).getByText("Senior")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /to standard|senior$/ })).not.toBeInTheDocument();
  });

  it("offers no change on a removed admin's record - there is no sheet to open", async () => {
    list.mockResolvedValue([ME_SENIOR, member("u-2", "Bukola", "standard", { status: "deactivated" }), GRACE]);
    render(<AdminTeamView />);
    const row = (await screen.findByText("Bukola Adebayo")).closest("div.flex") as HTMLElement;
    expect(within(row.parentElement as HTMLElement).queryByRole("button", { name: "Edit access" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make Bukola Adebayo senior" })).not.toBeInTheDocument();
  });

  it("draws no level at all when the team read carries none", async () => {
    list.mockResolvedValue([
      { ...ME_SENIOR, accessLevel: undefined },
      { ...BUKOLA, accessLevel: undefined },
    ]);
    render(<AdminTeamView />);
    const sheet = await open("Bukola");
    expect(within(sheet).queryByText("Administrator level")).not.toBeInTheDocument();
  });
});

describe("on your own row", () => {
  it("is status only, senior", async () => {
    render(<AdminTeamView />);
    await screen.findByText("Bukola Adebayo");

    expect(screen.getByText("Another senior administrator manages this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Folake Adebayo/ })).not.toBeInTheDocument();
  });

  it("is status only, standard", async () => {
    list.mockResolvedValue([ME_STANDARD, BUKOLA]);
    render(<AdminTeamView />);
    await screen.findByText("Bukola Adebayo");

    expect(screen.getByText("A senior administrator can make you senior.")).toBeInTheDocument();
  });
});
