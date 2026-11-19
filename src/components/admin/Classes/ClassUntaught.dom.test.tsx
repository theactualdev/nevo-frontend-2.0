import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import { ClassDetailView } from "./ClassDetailView";

/**
 * D05 CLASS DETAIL (backlog 27): once anyone teaches here, the subjects nobody
 * does were invisible. The "No teacher yet" row names them, with Assign - and
 * only when it can be known. The archive line is D05's.
 */

const archive = vi.fn();
const restore = vi.fn();
const classTeachers = vi.fn();
const removeAssignment = vi.fn();
const get = vi.fn();

const klass = (over: Partial<AdminClass> = {}): AdminClass => ({
  id: "c1",
  name: "JSS2 Blue",
  code: "JSS2B",
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 24,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
  ...over,
});

let current = klass();

const teacher = {
  assignmentId: "as1",
  teacherId: "t1",
  firstName: "Folake",
  lastName: "Adeyemi",
  email: "f@school.edu.ng",
  role: "primary" as const,
  assignedAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  get.mockImplementation(async () => current);
  classTeachers.mockResolvedValue([]);
});

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      get: () => get(),
      classTeachers: () => classTeachers(),
      classStudents: async () => [],
      archive: () => archive(),
      restore: () => restore(),
      removeAssignment: () => removeAssignment(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/classes/c1",
}));

describe("the No teacher yet row", () => {
  it("names the subjects nobody teaches, with Assign", async () => {
    current = klass({ subjects: ["Mathematics", "Basic Science", "Civic Education"] });
    classTeachers.mockResolvedValue([{ ...teacher, subject: "Mathematics" }]);
    const { container } = render(<ClassDetailView classId="c1" />);
    await waitFor(() => expect(container.querySelector("[data-untaught]")).not.toBeNull());
    const row = container.querySelector("[data-untaught]") as HTMLElement;
    expect(visibleText(row)).toMatch(/No teacher yet Basic Science, Civic Education Assign/);
    expect(row.querySelector("button")?.textContent).toBe("Assign");
  });

  it("is absent when every subject is taught", async () => {
    current = klass({ subjects: ["Mathematics"] });
    classTeachers.mockResolvedValue([{ ...teacher, subject: "Mathematics" }]);
    const { container } = render(<ClassDetailView classId="c1" />);
    await screen.findByText("Folake Adeyemi");
    expect(container.querySelector("[data-untaught]")).toBeNull();
  });

  it("is absent when an assignment carries no subject, so it can't be known", async () => {
    current = klass({ subjects: ["Mathematics", "Basic Science"] });
    classTeachers.mockResolvedValue([teacher]);
    const { container } = render(<ClassDetailView classId="c1" />);
    await screen.findByText("Folake Adeyemi");
    expect(container.querySelector("[data-untaught]")).toBeNull();
    expect(visibleText(container)).not.toMatch(/No teacher yet/);
  });
});

describe("the archive line", () => {
  it("is D05's: never deleted, and you'll be asked to confirm", async () => {
    current = klass();
    const { container } = render(<ClassDetailView classId="c1" />);
    await screen.findByRole("button", { name: "Archive this class" });
    expect(visibleText(container)).toMatch(
      /Students and their progress are never deleted - you'll be asked to confirm\./,
    );
    expect(visibleText(container)).not.toMatch(/are not affected/);
  });
});
