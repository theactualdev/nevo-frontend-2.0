import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { OverviewView } from "./OverviewView";

/**
 * A CARD THAT CANNOT LOAD MUST NOT COST THE PAGE.
 *
 * SCRUM-39: "Couldn't load: per-card, not whole-screen ... The rest of the
 * dashboard still renders." `complianceAudit()` was the one uncaught read in
 * this screen's `Promise.all`, so a 500 on it blanked the board summary, every
 * roster count and the roll-up as well, and offered one page-wide retry.
 *
 * The 403 is the deliberate exception and is tested here beside it: that is
 * not a card failing, it is an admin without `oversight`, and a dashboard of
 * empty cards would be a worse answer than telling them.
 */

const audit = vi.fn();
const adaptationLog = vi.fn();
const narrative = vi.fn();
const overview = vi.fn();

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
      get: () =>
        Promise.resolve({
          id: "sch1",
          name: "Brightgate Academy",
          code: null,
          slug: null,
          profile: { onboarding: { band: "mid_market" } },
          academicConfig: {},
          retentionPolicy: "contract",
          retentionDays: 365,
        }),
    },
  };
});

const invites = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => invites() } };
});

vi.mock("@/lib/api/students", () => ({
  studentsApi: { list: () => Promise.resolve([]) },
}));
vi.mock("@/lib/api/intelligence", () => ({
  intelligenceApi: { allFlags: () => Promise.resolve({ flags: [], complete: true }) },
}));

const AUDIT = {
  schoolId: "sch1",
  schoolName: "Brightgate Academy",
  generatedAt: "2026-09-11T08:00:00Z",
  studentsProfiled: 240,
  adaptationEventsLogged: 1240,
  diagnosticLabelsStored: 0,
  compliant: true,
  findings: [],
};

const NARRATIVE = {
  headline: "What Nevo is doing for Brightgate Academy",
  summary: "Two hundred and forty students have been learning with Nevo.",
  highlights: [],
  generatedAt: "2026-09-15T09:00:00Z",
  source: "live_school_data",
};

beforeEach(() => {
  audit.mockReset();
  adaptationLog.mockReset();
  narrative.mockReset();
  overview.mockReset();
  invites.mockReset();
  invites.mockResolvedValue([]);
  audit.mockResolvedValue(AUDIT);
  adaptationLog.mockResolvedValue({
    events: [],
    total: 1240,
    limit: 1,
    offset: 0,
  });
  narrative.mockResolvedValue(NARRATIVE);
  overview.mockResolvedValue({
    schoolId: "sch1",
    counts: { teachers: 18, classes: 12, activeStudents: 287 },
  });
});

describe("a compliance audit that fails", () => {
  it("costs its own card and nothing else", async () => {
    audit.mockRejectedValue(new Error("500"));
    const { container } = render(<OverviewView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/We couldn't pull this in just now/),
    );
    const text = visibleText(container);
    // Everything the failed read used to take down with it.
    expect(text).toMatch(/Two hundred and forty students have been learning/);
    expect(text).toMatch(/Students enrolled/);
    expect(text).toMatch(/287/);
    expect(text).toMatch(/Teachers/);
    // And no whole-page failure card.
    expect(text).not.toMatch(/couldn't load your school's overview/i);
  });

  it("offers a retry that fills the card in", async () => {
    audit.mockRejectedValueOnce(new Error("500")).mockResolvedValue(AUDIT);
    const { container } = render(<OverviewView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/We're on it/),
    );
    const again = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Try again"),
    )!;
    fireEvent.click(again);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Diagnostic labels stored/),
    );
    expect(visibleText(container)).not.toMatch(/We're on it/);
  });

  it("does not put a figure it never read into the board pack", async () => {
    audit.mockRejectedValue(new Error("500"));
    const { container } = render(<OverviewView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Copy for board pack/),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const copy = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Copy for board pack"),
    )!;
    fireEvent.click(copy);

    const pasted = writeText.mock.calls[0][0] as string;
    expect(pasted).toMatch(/Two hundred and forty students/);
    expect(pasted).not.toMatch(/Diagnostic labels stored/);
  });

  it("still denies the whole page on a 403, which is not a card failing", async () => {
    audit.mockRejectedValue(new ApiError(403, "forbidden"));
    const { container } = render(<OverviewView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /don't have access to the school overview/i,
      ),
    );
    // No half-built dashboard beside the refusal.
    expect(visibleText(container)).not.toMatch(/Students enrolled/);
    expect(visibleText(container)).not.toMatch(/Try again/);
  });
});

describe("the early-life variant", () => {
  it("is never chosen from a total we failed to read", async () => {
    // `adaptationTotal ?? 0` would greet a school of 287 with "Welcome to
    // Nevo - there's nothing to report on learning just yet".
    audit.mockRejectedValue(new Error("500"));
    adaptationLog.mockRejectedValue(new Error("500"));
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Students enrolled/));
    expect(visibleText(container)).not.toMatch(/Welcome to Nevo/);
    expect(visibleText(container)).not.toMatch(/nothing to report on learning/);
  });

  it("greys its zeros but never the compliance zero", async () => {
    // SCRUM-39 makes the difference explicit: on the snapshot a zero reads as
    // early, and on the compliance card it is "the expected reading forever"
    // and "must not look like missing data".
    audit.mockResolvedValue({ ...AUDIT, studentsProfiled: 0 });
    adaptationLog.mockResolvedValue({ events: [], total: 0, limit: 1, offset: 0 });
    overview.mockResolvedValue({ schoolId: "sch1", counts: { classes: 0 } });
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Where things stand/));

    const numerals = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.textContent === "0",
    );
    const muted = numerals.filter((s) =>
      s.className.includes("text-nevo-near-black/32"),
    );
    const navy = numerals.filter((s) => s.className.includes("text-nevo-navy"));
    // The snapshot's zeros are greyed; the compliance one stays navy.
    expect(muted.length).toBeGreaterThan(0);
    expect(navy.length).toBe(1);
    expect(navy[0].className).toMatch(/text-\[38px\]/);
  });
});

describe("the snapshot header", () => {
  it("claims a scope the figures actually have", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Activity so far/));
    const text = visibleText(container);
    expect(text).toMatch(/Since setup/);
    // Not one figure on this page is scoped to a half-term or a week.
    expect(text).not.toMatch(/Activity this (week|half-term)/);
  });

  it("carries the band's denominator on the enrolled tile", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Students enrolled/));
    // mid_market: 251-500.
    expect(visibleText(container)).toMatch(/of 500/);
  });
});

describe("copy for board pack", () => {
  it("swaps its label, and says so when the clipboard refuses", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Copy for board pack/),
    );

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    const copy = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Copy for board pack"),
    )!;
    fireEvent.click(copy);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Copied for board pack/),
    );
  });

  it("never claims a copy the browser refused", async () => {
    const { container } = render(<OverviewView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Copy for board pack/),
    );

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const copy = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Copy for board pack"),
    )!;
    fireEvent.click(copy);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/wouldn't let us reach the clipboard/),
    );
    expect(visibleText(container)).not.toMatch(/Copied for board pack/);
  });
});

describe("the roll-up", () => {
  it("shows no invented row, and no section when this school has nothing to show", async () => {
    /*
     * D04's third "Worth a glance" row - "2 classes haven't run a lesson yet:
     * JSS 1B and SSS 2 Arts" - has no source, and was rendering for every live
     * school under a note. A real school was being shown class names that
     * were not theirs. With no roster or flag rows, there is nothing to glance
     * at, so the section is not drawn at all.
     */
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Students enrolled/));
    const text = visibleText(container);

    expect(text).not.toMatch(/haven.t run a lesson|JSS 1B|SSS 2 Arts/);
    expect(text).not.toMatch(/Worth a glance/i);
    expect(text).not.toMatch(/is a sample/i);
    expect(container.querySelector("[data-nevo-sample]")).toBeNull();
  });
});

describe("the school's name", () => {
  it("comes from the school record, so a failed compliance read is not 'your school'", async () => {
    // The title - and the board pack copied for governors - fell back to
    // "your school" whenever the compliance audit failed.
    audit.mockRejectedValue(new Error("500"));
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Brightgate Academy/));
    expect(visibleText(container)).not.toMatch(/\byour school\b/i);
  });
});

describe("the board summary", () => {
  it("can be tried again on its own when it fails", async () => {
    narrative.mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce(NARRATIVE);
    const { container } = render(<OverviewView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/couldn.t load your summary/));
    const retry = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "Try again",
    )!;
    fireEvent.click(retry);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Two hundred and forty students have been learning/),
    );
  });
});

describe("the teachers tile", () => {
  const invite = (id: string, role: string) => ({
    id,
    token: null,
    role,
    email: `${id}@school.edu.ng`,
    name: null,
    status: "pending",
    expiresAt: "2099-01-01T00:00:00Z",
    deliveryStatus: null,
  });

  it("says how many teacher invitations are open, as D04 does", async () => {
    invites.mockResolvedValue([invite("a", "teacher"), invite("b", "teacher"), invite("c", "student")]);
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/2 invitations pending/));
  });

  it("keeps its own words when the invitations cannot be read", async () => {
    invites.mockRejectedValue(new Error("403"));
    const { container } = render(<OverviewView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/with a Nevo account/));
    expect(visibleText(container)).not.toMatch(/invitations? pending/);
  });
});
