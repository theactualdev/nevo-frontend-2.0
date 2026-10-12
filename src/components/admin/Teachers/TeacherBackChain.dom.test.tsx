import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminClass, AssignedClass } from "@/lib/api/classes";
import { readBack } from "../back";
import { TeacherDetailView } from "./TeacherDetailView";

/**
 * A class opened from a teacher's page returns to that teacher - and the
 * teacher's own way back survives the round trip.
 */

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      get: async () => ({
        id: "t1",
        name: "Folake Adeyemi",
        email: "f@school.edu.ng",
        status: "active",
        classIds: ["c-2a"],
        subjects: [],
      }),
    },
  };
});

const held: AssignedClass = {
  assignmentId: "a1",
  classId: "c-2a",
  className: "JSS 2A",
  classCode: null,
  role: "primary",
  assignedAt: "2026-01-01T00:00:00Z",
};
const klass = {
  id: "c-2a",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 30,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 1,
  teachers: [],
  archivedAt: null,
} as AdminClass;

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      teacherClasses: async () => [held],
      list: async () => [klass],
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { list: async () => [] } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/teachers/t1",
}));

describe("a teacher's classes", () => {
  it("open with a way back to this teacher", async () => {
    render(<TeacherDetailView teacherId="t1" />);
    const row = await screen.findByRole("link", { name: /JSS 2A/ });
    const url = new URL(row.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/admin/classes/c-2a");
    expect(readBack(Object.fromEntries(url.searchParams))).toEqual({
      href: "/admin/teachers/t1",
      label: "Folake Adeyemi",
    });
  });

  it("keep the teacher's own way back on the round trip", async () => {
    render(<TeacherDetailView teacherId="t1" back={{ href: "/admin/sso", label: "IT & SSO" }} />);
    expect(await screen.findByRole("link", { name: /← IT & SSO/ })).toHaveAttribute("href", "/admin/sso");
    const row = screen.getByRole("link", { name: /JSS 2A/ });
    const toTeacher = readBack(Object.fromEntries(new URL(row.getAttribute("href")!, "http://x").searchParams))!;
    const teacherUrl = new URL(toTeacher.href, "http://x");
    expect(teacherUrl.searchParams.get("back")).toBe("/admin/sso");
  });
});
