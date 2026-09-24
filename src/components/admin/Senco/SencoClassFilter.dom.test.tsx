import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import type { AdminStudentRow } from "@/lib/api/students";
import { SencoView } from "./SencoView";

/**
 * "No profiles match. Try a different name or filter."
 *
 * This screen issues one roster request PER CLASS to work out who is in what.
 * Each can fail on its own, and a class whose request failed contributed no
 * entries at all - so filtering to it matched nobody, and the screen stated it
 * as a fact about the school's records. A SENCo checking who she holds profiles
 * for before a review meeting concluded Nevo held none for that class.
 */

const perClass = vi.fn();
const classList = vi.fn();

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, getFlags: async () => [] },
  };
});

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: () => classList(),
      // The per-class read MOVED here from `studentsApi.list({ classId })`:
      // `ClassStudentResponse` carries `observations`, which is what makes the
      // lessons-finished figure free. Same call count, richer payload.
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
];

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      // Whole-school only now - the per-class read is `classesApi.classStudents`.
      list: () => Promise.resolve(students),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** A roster row, as `GET /classes/{id}/students` returns it. */
const onRoster = (
  studentId: string,
  observations?: { pattern: string; count?: number | null }[],
) => ({
  studentId,
  firstName: "Amara",
  lastName: "Okafor",
  displayName: "Amara Okafor",
  loginIdentifier: "amara",
  status: "active",
  profileStatus: "active",
  latestSessionAt: null,
  observations,
  seatContext: "active",
  consent: { status: "not_sent", actorId: null, actorName: null, timestamp: null, channel: null },
});

const klass = (id: string, name: string): AdminClass => ({
  id,
  name,
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
});

async function openProfilesAndFilter(container: HTMLElement, classId: string) {
  fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));
  const select = await waitFor(() => {
    const el = container.querySelector("select") as HTMLSelectElement | null;
    if (!el) throw new Error("no class filter yet");
    return el;
  });
  fireEvent.change(select, { target: { value: classId } });
}

describe("SencoView class filter", () => {
  it("does not report an empty class when that class's roster failed", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockRejectedValue(new Error("500"));

    const { container } = render(<SencoView />);
    await openProfilesAndFilter(container, "c1");

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't read that class's roster/i),
    );
    expect(visibleText(container)).toMatch(
      /not a record that the class has no profiles/i,
    );
    expect(visibleText(container)).not.toMatch(/No profiles match/i);
  });

  it("still says no match when the roster read fine and nobody is in it", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockResolvedValue([]);

    const { container } = render(<SencoView />);
    await openProfilesAndFilter(container, "c1");

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/No profiles match/i),
    );
    expect(visibleText(container)).not.toMatch(/couldn't read/i);
  });
  it("does not report an empty class while that class's roster is still loading", async () => {
    // `setPhase("ready")` fires before the per-class fan-out is even launched,
    // so the filter was usable during a window in which no class had answered.
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<SencoView />);
    await openProfilesAndFilter(container, "c1");

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Still reading that class's roster/i),
    );
    expect(visibleText(container)).not.toMatch(/No profiles match/i);
    expect(visibleText(container)).not.toMatch(/couldn't read/i);
  });
});

/**
 * D8b's lessons-finished figure, which was deferred for months on the claim
 * that it needed a request per learner. It rides the per-class roster read the
 * screen already makes.
 */
describe("lessons finished on the profile row", () => {
  it("shows the count the roster reported", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockResolvedValue([
      onRoster("s1", [{ pattern: "completed_lessons", count: 12 }]),
    ]);

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/12 lessons finished/),
    );
  });

  it("reads naturally at one", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockResolvedValue([
      onRoster("s1", [{ pattern: "completed_lessons", count: 1 }]),
    ]);

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/1 lesson finished/));
  });

  it("shows NOTHING when the roster read failed - never a zero", async () => {
    // THE LOAD-BEARING ONE. "0 lessons finished" beside a child's name, because
    // a request did not answer, is a statement about the child.
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockRejectedValue(new Error("500"));

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/lessons? finished/);
    expect(visibleText(container)).not.toMatch(/0 lessons/);
  });

  it("shows nothing when the roster carried no count for that learner", async () => {
    // `count` is optional and nullable on the contract; absent is not zero.
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockResolvedValue([
      onRoster("s1", [{ pattern: "completed_lessons", count: null }]),
    ]);

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/lessons? finished/);
  });
});
