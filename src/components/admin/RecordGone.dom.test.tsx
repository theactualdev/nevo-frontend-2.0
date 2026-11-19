import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const h = vi.hoisted(() => ({
  studentGet: vi.fn(),
  classGet: vi.fn(),
  classTeachers: vi.fn(),
  classStudents: vi.fn(),
  classList: vi.fn(),
  teacherClasses: vi.fn(),
  teacherGet: vi.fn(),
}));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: (id: string) => h.studentGet(id),
      parentLinks: () => Promise.resolve([]),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      get: (id: string) => h.classGet(id),
      classTeachers: (id: string) => h.classTeachers(id),
      classStudents: (id: string) => h.classStudents(id),
      list: () => h.classList(),
      teacherClasses: (id: string) => h.teacherClasses(id),
    },
  };
});
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, get: (id: string) => h.teacherGet(id) } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { StudentDetailView } from "./Students/StudentDetailView";
import { ClassDetailView } from "./Classes/ClassDetailView";
import { TeacherDetailView } from "./Teachers/TeacherDetailView";

/**
 * D28 RECORD NOT FOUND (backlog 66, 80, 83). A detail page whose record has
 * gone names what was looked for and offers the way back to the list - no
 * retry, which cannot succeed. Every word is D28's.
 */

const gone = (what: string) => new ApiError(404, `${what} not found`, { detail: `${what} not found` });

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.classList.mockResolvedValue([]);
  h.classTeachers.mockResolvedValue([]);
  h.classStudents.mockResolvedValue([]);
  h.teacherClasses.mockResolvedValue([]);
});

describe.each([
  {
    what: "student",
    list: "/admin/students",
    top: "Students",
    show: () => render(<StudentDetailView studentId="s-gone" />),
    miss: () => h.studentGet.mockRejectedValue(gone("Student")),
    sideMiss: () => {
      h.studentGet.mockResolvedValue({ id: "s-1", firstName: "Amara" });
      h.classList.mockRejectedValue(gone("Thing"));
    },
    broke: () => h.studentGet.mockRejectedValue(new ApiError(500, "boom", {})),
  },
  {
    what: "class",
    list: "/admin/classes",
    top: "Classes",
    show: () => render(<ClassDetailView classId="c-gone" />),
    miss: () => h.classGet.mockRejectedValue(gone("Class")),
    sideMiss: () => {
      h.classGet.mockResolvedValue({ id: "c-1", name: "JSS 2A", subjects: [] });
      h.classStudents.mockRejectedValue(gone("Thing"));
    },
    broke: () => h.classGet.mockRejectedValue(new ApiError(500, "boom", {})),
  },
  {
    what: "teacher",
    list: "/admin/teachers",
    top: "Teachers",
    show: () => render(<TeacherDetailView teacherId="t-gone" />),
    miss: () => h.teacherGet.mockRejectedValue(gone("Teacher")),
    sideMiss: () => {
      h.teacherGet.mockResolvedValue({ id: "t-1", name: "Mr Bello" });
      h.teacherClasses.mockRejectedValue(gone("Thing"));
    },
    broke: () => h.teacherGet.mockRejectedValue(new ApiError(500, "boom", {})),
  },
])("a $what that is no longer there", ({ what, list, top, show, miss, sideMiss, broke }) => {
  it("says D28's words and offers only the way back to the list", async () => {
    miss();
    show();

    expect(await screen.findByRole("heading", { name: `We couldn’t find that ${what}` })).toBeInTheDocument();
    expect(
      screen.getByText(`The ${what} you opened isn’t here. Your other records are unaffected.`),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Back to all ${what === "class" ? "classes" : `${what}s`}` })).toHaveAttribute(
      "href",
      list,
    );
    expect(screen.getByRole("link", { name: `← ${top}` })).toHaveAttribute("href", list);
    // No retry: it cannot succeed.
    expect(screen.queryByRole("button", { name: /Try again/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load this/)).not.toBeInTheDocument();
  });

  it("keeps the retry when only a side read answered 404", async () => {
    sideMiss();
    show();

    expect(await screen.findByRole("button", { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t find that/)).not.toBeInTheDocument();
  });

  it("keeps the retry for a failure that may pass", async () => {
    broke();
    show();

    expect(await screen.findByRole("button", { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t find that/)).not.toBeInTheDocument();
  });
});
