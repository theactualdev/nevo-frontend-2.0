import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AgeCheck } from "@/lib/api/ageChecks";
import { OverviewView } from "./OverviewView";

/**
 * Backlog 33, SCRUM-39's "Couldn't load": per card, not whole-screen - "We
 * couldn't pull this in just now. We're on it." plus Try again, and the rest of
 * the dashboard still renders.
 *
 * Only the compliance card did it. The tiles and Worth a glance failed into
 * the same null as "nothing to show" and simply vanished - and a failed holds
 * read hid a child whose account is held and heading for deletion. A 403 is
 * never said as a failure: a scope this admin lacks is not a fault, and asking
 * again cannot change it.
 */

const { overview, held, roster, flags } = vi.hoisted(() => ({
  overview: vi.fn(),
  held: vi.fn(),
  roster: vi.fn(),
  flags: vi.fn(),
}));

vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      complianceAudit: () =>
        Promise.resolve({
          schoolId: "sch1",
          schoolName: "Brightgate Academy",
          generatedAt: "2026-09-11T08:00:00Z",
          studentsProfiled: 240,
          adaptationEventsLogged: 1240,
          diagnosticLabelsStored: 0,
          compliant: true,
          findings: [],
        }),
      // A live school: anything but zero keeps the ordinary dashboard.
      adaptationLog: () => Promise.resolve({ events: [], total: 1240, limit: 1, offset: 0 }),
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
          headline: "What Nevo is doing for Brightgate Academy",
          summary: "Two hundred and forty students have been learning with Nevo.",
          highlights: [],
          generatedAt: "2026-09-15T09:00:00Z",
          source: "live_school_data",
        }),
      overview: () => overview(),
      // No code, no current term: neither card is under test here.
      get: () =>
        Promise.resolve({
          id: "sch1",
          name: "Brightgate Academy",
          code: null,
          slug: null,
          profile: {},
          academicConfig: {},
          retentionPolicy: "contract",
          retentionDays: 365,
        }),
    },
  };
});
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => Promise.resolve([]) } };
});
vi.mock("@/lib/api/ageChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ageChecks")>();
  return { ...actual, ageChecksApi: { ...actual.ageChecksApi, held: () => held() } };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: () => roster() } };
});
vi.mock("@/lib/api/intelligence", () => ({
  intelligenceApi: { allFlags: () => flags() },
}));

const COUNTS = { schoolId: "sch1", counts: { teachers: 18, classes: 12, activeStudents: 287 } };

const hold = (): AgeCheck => ({
  id: "ac-amina",
  studentId: "s-amina",
  studentFirstName: "Amina",
  schoolDateOfBirth: "2014-02-03",
  state: "mismatch",
  differs: true,
  blocksAccess: true,
  enrolledAgeBand: "11_13",
  holdReasons: [],
  schoolNotifiedAt: "2026-07-08T09:00:00Z",
  deletionDueAt: "2026-08-07T09:00:00Z",
  schoolRecheckedAt: null,
  parentReconfirmedAt: null,
  clearable: true,
});

const LINE = /We couldn't pull this in just now\. We're on it\./;

beforeEach(() => {
  vi.clearAllMocks();
  overview.mockResolvedValue(COUNTS);
  held.mockResolvedValue([]);
  roster.mockResolvedValue([]);
  flags.mockResolvedValue({ flags: [], complete: true });
});

describe("the snapshot tiles", () => {
  it("say so when the headcounts can't be read, and fill in on Try again", async () => {
    overview.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(LINE));
    expect(visibleText(container)).not.toMatch(/Students enrolled/);
    // One failed read, one line: Worth a glance doesn't repeat it.
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Students enrolled/));
    expect(visibleText(container)).toMatch(/287/);
    expect(visibleText(container)).not.toMatch(LINE);
    expect(overview).toHaveBeenCalledTimes(2);
  });
});

describe("Worth a glance", () => {
  it("says so when the holds can't be read, rather than hiding a held child", async () => {
    held.mockRejectedValueOnce(new Error("500")).mockResolvedValue([hold()]);
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(LINE));
    const text = visibleText(container);
    expect(text).toMatch(/Worth a glance/);
    expect(text.indexOf("Worth a glance")).toBeLessThan(text.search(LINE));
    // The rest of the dashboard still renders.
    expect(text).toMatch(/Students enrolled/);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/1 student is on hold for a date of birth check/),
    );
    expect(visibleText(container)).not.toMatch(LINE);
    expect(held).toHaveBeenCalledTimes(2);
    // Try again asks again only for what failed.
    expect(roster).toHaveBeenCalledTimes(1);
  });

  it("says so under the rows it could read, when another read failed", async () => {
    held.mockResolvedValue([hold()]);
    roster.mockRejectedValue(new Error("500"));
    const { container } = render(<OverviewView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/1 student is on hold for a date of birth check/),
    );
    await waitFor(() => expect(visibleText(container)).toMatch(LINE));
    const text = visibleText(container);
    expect(text.search(/1 student is on hold/)).toBeLessThan(text.search(LINE));
  });

  it("never says it on a 403 - a scope this admin lacks is not a fault", async () => {
    flags.mockRejectedValue(new ApiError(403, "forbidden"));
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Students enrolled/));
    await waitFor(() => expect(flags).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(visibleText(container)).not.toMatch(LINE);
    expect(visibleText(container)).not.toMatch(/Worth a glance/);
  });

  it("is absent, and nothing says a failure, when every read came back with nothing", async () => {
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Students enrolled/));
    await waitFor(() => expect(held).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(visibleText(container)).not.toMatch(LINE);
    expect(visibleText(container)).not.toMatch(/Worth a glance/);
  });
});
