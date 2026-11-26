import { chooseOption } from "@/test/nevoSelect";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
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
    intelligenceApi: { ...actual.intelligenceApi, getFlags: async () => [], allFlags: async () => ({ flags: [], complete: true }) },
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
    accommodationsApi: { listActive: async () => [] },
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

async function openProfilesAndFilter(container: HTMLElement, className: string) {
  fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));
  await chooseOption(await screen.findByRole("combobox", { name: "Filter by class" }), className);
}

describe("SencoView class filter", () => {
  it("does not report an empty class when that class's roster failed", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockRejectedValue(new Error("500"));

    const { container } = render(<SencoView />);
    await openProfilesAndFilter(container, "JSS 2A");

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
    await openProfilesAndFilter(container, "JSS 2A");

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
    await openProfilesAndFilter(container, "JSS 2A");

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
 *
 * LEFT OUT UNTIL ITS WINDOW IS DECLARED (S22, Hub 25 Nov). The server counts
 * the last 30 days and the contract does not say so, so "12 lessons finished"
 * read as a total - an untrue state about a child. When the window arrives the
 * figure returns with it (`observations.test.ts` pins the phrasing).
 */
describe("lessons finished on the profile row", () => {
  it("leaves out the count the roster reported, whose window is not declared", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockResolvedValue([
      onRoster("s1", [{ pattern: "completed_lessons", count: 12 }]),
    ]);

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    // The roster has landed: the row names the child's class from it.
    await waitFor(() => expect(visibleText(container)).toMatch(/JSS 2A/));
    expect(visibleText(container)).not.toMatch(/12 lessons|lessons? finished/);
  });

  it("leaves it out at one as well", async () => {
    classList.mockResolvedValue([klass("c1", "JSS 2A")]);
    perClass.mockResolvedValue([
      onRoster("s1", [{ pattern: "completed_lessons", count: 1 }]),
    ]);

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/JSS 2A/));
    expect(visibleText(container)).not.toMatch(/lessons? finished/);
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

/**
 * TO-DO 12 (Hub, 25 Nov), after S14 went live in v43 (608b880): the roster
 * route admits an admin with roster or SENCO access or a Learning Support
 * grant, and answers anyone else 403 `class_students_forbidden` - about the
 * viewer, never the class. For them the class filter could only print an
 * absence the records never stated, or a wait no retry ends.
 */
describe("for an admin the roster route refuses", () => {
  const REFUSED = new ApiError(403, "Forbidden", { detail: { code: "class_students_forbidden" } });
  const twoYears = () => [klass("c1", "JSS 2A"), { ...klass("c2", "JSS 3A"), yearGroup: "jss3" }];

  it("lists every learner, and offers no class or year filter, no figure and no Try again", async () => {
    classList.mockResolvedValue(twoYears());
    perClass.mockRejectedValue(REFUSED);

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("tab", { name: "Learner profiles" }));

    await waitFor(() =>
      expect(screen.queryByRole("combobox", { name: "Filter by class" })).toBeNull(),
    );
    expect(screen.queryByRole("combobox", { name: "Filter by year group" })).toBeNull();
    expect(visibleText(container)).toMatch(/Amara Okafor/);
    expect(visibleText(container)).not.toMatch(/lessons? finished/);
    expect(visibleText(container)).not.toMatch(/couldn.t read|Still reading|No profiles match/i);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("drops a class chosen before the refusal landed, rather than calling the class empty", async () => {
    classList.mockResolvedValue(twoYears());
    const held: ((err: unknown) => void)[] = [];
    perClass.mockImplementation(
      () =>
        new Promise((_, reject) => {
          held.push(reject);
        }),
    );

    const { container } = render(<SencoView />);
    await openProfilesAndFilter(container, "JSS 2A");
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Still reading that class's roster/i),
    );

    held.forEach((refuse) => refuse(REFUSED));

    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).not.toMatch(/couldn.t read|Still reading|No profiles match/i);
  });

  it("still fills the class filter for an admin the route admits", async () => {
    classList.mockResolvedValue(twoYears());
    perClass.mockImplementation((id: string) =>
      Promise.resolve(id === "c1" ? [onRoster("s1", [{ pattern: "completed_lessons", count: 3 }])] : []),
    );

    const { container } = render(<SencoView />);
    await openProfilesAndFilter(container, "JSS 2A");

    // Filtered to her class, the row carries the class line the roster gave.
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));
    expect(visibleText(container)).toMatch(/JSS 2A · /);
    expect(visibleText(container)).not.toMatch(/No profiles match|Still reading/);
  });
});
