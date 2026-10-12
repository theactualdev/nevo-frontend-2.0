import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TeamMember } from "@/lib/api/team";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";

/**
 * SCRUM-247 on Admin Team: Learning Support on each person's row, never a
 * control on your own.
 */

const { list, holders } = vi.hoisted(() => ({ list: vi.fn(), holders: vi.fn() }));

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: { ...actual.teamApi, list: async () => actual.toAdminTeam(await list()) },
  };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: { ...actual.learningSupportApi, holders: () => holders() },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: { ...actual.schoolApi, get: async () => ({ name: "Brightgate Academy", profile: {} }) },
  };
});
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getSession: () => ({ userId: "u-me" }) };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminTeamView } from "./AdminTeamView";

const member = (userId: string, firstName: string, over: Partial<TeamMember> = {}): TeamMember => ({
  userId,
  adminId: `a-${userId}`,
  email: `${firstName.toLowerCase()}@brightgate.edu.ng`,
  firstName,
  lastName: "Adebayo",
  role: "other_admin",
  status: "active",
  scopes: ["oversight"],
  ...over,
});

const ls = (over: Partial<LearningSupportHolders> = {}): LearningSupportHolders => ({
  holders: [
    {
      userId: "u-gbenga",
      name: "Gbenga Adebayo",
      role: "other_admin",
      grantedAt: "2026-10-03T09:00:00Z",
      grantedBy: "u-me",
    },
  ],
  viewerHoldsIt: false,
  ...over,
});

beforeEach(() => {
  list.mockResolvedValue([
    member("u-me", "Folake"),
    member("u-gbenga", "Gbenga"),
    member("u-chidi", "Chidi"),
  ]);
  holders.mockResolvedValue(ls());
});

describe("Learning Support on Admin Team", () => {
  it("shows who holds it, who gave it and when", async () => {
    render(<AdminTeamView />);
    expect(await screen.findByText(/Given by you on 3 October 2026/)).toBeInTheDocument();
  });

  it("offers Give and Remove on other people's rows, and nothing on your own", async () => {
    render(<AdminTeamView />);
    await screen.findByText(/Given by you on 3 October 2026/);
    // Gbenga holds it: Remove. Chidi doesn't: Give. You don't either, and a
    // control on your row would make that two Gives.
    expect(screen.getAllByRole("button", { name: "Give Learning Support" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Remove Learning Support" })).toHaveLength(1);
    expect(
      screen.getByText(/No Learning Support. Another administrator can give it to you/),
    ).toBeInTheDocument();
  });

  it("shows your own record without a control when you hold it", async () => {
    holders.mockResolvedValue(
      ls({
        holders: [
          { userId: "u-me", name: "Folake Adebayo", role: "senco_admin", grantedAt: "2026-10-03T09:00:00Z", grantedBy: "u-gbenga" },
        ],
        viewerHoldsIt: true,
      }),
    );
    render(<AdminTeamView />);
    expect(await screen.findByText(/Given by Gbenga Adebayo on 3 October 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Learning Support" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Give Learning Support" })).toHaveLength(2);
  });

  it("says nothing about anyone when the holders can't be read", async () => {
    holders.mockRejectedValue(new Error("down"));
    render(<AdminTeamView />);
    await screen.findByText("Chidi Adebayo");
    expect(screen.queryByText(/Learning Support/)).toBeNull();
  });
});
