import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdminClass } from "@/lib/api/classes";
import type { AdminStudentRow } from "@/lib/api/students";
import { SencoView } from "./SencoView";

/**
 * Backlog 40, D08b's learner list:
 * - ACTIVE SUPPORT from `GET /api/v1/accommodations`, as sentences about what
 *   Nevo does - never "Reading" or "Attention" beside a child's name (Zero-Tag).
 * - "N this week" only for a Learning Support holder (SCRUM-247).
 */

const listActive = vi.fn();
const holders = vi.fn();
const adaptationLog = vi.fn();

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, getFlags: async () => [], allFlags: async () => ({ flags: [], complete: true }) },
  };
});
vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: { ...actual.schoolIntelligenceApi, adaptationLog: (q: unknown) => adaptationLog(q) },
  };
});
const klass: AdminClass = {
  id: "c1",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 2,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, list: async () => [klass], classStudents: async () => [] },
  };
});
const students: AdminStudentRow[] = [
  {
    id: "s1",
    name: "Amara Okafor",
    loginIdentifier: "amara",
    status: "active",
    ageBand: "11-14",
    consent: { status: "not_sent", actorId: null, actorName: null, timestamp: null, channel: null },
  },
  {
    id: "s2",
    name: "Chisom Eze",
    loginIdentifier: "chisom",
    status: "active",
    ageBand: "11-14",
    consent: { status: "not_sent", actorId: null, actorName: null, timestamp: null, channel: null },
  },
];
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: async () => students },
    accommodationsApi: { listActive: () => listActive() },
  };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return { ...actual, learningSupportApi: { ...actual.learningSupportApi, holders: () => holders() } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const row = (studentId: string, active: string[]) => ({
  studentId,
  studentName: "x",
  active,
  lastChangedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  holders.mockResolvedValue({ holders: [], viewerHoldsIt: true });
  listActive.mockResolvedValue([row("s1", ["reading", "attention"]), row("s2", [])]);
  adaptationLog.mockResolvedValue({
    events: [{ id: "e1", studentId: "s1", studentFirstName: "Amara", lessonId: "l1", lessonTitle: "F", timestamp: new Date().toISOString(), trigger: "t", adaptation: "a", eventType: "x" }],
    total: 1,
    limit: 100,
    offset: 0,
  });
});

async function openProfiles() {
  fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));
}

describe("the learner list's Active Support (backlog 40)", () => {
  it("says what Nevo does for each learner, never a category beside their name", async () => {
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() => expect(container.querySelector("[data-active-support]")).not.toBeNull());
    const lines = [...container.querySelectorAll("[data-active-support] li")].map((l) => l.textContent);
    expect(lines).toEqual([
      "Nevo keeps the reading level of each step within reach.",
      "Nevo breaks work into shorter stretches, with more pauses.",
    ]);
    // Chisom has none: no line at all, and no word standing in for one.
    expect(container.querySelectorAll("[data-active-support]")).toHaveLength(1);
    expect(visibleText(container)).not.toMatch(/\bReading\b|\bAttention\b|\bStandard\b/);
  });

  it("says once, above the rows, when the read fails - and clears on Try again", async () => {
    listActive.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t read what Nevo is adjusting for each learner just now/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(container.querySelector("[data-active-support]")).not.toBeNull());
    expect(visibleText(container)).not.toMatch(/what Nevo is adjusting for each learner/);
  });

  it("adds no failure line of its own when the role is what's missing", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    listActive.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: "learning_support_required" } }),
    );
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() => expect(listActive).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/what Nevo is adjusting for each learner/);
    expect(container.querySelector("[data-active-support]")).toBeNull();
  });
});

describe("adaptations this week, by role (SCRUM-247)", () => {
  it("shows the count to a Learning Support holder", async () => {
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() => expect(visibleText(container)).toMatch(/1 this week/));
  });

  it("shows no per-child count to a viewer without the role", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() => expect(adaptationLog).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/this week/);
  });

  it("shows none while the role isn't known", async () => {
    holders.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/this week/);
  });
});
