import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { held, list, history } = vi.hoisted(() => ({
  held: vi.fn(),
  list: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Tunde",
        lastName: "Adeyemi",
        loginIdentifier: "tunde.a",
        admissionNumber: null,
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: { status: "confirmed" as const, actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      parentLinks: async () => [],
    },
  };
});
// The child's look comes from their class roster (#1055's useChildLook).
vi.mock("@/lib/api/classes", () => ({
  classesApi: { list: async () => [], classStudents: async () => [] },
}));
vi.mock("@/lib/api/ageChecks", () => ({ ageChecksApi: { held, list, history } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { StudentDetailView } from "./StudentDetailView";

/**
 * D07b, fixed in 96cd4b4: a child held for a date of birth check is ON HOLD,
 * not "Active and learning normally" - the frame's old reading contradicted
 * the hold in production. The page points at the checks rather than
 * describing the hold in its own words, and never shows the parent's date.
 */

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([]);
  history.mockResolvedValue([]);
});

describe("what happened to the date (Lydia, 2 Nov, item 12)", () => {
  const edit = (previous: string | null, next: string) => ({
    previousSchoolDateOfBirth: previous,
    newSchoolDateOfBirth: next,
    actorUserId: "u-grace",
    actorName: "Grace Eze",
    changedAt: "2026-10-21T09:00:00Z",
  });

  it("says who changed the date on the record, from what to what, and when", async () => {
    held.mockResolvedValue([]);
    list.mockResolvedValue([{ id: "ac1", studentId: "s1", blocksAccess: false }]);
    history.mockResolvedValue([edit("2013-03-14", "2014-09-03")]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(
      await screen.findByText(
        "Grace Eze changed this child’s date of birth from 14 March 2013 to 3 September 2014 on 21 October 2026.",
      ),
    ).toBeInTheDocument();
    expect(history).toHaveBeenCalledWith("ac1");
    expect(container.textContent).not.toMatch(/parent’s date/);
  });

  it("says nothing for a re-check that kept the same date", async () => {
    held.mockResolvedValue([]);
    list.mockResolvedValue([{ id: "ac1", studentId: "s1", blocksAccess: false }]);
    history.mockResolvedValue([edit("2013-03-14", "2013-03-14")]);
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.queryByText(/changed this child’s date of birth/)).toBeNull();
  });

  it("reads only this child's checks", async () => {
    held.mockResolvedValue([]);
    list.mockResolvedValue([{ id: "ac9", studentId: "s-other", blocksAccess: false }]);
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(history).not.toHaveBeenCalled();
  });

  /*
   * Lydia's other line (2 Nov, item 12), buildable since ef7745c put the
   * parent's confirmation on the same history. The day it took effect - never
   * the parent's date, which on that row is `dateInForce`, and never their name.
   */
  const parentTookOver = {
    previousSchoolDateOfBirth: "2014-09-03",
    newSchoolDateOfBirth: null,
    actorUserId: "u-parent",
    actorName: "Ngozi Okafor",
    changedAt: "2026-10-25T12:00:00Z",
    dateInForce: "2013-11-30",
    source: "parent_confirmation",
  };

  it("says when a parent's date was confirmed and took over, without the date itself", async () => {
    held.mockResolvedValue([]);
    list.mockResolvedValue([{ id: "ac1", studentId: "s1", blocksAccess: false }]);
    history.mockResolvedValue([parentTookOver]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(
      await screen.findByText(
        "A parent’s date of birth was confirmed and now applies, from 25 October 2026.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/30 November 2013|2013-11-30|November 2013/);
    expect(container.textContent).not.toMatch(/Ngozi Okafor/);
  });

  it("tells both in the order they happened - one account of the record", async () => {
    held.mockResolvedValue([]);
    list.mockResolvedValue([{ id: "ac1", studentId: "s1", blocksAccess: false }]);
    // Out of order on purpose: the record reads oldest first.
    history.mockResolvedValue([parentTookOver, edit("2013-03-14", "2014-09-03")]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await screen.findByText(/A parent’s date of birth was confirmed/);
    const text = container.textContent ?? "";
    expect(text.indexOf("Grace Eze changed this child’s date of birth")).toBeLessThan(
      text.indexOf("A parent’s date of birth was confirmed"),
    );
  });
});

describe("a student held for a date of birth check", () => {
  it("reads On hold, and points at the checks, with a way back here", async () => {
    held.mockResolvedValue([{ id: "ac1", studentId: "s1", blocksAccess: true, differs: true, holdReasons: [] }]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("On hold")).toBeInTheDocument();
    expect(container.textContent).toMatch(
      /Tunde’s date of birth differs from the one the parent gave, so this account is on hold and hasn’t started yet\. The parent’s date is never shown\./,
    );
    expect(screen.getByRole("link", { name: "Date of birth checks" }).getAttribute("href")).toBe(
      "/admin/students/date-of-birth?back=%2Fadmin%2Fstudents%2Fs1&backLabel=Tunde",
    );
  });

  it("is the ordinary status for a child who isn't held", async () => {
    held.mockResolvedValue([{ id: "ac2", studentId: "s-other", blocksAccess: true }]);
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("On hold")).toBeNull();
    expect(screen.queryByRole("link", { name: "Date of birth checks" })).toBeNull();
  });

  it("claims neither hold nor Active when the checks can't be read (Lydia, 4 Nov)", async () => {
    held.mockRejectedValue(new Error("down"));
    render(<StudentDetailView studentId="s1" />);
    // The page is there; only the Status line is left out.
    expect(await screen.findByText("Tunde Adeyemi")).toBeInTheDocument();
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryByText("On hold")).toBeNull();
  });
});

/**
 * ITEM 17 (Teslim, 7 Nov): a child can be held for a ROSTER GAP - the dates
 * agree, but no single year group is recorded (`enrolled_age_band_unavailable`,
 * `differs` false). Nothing may say the dates differ for that child (Lydia's
 * 4 Nov principle: an untrue state is worse than a missing one).
 */
describe("a student held for a roster gap (item 17)", () => {
  it("says no year group is recorded, in Lydia's 2 Nov words - never that the dates differ", async () => {
    held.mockResolvedValue([
      { id: "ac1", studentId: "s1", blocksAccess: true, differs: false, holdReasons: ["enrolled_age_band_unavailable"] },
    ]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("On hold")).toBeInTheDocument();
    expect(container.textContent).toMatch(
      /Tunde’s date of birth is confirmed, but no year group is recorded for them\. Check the enrolment on their record\./,
    );
    expect(container.textContent).not.toMatch(/differs|different date|don.t match/i);
    expect(screen.getByRole("link", { name: "Date of birth checks" })).toBeInTheDocument();
  });

  it("when the dates agree but fall outside the year group, says that - in Lydia's 31 Oct words", async () => {
    held.mockResolvedValue([
      { id: "ac1", studentId: "s1", blocksAccess: true, differs: false, holdReasons: ["outside_enrolled_age_band"] },
    ]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("On hold")).toBeInTheDocument();
    expect(container.textContent).toMatch(
      /The dates now agree, but the date of birth does not match the year group Tunde is enrolled in/,
    );
    expect(container.textContent).not.toMatch(/differs from the one the parent gave/);
  });
});
