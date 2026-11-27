import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { LEARNING_SUPPORT_REQUIRED } from "@/lib/api/learningSupport";
import { MAX_PAGES, PAGE } from "@/lib/adaptationWindow";
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

/** `GET /api/v1/accommodations` refusing a viewer without the role. */
const ROLE_REFUSED = new ApiError(403, "Forbidden", {
  detail: { code: LEARNING_SUPPORT_REQUIRED, message: "This is the learning support view of a named child." },
});

/** Long enough for every read to land: a line, if one were coming, would. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
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
    // The code the server sends (backend 608b880). This test used to send
    // "learning_support_required", which it never does - and passed anyway,
    // because any 403 drew nothing.
    listActive.mockRejectedValue(ROLE_REFUSED);
    const { container } = render(<SencoView />);
    await openProfiles();
    await waitFor(() => expect(listActive).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/what Nevo is adjusting for each learner/);
    expect(container.querySelector("[data-active-support]")).toBeNull();
  });

  it("learns from the refusal that the role is missing, when the holders read didn't answer", async () => {
    // The nothing-state on purpose (Hub, 26 Nov): no line on any row, no
    // failure line - and the screen knows why, as a refused Mark as seen
    // teaches it.
    holders.mockImplementation(() => new Promise(() => {}));
    listActive.mockRejectedValue(ROLE_REFUSED);
    const { container } = render(<SencoView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /Marking a concern or a flag as seen, and starting a progress report, need Learning Support/,
      ),
    );
    await openProfiles();
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/what Nevo is adjusting for each learner/);
    expect(container.querySelector("[data-active-support]")).toBeNull();
  });
});

/**
 * Learning Support gap 2 (Hub, 26 Nov): "adaptations this week" said nothing
 * when its read failed - the same nothing a complete read of a quiet week
 * draws before its zeros land, and no way to ask again.
 */
describe("adaptations this week, when the log does not answer", () => {
  it("says a failed read above the list, to a holder, and clears on Try again", async () => {
    adaptationLog.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t read the adaptation log just now/),
    );
    expect(visibleText(container)).not.toMatch(/this week/);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/1 this week/));
    expect(visibleText(container)).not.toMatch(/the adaptation log/);
  });

  it("draws nothing on a refusal - no figure, no failure line, no Try again", async () => {
    adaptationLog.mockRejectedValue(new ApiError(403, "Forbidden", { detail: "Not permitted." }));
    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(adaptationLog).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    await settle();
    expect(visibleText(container)).not.toMatch(/this week|the adaptation log/);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says nothing to a viewer who is never shown the figure", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    adaptationLog.mockRejectedValue(new Error("500"));
    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(adaptationLog).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    await settle();
    expect(visibleText(container)).not.toMatch(/the adaptation log/);
  });

  it("draws no figure when the week runs past the page cap - not the partial count, and no failure line", async () => {
    // Hub, 26 Nov: hitting the cap is not a failure, but a count of the pages
    // we read is a floor beside a child's name - an untrue state. Same rule
    // as L51's count. Every page is full, so the log never ends.
    adaptationLog.mockImplementation((q: { offset: number }) =>
      Promise.resolve({
        events: Array.from({ length: PAGE }, (_, i) => ({
          id: `e${q.offset + i}`,
          studentId: "s1",
          studentFirstName: "Amara",
          lessonId: "l1",
          lessonTitle: "F",
          timestamp: new Date().toISOString(),
          trigger: "t",
          adaptation: "a",
          eventType: "x",
        })),
        total: 99_999,
        limit: PAGE,
        offset: q.offset,
      }),
    );
    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(adaptationLog).toHaveBeenCalledTimes(MAX_PAGES));
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    await settle();
    expect(visibleText(container)).not.toMatch(/this week|the adaptation log/);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
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
