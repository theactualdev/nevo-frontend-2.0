import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/team";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";

/**
 * SCRUM-247 on Admin Team, as D03b draws it (design 9d0ff6b): Learning Support
 * is one permission on the person's record - their access sheet - where the
 * "SENCo / Learning Support" scope used to be ticked. Your own row says where
 * you stand and offers nothing.
 */

const { list, holders, deactivate, grant, updateScopes } = vi.hoisted(() => ({
  list: vi.fn(),
  holders: vi.fn(),
  deactivate: vi.fn(),
  grant: vi.fn(),
  updateScopes: vi.fn(),
}));

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: {
      ...actual.teamApi,
      list: async () => actual.toAdminTeam(await list()),
      deactivate: (id: string) => deactivate(id),
      updateScopes: (id: string, scopes: string[]) => updateScopes(id, scopes),
    },
  };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: {
      ...actual.learningSupportApi,
      holders: () => holders(),
      grant: (id: string) => grant(id),
    },
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

const GBENGA_HOLDS = {
  userId: "u-gbenga",
  name: "Gbenga Adebayo",
  role: "other_admin",
  grantedAt: `${new Date().getFullYear()}-10-03T09:00:00Z`,
  grantedBy: "u-me",
  grantedByName: "Folake Adebayo",
};
const ls = (over: Partial<LearningSupportHolders> = {}): LearningSupportHolders => ({
  holders: [GBENGA_HOLDS],
  viewerHoldsIt: false,
  ...over,
});

const openSheet = async (name: string) => {
  render(<AdminTeamView />);
  await screen.findByText(name);
  const rows = screen.getAllByRole("button", { name: "Edit access" });
  // Folake (you) has no Edit access, so Gbenga's is first and Chidi's second.
  fireEvent.click(rows[name.startsWith("Gbenga") ? 0 : 1]);
  return screen.getByRole("dialog", { name: `${name}'s access` });
};

beforeEach(() => {
  list.mockResolvedValue([
    member("u-me", "Folake"),
    member("u-gbenga", "Gbenga", { scopes: ["oversight", "senco"] }),
    member("u-chidi", "Chidi", { scopes: ["roster"] }),
  ]);
  holders.mockResolvedValue(ls());
  updateScopes.mockReset().mockResolvedValue({});
  grant.mockReset();
  deactivate.mockReset();
});

describe("your own row", () => {
  it("says where you stand, and offers nothing to press", async () => {
    render(<AdminTeamView />);
    expect(await screen.findByText("Not held")).toBeInTheDocument();
    expect(screen.getByText("Another administrator can grant you Learning Support.")).toBeInTheDocument();
    // No row anywhere carries a Learning Support control: it lives on the record.
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("the access sheet, the person's record", () => {
  it("draws Learning Support as one line where the senco scope was ticked", async () => {
    const sheet = await openSheet("Gbenga Adebayo");
    expect(within(sheet).getByText("What Gbenga can access")).toBeInTheDocument();
    const toggle = within(sheet).getByRole("switch", { name: "Learning Support for Gbenga Adebayo" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(within(sheet).getByText("Granted by Folake Adebayo · 3 October")).toBeInTheDocument();
    expect(within(sheet).queryByText("SENCo / Learning Support")).toBeNull();
  });

  it("grants at once, and Save keeps the senco scope that came with it", async () => {
    grant.mockResolvedValue(
      ls({ holders: [GBENGA_HOLDS, { ...GBENGA_HOLDS, userId: "u-chidi", name: "Chidi Adebayo" }] }),
    );
    const sheet = await openSheet("Chidi Adebayo");
    fireEvent.click(within(sheet).getByRole("switch", { name: "Learning Support for Chidi Adebayo" }));
    await waitFor(() => expect(grant).toHaveBeenCalledWith("u-chidi"));
    await waitFor(() =>
      expect(within(sheet).getByRole("switch")).toHaveAttribute("aria-checked", "true"),
    );

    fireEvent.click(within(sheet).getByText("Billing"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(updateScopes).toHaveBeenCalled());
    expect(new Set(updateScopes.mock.calls[0][1])).toEqual(new Set(["roster", "billing", "senco"]));
  });

  it("keeps the old checkbox when who holds it can't be read", async () => {
    holders.mockRejectedValue(new Error("down"));
    const sheet = await openSheet("Gbenga Adebayo");
    expect(within(sheet).getByText("SENCo / Learning Support")).toBeInTheDocument();
    expect(within(sheet).queryByRole("switch")).toBeNull();
  });
});

describe("taking access away from the only holder", () => {
  it("says what to do", async () => {
    deactivate.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: { code: "last_learning_support_holder", message: "Grant Learning Support to another person before changing the final holder." },
      }),
    );
    render(<AdminTeamView />);
    await screen.findByText("Gbenga Adebayo");
    // Gbenga's row comes first: Folake's own row has no Remove access. Its
    // confirm card opens straight under it, before Chidi's row.
    fireEvent.click(screen.getAllByRole("button", { name: "Remove access" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove access" })[1]);
    expect(
      await screen.findByText(
        "Gbenga Adebayo is the only person in your school with Learning Support, so their access can't be removed. Give Learning Support to someone else first, then remove their access.",
      ),
    ).toBeInTheDocument();
  });
});
