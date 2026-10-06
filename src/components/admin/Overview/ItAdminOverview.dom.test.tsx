import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { OverviewView } from "./OverviewView";

/**
 * The Overview for an admin without General Oversight, who can still reach it
 * by a link (a finance admin, say - nobody without oversight lands here).
 *
 * Built to what the server allows: the headcounts and the board summary are
 * served to any admin, the compliance audit and the adaptation log are not. So
 * a refused read costs its own card, never the school, and nothing on the page
 * links to a screen this admin's rail leaves out.
 */

let scopes: string[] = ["billing"];
vi.mock("@/context/PermissionContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/PermissionContext")>();
  const { createContext } = await import("react");
  return {
    ...actual,
    PermissionContext: createContext({
      get scopes() {
        return scopes;
      },
      resolved: true,
      status: "ready",
      refresh: () => {},
    } as never),
  };
});

const audit = vi.fn();
const adaptationLog = vi.fn();
vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      complianceAudit: () => audit(),
      adaptationLog: () => adaptationLog(),
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      narrative: () =>
        Promise.resolve({
          headline: "Brightgate this term",
          summary: "Two hundred and forty students have been learning with Nevo.",
          highlights: [],
          generatedAt: "2026-10-06T08:00:00Z",
        }),
      overview: () =>
        Promise.resolve({
          counts: { students: 240, studentsActive: 240, studentsInvited: 0, teachers: 18, classes: 12 },
        }),
      get: () => Promise.reject(new Error("unread")),
    },
  };
});
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => Promise.resolve([]) } };
});
vi.mock("@/lib/api/students", () => ({
  studentsApi: { list: () => Promise.resolve([]) },
}));
/** One learner with a flag nobody has seen: D04's "Worth a glance" row. */
vi.mock("@/lib/api/intelligence", () => ({
  intelligenceApi: {
    allFlags: () =>
      Promise.resolve({
        complete: true,
        flags: [
          {
            id: "f1",
            studentId: "s1",
            flagType: "engagement_decline",
            description: "x",
            generatedAt: "2026-10-01T00:00:00Z",
            acknowledged: false,
          },
        ],
      }),
  },
}));

beforeEach(() => {
  scopes = ["billing"];
  audit.mockRejectedValue(new ApiError(403, "forbidden"));
  adaptationLog.mockRejectedValue(new ApiError(403, "forbidden"));
});

describe("an admin without General Oversight", () => {
  it("still gets the school - a refused compliance read costs its card, not the page", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Two hundred and forty students have been learning/),
    );
    expect(visibleText(container)).not.toMatch(/don't have access to the school overview/i);
  });

  it("says who sees the compliance check, rather than failing or retrying", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /The compliance check and your school's learning activity are shown to admins with General Oversight/,
      ),
    );
    expect(visibleText(container)).not.toMatch(/couldn't pull this in/i);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("link", { name: /What we store/ })).toBeNull();
  });

  it("states what the flags read found, without a link to a screen that refuses them", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/1 student has a flag nobody has marked as seen/),
    );
    expect(screen.queryByRole("link", { name: /Open Learning Support/ })).toBeNull();
  });

  it("keeps that link for an admin who can open Learning Support", async () => {
    scopes = ["oversight", "senco"];
    audit.mockRejectedValue(new ApiError(500, "x"));
    render(<OverviewView />);
    expect(await screen.findByRole("link", { name: /Open Learning Support/ })).toHaveAttribute(
      "href",
      "/admin/senco",
    );
  });
});
