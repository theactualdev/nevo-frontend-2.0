import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { TeamMember } from "@/lib/api/team";
import { AdminTeamView } from "./AdminTeamView";

/**
 * A SCHOOL AT ITS SEAT ALLOWANCE HAD NO PATH TO ADD ANYONE.
 *
 * The invite action was removed outright at the allowance, where SCRUM-39 says
 * the opposite in as many words: "At zero remaining the invite action stays
 * visible and routes to Billing." The card explaining the allowance is the
 * explanation, not a replacement for the affordance - a control that vanishes
 * teaches nothing.
 *
 * And inviting REPLACED the whole page, so the team an admin was looking at -
 * and the seats line that decides whether to invite at all - disappeared the
 * moment they pressed the button.
 */

const team = vi.fn();
const school = vi.fn();

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: { ...actual.teamApi, list: () => team() },
  };
});

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: { ...actual.schoolApi, get: () => school() },
  };
});

const member = (i: number): TeamMember => ({
  userId: `u${i}`,
  adminId: `a${i}`,
  email: `admin${i}@school.edu.ng`,
  firstName: "Folake",
  lastName: `Number${i}`,
  role: "admin",
  status: "active",
  scopes: ["oversight"],
});

beforeEach(() => {
  team.mockReset();
  school.mockReset();
  // Boutique: five admin seats.
  school.mockResolvedValue({
    id: "s1",
    name: "Brightgate",
    code: null,
    slug: null,
    profile: { onboarding: { band: "boutique" } },
    academicConfig: {},
    retentionPolicy: "contract",
    retentionDays: 365,
  });
});

function inviteButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Invite an admin"),
  );
}

describe("at the seat allowance", () => {
  it("still offers a way to add someone", async () => {
    team.mockResolvedValue([1, 2, 3, 4, 5].map(member));
    const { container } = render(<AdminTeamView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/All five admin accounts are in use/),
    );
    expect(inviteButton(container)).toBeTruthy();
  });

  it("keeps the explanation alongside it, not instead of it", async () => {
    team.mockResolvedValue([1, 2, 3, 4, 5].map(member));
    const { container } = render(<AdminTeamView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/at no charge/),
    );
    expect(inviteButton(container)).toBeTruthy();
  });
});

describe("the allowance (Lydia, 7 Oct)", () => {
  it("is five for every school - a bigger band, or none at all", async () => {
    for (const profile of [{ onboarding: { band: "enterprise" } }, {}]) {
      school.mockResolvedValue({
        id: "s1",
        name: "Brightgate",
        code: null,
        slug: null,
        profile,
        academicConfig: {},
        retentionPolicy: "contract",
        retentionDays: 365,
      });
      team.mockResolvedValue([1, 2, 3, 4, 5].map(member));
      const { container, unmount } = render(<AdminTeamView />);
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/All five admin accounts are in use/),
      );
      expect(visibleText(container)).toMatch(/5 of 5 admin accounts/);
      expect(visibleText(container)).toMatch(/Brightgate includes five admin accounts as standard/);
      unmount();
    }
  });

  it("states the cap even when the school record cannot be read", async () => {
    school.mockRejectedValue(new Error("down"));
    team.mockResolvedValue([1, 2, 3].map(member));
    const { container } = render(<AdminTeamView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/3 of 5 admin accounts/));
  });
});

describe("the invite sheet", () => {
  it("opens over the team rather than in place of it", async () => {
    team.mockResolvedValue([1, 2, 3].map(member));
    const { container } = render(<AdminTeamView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Number1/));

    fireEvent.click(inviteButton(container)!);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Invite a new admin/),
    );
    // The list is still there behind it.
    expect(visibleText(container)).toMatch(/Number1/);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });
});

describe("a deactivated admin", () => {
  it("is shown as deactivated, and uses no seat", async () => {
    /*
     * Anything other than `active` used to read as "Invited", so a removed
     * admin looked like someone on their way in - and was counted against the
     * allowance, telling a school its seats were full.
     */
    team.mockResolvedValue([
      member(1),
      member(2),
      member(3),
      member(4),
      { ...member(5), status: "deactivated" },
    ]);
    const { container } = render(<AdminTeamView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Deactivated/));
    const text = visibleText(container);
    expect(text).not.toMatch(/Invited/);
    expect(text).toMatch(/4 of 5 admin accounts/);
    expect(text).not.toMatch(/All five admin accounts are in use/);
  });
});
