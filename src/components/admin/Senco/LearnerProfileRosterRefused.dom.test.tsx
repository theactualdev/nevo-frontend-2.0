import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { Accommodations } from "@/lib/api/students";
import { LearnerProfileView } from "./LearnerProfileView";

/**
 * TO-DO 12 (Hub, 25 Nov), after S14 went live in v43 (608b880):
 * `GET /api/v1/classes/{id}/students` now admits an admin with roster or SENCO
 * access or a Learning Support grant, and answers everyone else
 * 403 `class_students_forbidden`. For them "What Nevo has noticed" said "We
 * couldn't read Amara's class roster just now" - a wait no retry ends. A
 * refusal draws the nothing-state; a failure is still said.
 */

const h = vi.hoisted(() => ({ roster: vi.fn(), accommodations: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/senco/s1",
}));
// The profile also draws the safeguarding line (d2c77636), which reads the
// safety events. Nothing is flagged here, so this test sees only the roster's
// refusal and never that read's own failure line.
vi.mock("@/lib/api/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/safety")>();
  return { ...actual, safetyApi: { ...actual.safetyApi, events: async () => [] } };
});
// The profile also draws "What changed, and when" (2fa78571), which reads the
// accommodation history. An empty history keeps this test on the roster's
// refusal, never on that read's own failure line.
vi.mock("@/lib/api/accommodationHistory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/accommodationHistory")>();
  return {
    ...actual,
    accommodationHistoryApi: {
      ...actual.accommodationHistoryApi,
      forStudent: async (studentId: string) => ({ studentId, changes: [], adaptationsPerWeek: [] }),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Amara",
        lastName: "Okafor",
        loginIdentifier: "NV-1",
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: ["c1"],
        firstUse: false,
        consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      accommodations: () => h.accommodations(),
      mastery: async () => [],
      masteryByLevel: async () => ({ studentId: "s1", concepts: [] }),
      adaptations: async () => [],
    },
    // Below the server's floor, so help-seeking draws nothing of its own.
    conversationEvidenceApi: {
      forStudent: async () => ({
        studentId: "s1",
        periodDays: 14,
        interactionCount: 0,
        categories: {},
        privacy: "withheld_below_minimum",
        minimumInteractions: 3,
      }),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: async () => [
        {
          id: "c1",
          name: "JSS 2A",
          code: null,
          yearGroup: "jss2",
          source: null,
          subjects: [],
          studentCount: 1,
          section: null,
          academicSession: null,
          capacity: null,
          teacherCount: 0,
          teachers: [],
          archivedAt: null,
        },
      ],
      classStudents: (id: string) => h.roster(id),
    },
  };
});

/** The route's refusal, as v43 sends it. */
const REFUSED = new ApiError(403, "Forbidden", { detail: { code: "class_students_forbidden" } });

const withSignals = (frontendSignals: string[]): Accommodations => ({
  studentId: "s1",
  activeAccommodations: [],
  frontendSignals,
  signals: [],
  source: "inference",
  persistedAsLabel: false,
});

const onRoster = (observations: { pattern: string; count?: number | null }[]) => ({
  studentId: "s1",
  firstName: "Amara",
  lastName: "Okafor",
  displayName: "Amara Okafor",
  loginIdentifier: "NV-1",
  status: "active",
  profileStatus: "active",
  latestSessionAt: null,
  observations,
  seatContext: "active",
  consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
});

beforeEach(() => {
  h.roster.mockReset().mockRejectedValue(REFUSED);
  h.accommodations.mockReset().mockResolvedValue(withSignals([]));
});

describe("What Nevo has noticed, for an admin the roster route refuses", () => {
  it("is left out - no failure line, no Try again, no claim that Nevo found nothing", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await screen.findByText("Current accommodations");
    await waitFor(() => expect(h.roster).toHaveBeenCalledWith("c1"));

    await waitFor(() => expect(visibleText(container)).not.toMatch(/What Nevo has noticed/i));
    expect(visibleText(container)).not.toMatch(/class roster/i);
    expect(visibleText(container)).not.toMatch(/couldn.t read/i);
    expect(visibleText(container)).not.toMatch(/Nothing consistent enough to describe/);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("still draws the accommodation record's signals, labelled as what they are", async () => {
    h.accommodations.mockResolvedValue(withSignals(["pacingRequests"]));
    const { container } = render(<LearnerProfileView studentId="s1" />);

    await waitFor(() =>
      // `visibleText` keeps the gap between the name's and the "'s" text nodes.
      expect(visibleText(container)).toMatch(/These are the signals on Amara ?.s accommodation record\./),
    );
    expect(visibleText(container)).toMatch(/What Nevo has noticed/i);
    expect(visibleText(container)).not.toMatch(/class roster/i);
  });
});

describe("What Nevo has noticed, otherwise", () => {
  it("fills from the roster for an admin the route admits", async () => {
    h.roster.mockResolvedValue([onRoster([{ pattern: "completed_lessons", count: 6 }])]);
    const { container } = render(<LearnerProfileView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Amara has been finishing the lessons they start\./),
    );
    // The count stays out until the roster declares its window (S22).
    expect(visibleText(container)).not.toMatch(/6 lessons/);
  });

  it("still says a read that FAILED, which a retry can mend", async () => {
    h.roster.mockRejectedValue(new ApiError(500, "down"));
    const { container } = render(<LearnerProfileView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t read Amara.s class roster just now/),
    );
  });
});
