import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import type { AdminStudentRow } from "@/lib/api/students";
import { SencoView } from "./SencoView";

/**
 * "Adaptations this week" on the learner list.
 *
 * The figure was deferred twice on wrong reasoning: first as needing a request
 * per learner, then as "one windowed call". It is neither — `limit` caps at 100
 * and the log pages. What matters on this screen is the direction of the error:
 * a count that is quietly LOW reads as a finding about a child, so every state
 * that is not a complete read must render NOTHING.
 */

const adaptationLog = vi.fn();
const perClass = vi.fn();
const classList = vi.fn();

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, getFlags: async () => [] },
  };
});

vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      adaptationLog: (q: unknown) => adaptationLog(q),
    },
  };
});

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: () => classList(),
      classStudents: (id: string) => perClass(id),
    },
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
    studentsApi: { ...actual.studentsApi, list: () => Promise.resolve(students) },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const klass = (id: string, name: string): AdminClass => ({
  id,
  name,
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 2,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  archivedAt: null,
});

const event = (id: string, studentId: string) => ({
  id,
  studentId,
  studentFirstName: "Amara",
  lessonId: "l1",
  lessonTitle: "Fractions",
  timestamp: new Date().toISOString(),
  trigger: "Paused on the same step.",
  adaptation: "Added a worked example.",
  eventType: "Scaffold added",
});

async function openProfiles() {
  fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));
}

beforeEach(() => {
  adaptationLog.mockReset();
  perClass.mockReset();
  classList.mockReset();
  classList.mockResolvedValue([klass("c1", "JSS 2A")]);
  perClass.mockResolvedValue([]);
});

describe("adaptations this week", () => {
  it("counts a learner's adaptations over the window", async () => {
    adaptationLog.mockResolvedValue({
      events: [event("1", "s1"), event("2", "s1"), event("3", "s2")],
      total: 3,
      limit: 100,
      offset: 0,
    });

    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(visibleText(container)).toMatch(/2 this week/));
    expect(visibleText(container)).toMatch(/1 this week/);
  });

  it("asks for a seven-day window", async () => {
    adaptationLog.mockResolvedValue({ events: [], total: 0, limit: 100, offset: 0 });

    render(<SencoView />);
    await waitFor(() => expect(adaptationLog).toHaveBeenCalled());

    const days =
      (Date.now() - Date.parse(adaptationLog.mock.calls[0][0].dateFrom)) / 864e5;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("shows a real zero once the whole window has been read", async () => {
    // A complete read that found nothing for this learner IS a zero, and
    // saying so is different from staying silent because we do not know.
    adaptationLog.mockResolvedValue({
      events: [event("1", "s2")],
      total: 1,
      limit: 100,
      offset: 0,
    });

    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(visibleText(container)).toMatch(/1 this week/));
    expect(visibleText(container)).toMatch(/0 this week/);
  });

  it("shows NOTHING when the log read failed", async () => {
    // THE LOAD-BEARING ONE. Never a zero attributed to the child.
    adaptationLog.mockRejectedValue(new Error("500"));

    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/this week/);
  });

  it("shows nothing while the window is still being read", async () => {
    adaptationLog.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    // In flight is not answered.
    expect(visibleText(container)).not.toMatch(/this week/);
  });

  it("renders the profiles even when the window never answers", async () => {
    // The slowest read on the screen must not hold the list behind it.
    adaptationLog.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<SencoView />);
    await openProfiles();

    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).toMatch(/Chisom Eze/);
  });
});
