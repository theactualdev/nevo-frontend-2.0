import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminStudentRow } from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/**
 * Two roster defects found by the admin audit:
 * - the Class column showed a loading bar FOREVER for a child in no active
 *   class, or whose class read failed;
 * - "Show deactivated" changed the school's own header figures.
 */

const list = vi.fn();
const classes = vi.fn();
const params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => params,
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: (q: unknown) => list(q) },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: () => classes() } }));

const consent = { status: "not_sent" as const, actorId: null, actorName: null, timestamp: null, channel: null };
const row = (id: string, name: string, status = "active"): AdminStudentRow => ({
  id,
  name,
  status,
  ageBand: null,
  loginIdentifier: null,
  consent,
});

const CLASS = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  classes.mockResolvedValue([CLASS]);
});

describe("the Class column", () => {
  it("says a child is in no active class instead of loading forever", async () => {
    list.mockImplementation((q: { classId?: string }) =>
      Promise.resolve(q?.classId ? [row("a", "Amara Obi")] : [row("a", "Amara Obi"), row("b", "Bayo Ade")]),
    );
    const { container } = render(<StudentsView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/No active class/));
    expect(visibleText(container)).toMatch(/JSS 2A/);
  });

  it("marks the cell unknown when a class read fails, rather than empty", async () => {
    list.mockImplementation((q: { classId?: string }) =>
      q?.classId ? Promise.reject(new Error("500")) : Promise.resolve([row("a", "Amara Obi")]),
    );
    const { container } = render(<StudentsView />);

    await waitFor(() => expect(screen.getByTitle(/couldn't read every class/)).toBeInTheDocument());
    expect(visibleText(container)).not.toMatch(/No active class/);
  });
});

describe("the header figures", () => {
  it("do not move when deactivated students are revealed", async () => {
    list.mockImplementation((q: { includeInactive?: boolean; classId?: string }) =>
      Promise.resolve(
        q?.includeInactive
          ? [row("a", "Amara Obi"), row("b", "Bayo Ade", "deactivated")]
          : [row("a", "Amara Obi")],
      ),
    );
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/1 enrolled/));

    fireEvent.click(screen.getByRole("button", { name: "Show deactivated" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Bayo Ade/));
    expect(visibleText(container)).toMatch(/1 enrolled · 1 without recorded consent/);
  });
});
