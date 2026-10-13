import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { TeamMember } from "@/lib/api/team";
import { scopeSummary } from "../Shell/adminNav";
import { scopeName } from "./adminScopes";
import { AdminTeamView } from "./AdminTeamView";

/**
 * D03's polish: the school named where the screen said "this school", "You"
 * beside your own row, and an invite panel that can be closed like every
 * other sheet - but not mid-send. And SCRUM-39's rule that scope names are
 * byte-identical on this screen, the sidebar and the invite sheet.
 */

const list = vi.fn();
const invite = vi.fn();

vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: {
      ...actual.teamApi,
      // Members as a bare list; the real reader turns it into the team shape.
      list: async () => actual.toAdminTeam(await list()),
      invite: (p: unknown) => invite(p),
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: async () => ({ name: "Brightgate Academy", profile: {} }),
    },
  };
});
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getSession: () => ({ userId: "u-me" }) };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([member("u-me", "Folake"), member("u-2", "Gbenga", { scopes: ["billing"] })]);
});

describe("SCRUM-39: one set of scope names", () => {
  it("gives the sidebar the invite sheet's names, byte for byte", () => {
    expect(scopeSummary(["senco"])).toBe(scopeName("senco"));
    expect(scopeSummary(["senco"])).toBe("SENCo / Learning Support");
    expect(scopeSummary(["it_sso"])).toBe("IT / SSO");
    expect(scopeSummary(["billing", "oversight"])).toBe("General Oversight");
  });
});

describe("Admin Team", () => {
  it("names the school instead of 'this school'", async () => {
    const { container } = render(<AdminTeamView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 people can administer Brightgate Academy/),
    );
  });

  it("marks your own row, and only yours, as You", async () => {
    render(<AdminTeamView />);
    await screen.findByText("Folake Adebayo");
    expect(screen.getAllByText("You")).toHaveLength(1);
    const mine = screen.getByText("Folake Adebayo").parentElement!;
    expect(within(mine).getByText("You")).toBeInTheDocument();
  });

  it("marks the sole admin as You too", async () => {
    list.mockResolvedValue([member("u-me", "Folake")]);
    const { container } = render(<AdminTeamView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/full oversight of Brightgate Academy/));
    expect(screen.getByText("You")).toBeInTheDocument();
  });
});

describe("the invite panel", () => {
  const open = async () => {
    render(<AdminTeamView />);
    fireEvent.click(await screen.findByRole("button", { name: /Invite an admin/i }));
    return screen.getByRole("dialog", { name: "Invite a new admin" });
  };

  it("closes from its own button, and from Escape", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Invite a new admin" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Invite an admin/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Invite a new admin" })).toBeNull();
  });

  it("cannot be closed while the invitation is being created", async () => {
    invite.mockReturnValue(new Promise(() => {}));
    const dialog = await open();
    const email = dialog.querySelector("#invite-email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "g.eze@brightgate.edu.ng" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByText("Sending…");

    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole("dialog", { name: "Invite a new admin" })).toBeInTheDocument();
  });

  it("refreshes the list when closed after the invitation exists", async () => {
    invite.mockResolvedValue({
      invitationId: "inv1",
      userId: "u3",
      email: "g.eze@brightgate.edu.ng",
      role: "other_admin",
      scopes: ["oversight"],
      invitationToken: "tok",
      expiresAt: "2026-10-30T00:00:00Z",
    });
    const dialog = await open();
    const email = dialog.querySelector("#invite-email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "g.eze@brightgate.edu.ng" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByText(/is invited/);
    const reads = list.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(reads));
  });
});
