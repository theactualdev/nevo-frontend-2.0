import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { setSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/team";
import { AdminTeamView } from "./AdminTeamView";
import { activeLine } from "./teamLines";

/**
 * Removing an admin's access, which no route allowed until 8 Oct - a school
 * could not take access away from an admin who had left. SCRUM-39: "Calm
 * confirm card. Language is about access ending, not the person." The server
 * refuses yourself, the last Oversight admin, an SSO-managed team and a
 * restore past the seats, each in its own words.
 *
 * And the two fields that arrived with it: the founder's flag (D03's
 * "Founding" badge and the locked Oversight) and last-active, in SCRUM-39's
 * neutral words.
 */

const list = vi.fn();
const deactivate = vi.fn();
const restore = vi.fn();

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: {
      ...actual.teamApi,
      list: async () => actual.toAdminTeam(await list()),
      deactivate: (id: string) => deactivate(id),
      restore: (id: string) => restore(id),
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: async () => ({ name: "Brightgate" }) } };
});

const member = (id: string, first: string, over: Partial<TeamMember> = {}): TeamMember => ({
  userId: id,
  adminId: `a-${id}`,
  email: `${first.toLowerCase()}@school.edu.ng`,
  firstName: first,
  lastName: "Adebayo",
  role: "other_admin",
  status: "active",
  scopes: ["roster"],
  ...over,
});

const FOUNDER = member("u-me", "Folake", { founding: true, scopes: ["oversight", "roster"] });
const BUKOLA = member("u-2", "Bukola");

const team = (members: TeamMember[]) => ({
  members,
  seatLimit: 5,
  seatsUsed: members.filter((m) => m.status !== "deactivated").length,
  seatsRemaining: 5 - members.filter((m) => m.status !== "deactivated").length,
});

beforeEach(() => {
  vi.clearAllMocks();
  setSession({
    token: "t",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "u-me",
    role: "admin",
  });
  list.mockResolvedValue(team([FOUNDER, BUKOLA]));
  deactivate.mockResolvedValue({ ...BUKOLA, status: "deactivated" });
  restore.mockResolvedValue(BUKOLA);
});

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest("div.flex")!.parentElement as HTMLElement;

describe("removing an admin's access", () => {
  it("confirms in SCRUM-39's terms - access ending, not the person - and removes on confirm", async () => {
    render(<AdminTeamView />);
    const row = await rowOf("Bukola Adebayo");
    fireEvent.click(within(row).getByRole("button", { name: "Remove access" }));

    expect(visibleText(row)).toMatch(
      /Bukola Adebayo will no longer be able to open the admin areas\. Their account stays, and nothing they set up is lost\./,
    );
    const confirm = within(row).getAllByRole("button", { name: "Remove access" }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(deactivate).toHaveBeenCalledWith("u-2"));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("removes nothing on Keep", async () => {
    render(<AdminTeamView />);
    const row = await rowOf("Bukola Adebayo");
    fireEvent.click(within(row).getByRole("button", { name: "Remove access" }));
    fireEvent.click(within(row).getByRole("button", { name: "Keep" }));
    expect(deactivate).not.toHaveBeenCalled();
    expect(visibleText(row)).not.toMatch(/will no longer be able/);
  });

  it("is never offered on your own row or the founder's", async () => {
    render(<AdminTeamView />);
    const row = await rowOf("Folake Adebayo");
    expect(within(row).queryByRole("button", { name: "Remove access" })).toBeNull();
  });

  it("is never offered on the founder's row, even to another admin", async () => {
    list.mockResolvedValue(
      team([
        member("u-me", "Bukola"),
        member("u-f", "Ada", { founding: true, scopes: ["oversight"] }),
      ]),
    );
    render(<AdminTeamView />);
    const row = await rowOf("Ada Adebayo");
    expect(within(row).getByRole("button", { name: "Edit access" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Remove access" })).toBeNull();
  });

  it("shows the server's refusal in its own words", async () => {
    deactivate.mockRejectedValue(
      new ApiError(409, "conflict", {
        detail: { code: "last_oversight_admin", message: "Someone has to keep General Oversight." },
      }),
    );
    render(<AdminTeamView />);
    const row = await rowOf("Bukola Adebayo");
    fireEvent.click(within(row).getByRole("button", { name: "Remove access" }));
    fireEvent.click(within(row).getAllByRole("button", { name: "Remove access" }).at(-1)!);
    await waitFor(() =>
      expect(visibleText(row)).toMatch(/Someone has to keep General Oversight\./),
    );
  });
});

describe("restoring a removed admin", () => {
  it("offers Restore access on a deactivated row, and restores", async () => {
    list.mockResolvedValue(team([FOUNDER, { ...BUKOLA, status: "deactivated" }]));
    render(<AdminTeamView />);
    const row = await rowOf("Bukola Adebayo");
    expect(within(row).queryByRole("button", { name: "Remove access" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Restore access" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith("u-2"));
  });

  it("says why when the seats are full", async () => {
    list.mockResolvedValue(team([FOUNDER, { ...BUKOLA, status: "deactivated" }]));
    restore.mockRejectedValue(
      new ApiError(409, "conflict", {
        detail: { code: "admin_seat_limit_reached", message: "All five admin accounts are in use." },
      }),
    );
    render(<AdminTeamView />);
    const row = await rowOf("Bukola Adebayo");
    fireEvent.click(within(row).getByRole("button", { name: "Restore access" }));
    await waitFor(() => expect(visibleText(row)).toMatch(/All five admin accounts are in use\./));
  });
});

describe("the founder and last-active (8 Oct)", () => {
  it("badges the founder and locks their Oversight, with D03's reason", async () => {
    render(<AdminTeamView />);
    const row = await rowOf("Folake Adebayo");
    expect(visibleText(row)).toMatch(/Founding/);
    expect(visibleText(row)).toMatch(/General Oversight \(locked\)/);
    expect(visibleText(row)).toMatch(/so the school can never lock itself out/);
  });

  it("says when each admin was last seen, neutrally", () => {
    const now = new Date(2026, 9, 10, 15, 0).getTime();
    expect(activeLine(new Date(2026, 9, 10, 9, 0).toISOString(), now)).toBe("Active today");
    expect(activeLine(new Date(2026, 9, 9, 23, 50).toISOString(), now)).toBe("Active yesterday");
    expect(activeLine(new Date(2026, 9, 8, 12, 0).toISOString(), now)).toBe("2 days ago");
    expect(activeLine(null, now)).toBeNull();
    expect(activeLine("not a date", now)).toBeNull();
  });

  it("shows the line on an active row", async () => {
    list.mockResolvedValue(team([FOUNDER, { ...BUKOLA, lastActiveAt: new Date().toISOString() }]));
    render(<AdminTeamView />);
    const row = await rowOf("Bukola Adebayo");
    expect(visibleText(row)).toMatch(/Active today/);
  });
});
