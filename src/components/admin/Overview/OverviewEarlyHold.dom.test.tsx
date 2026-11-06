import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { visibleText } from "@/test/visibleText";
import type { AgeCheck } from "@/lib/api/ageChecks";
import { OverviewView } from "./OverviewView";

/**
 * D04 (cb527bf, 27 Oct): a child held for a date of birth check in a school's
 * first week surfaces on the early Overview - "Worth a glance", right under
 * the welcome and above Getting started - instead of staying invisible until
 * the school is live. The early variant used to show no roll-up at all.
 */

const audit = vi.fn();
const adaptationLog = vi.fn();
const narrative = vi.fn();
const overview = vi.fn();
const held = vi.fn();
const roster = vi.fn();

const setupGate = vi.fn();
vi.mock("@/hooks/useSetupGate", () => ({ useSetupGate: () => setupGate() }));

vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
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
      narrative: () => narrative(),
      overview: () => overview(),
      // Reads, with no code: a failed school read now says so on the code
      // card (backlog 33), which is not what these tests are about.
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

vi.mock("@/lib/api/ageChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ageChecks")>();
  return { ...actual, ageChecksApi: { ...actual.ageChecksApi, held: () => held() } };
});

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: () => roster() } };
});

const AUDIT = {
  schoolId: "sch1",
  schoolName: "Brightgate Academy",
  generatedAt: "2026-09-11T08:00:00Z",
  studentsProfiled: 0,
  adaptationEventsLogged: 0,
  diagnosticLabelsStored: 0,
  compliant: true,
  findings: [],
};

const hold = (over: Partial<AgeCheck> = {}): AgeCheck => ({
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
  ...over,
});

const ROSTER = [
  {
    id: "s-amina",
    name: "Amina Yusuf",
    loginIdentifier: null,
    status: "active",
    ageBand: null,
    consent: { status: "confirmed" },
  },
];

// visibleText straightens apostrophes, so the patterns here use plain ones.
const NEEDS_YOU = /One thing does need you already, though - it's noted just below\./;

beforeEach(() => {
  vi.clearAllMocks();
  audit.mockResolvedValue(AUDIT);
  // Total 0 keeps the Overview in its early variant.
  adaptationLog.mockResolvedValue({ events: [], total: 0, limit: 1, offset: 0 });
  narrative.mockRejectedValue(new Error("not under test"));
  overview.mockResolvedValue({ schoolId: "sch1", counts: { teachers: 3 } });
  roster.mockResolvedValue(ROSTER);
  held.mockResolvedValue([hold()]);
  setupGate.mockReturnValue({
    writesPaused: false, pause: null, resolved: true,
    email: null, refresh: vi.fn(), note: null,
  });
});

describe("the early Overview with a child already held (D04, 27 Oct)", () => {
  it("names the child under Worth a glance, right under the welcome and above Getting started", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/1 student is on hold for a date of birth check/),
    );
    const text = visibleText(container);
    expect(text).toMatch(
      /Amina Yusuf can't start until the date is confirmed or corrected\. It's waiting on you, even this early\./,
    );
    const at = (s: string) => text.indexOf(s);
    expect(at("Welcome to Nevo")).toBeLessThan(at("Worth a glance"));
    expect(at("Worth a glance")).toBeLessThan(at("Where things stand"));
    expect(at("Where things stand")).toBeLessThan(at("Getting started"));
  });

  it("says in the welcome that one thing needs the school already", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(NEEDS_YOU));
  });

  it("routes to the date of birth checks", async () => {
    render(<OverviewView />);
    const row = await screen.findByText(/1 student is on hold/);
    // No permission context here, so the row is a link (useCanOpen's default).
    expect(row.closest("a")?.getAttribute("href")).toBe("/admin/students/date-of-birth");
  });

  it("claims nothing of the school when the hold is waiting on the parent", async () => {
    held.mockResolvedValue([hold({ schoolRecheckedAt: "2026-07-09T09:00:00Z" })]);
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Amina Yusuf can't start until the date is confirmed or corrected\./),
    );
    const text = visibleText(container);
    expect(text).not.toMatch(/waiting on you/);
    expect(text).not.toMatch(NEEDS_YOU);
  });

  it("shows no Worth a glance and no extra sentence when nobody is held", async () => {
    held.mockResolvedValue([]);
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Getting started/));
    const text = visibleText(container);
    expect(text).not.toMatch(/Worth a glance/);
    expect(text).not.toMatch(NEEDS_YOU);
  });

  it("says it couldn't check when the holds can't be read - never a count, never 'none' (backlog 33)", async () => {
    // This used to show nothing at all, which hid a held child - heading for
    // deletion - exactly as completely as having none. SCRUM-39's per-card line.
    held.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/We couldn't pull this in just now\. We're on it\./),
    );
    const text = visibleText(container);
    expect(text.indexOf("Worth a glance")).toBeGreaterThan(-1);
    expect(text).not.toMatch(/on hold for a date of birth check/);
    expect(text).not.toMatch(NEEDS_YOU);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/1 student is on hold for a date of birth check/),
    );
    expect(visibleText(container)).not.toMatch(/couldn't pull this in/);
    expect(held).toHaveBeenCalledTimes(2);
  });

  it("says nothing on a 403 - a scope this admin lacks is not a fault to retry", async () => {
    held.mockRejectedValue(new ApiError(403, "forbidden"));
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Getting started/));
    expect(visibleText(container)).not.toMatch(/Worth a glance/);
    expect(visibleText(container)).not.toMatch(/couldn't pull this in/);
  });
});
