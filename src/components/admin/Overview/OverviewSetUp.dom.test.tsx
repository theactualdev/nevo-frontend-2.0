import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { OverviewView } from "./OverviewView";

/**
 * D04's early variant says when the school set up - "Set up 3 days ago" in
 * the header, "Brightgate Academy joined Nevo three days ago" in the welcome -
 * from `onboarding.completedAt`, which the school record carries.
 */

const get = vi.fn();
const adaptationLog = vi.fn();

vi.mock("@/hooks/useSetupGate", () => ({
  useSetupGate: () => ({ writesPaused: false, pause: null, resolved: true, email: null, refresh: vi.fn(), note: null }),
}));
vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      complianceAudit: async () => ({
        schoolId: "sch1",
        schoolName: "Brightgate Academy",
        generatedAt: "2026-09-11T08:00:00Z",
        studentsProfiled: 0,
        adaptationEventsLogged: 0,
        diagnosticLabelsStored: 0,
        compliant: true,
        findings: [],
      }),
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
      get: () => get(),
      narrative: () => Promise.reject(new Error("not under test")),
      overview: async () => ({ schoolId: "sch1", counts: { teachers: 3 } }),
    },
  };
});

const school = (completedAt?: string) => ({
  id: "sch1",
  name: "Brightgate Academy",
  code: null,
  slug: null,
  profile: { onboarding: completedAt ? { completedAt } : {} },
  academicConfig: {},
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

beforeEach(() => {
  vi.clearAllMocks();
  // Total 0 keeps the Overview in its early variant.
  adaptationLog.mockResolvedValue({ events: [], total: 0, limit: 1, offset: 0 });
});

describe("the early Overview, on when the school set up", () => {
  it("says it in the header and in the welcome", async () => {
    get.mockResolvedValue(school(daysAgo(3)));
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Set up 3 days ago ·/));
    expect(visibleText(container)).toMatch(
      /Brightgate Academy joined Nevo three days ago, so there.s nothing to report on learning just yet/,
    );
  });

  it("says nothing about when for a school with no set-up date", async () => {
    get.mockResolvedValue(school());
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/There.s nothing to report on learning just yet/));
    expect(visibleText(container)).not.toMatch(/Set up|joined Nevo/);
  });
});
