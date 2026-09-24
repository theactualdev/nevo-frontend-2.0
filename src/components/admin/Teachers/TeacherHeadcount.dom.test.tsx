import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass, AssignedClass } from "@/lib/api/classes";
import { TeacherDetailView } from "./TeacherDetailView";

/**
 * "3 · Classes" beside a Students figure that silently omitted one of them.
 *
 * `classesApi.list()` excludes archived classes, so a teacher still holding a
 * class archived at the end of last term had that class missing from the map -
 * and the headcount coalesced it to `?? 0` while the Classes card counted it.
 * Two cards side by side, disagreeing, both stated as plain numbers.
 */

const teacherClasses = vi.fn();
const list = vi.fn();

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
        classIds: [],
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
      teacherClasses: () => teacherClasses(),
      list: (includeArchived?: boolean) => list(includeArchived),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const held = (id: string): AssignedClass => ({
  assignmentId: `a-${id}`,
  classId: id,
  className: `Class ${id}`,
  classCode: null,
  role: "primary",
  assignedAt: "2026-01-01T00:00:00Z",
});

const klass = (id: string, studentCount: number, archivedAt: string | null = null): AdminClass => ({
  id,
  name: `Class ${id}`,
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt,
});

describe("TeacherDetailView headcount", () => {
  it("asks for archived classes, so the map is complete", async () => {
    teacherClasses.mockResolvedValue([held("c1")]);
    list.mockResolvedValue([klass("c1", 24)]);

    render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    // `list()` defaulted to excluding them, which is what made a held class
    // invisible to the headcount.
    expect(list).toHaveBeenCalledWith(true);
  });

  it("does not count an archived class as one they teach, and says it is there", async () => {
    teacherClasses.mockResolvedValue([held("c1"), held("c2"), held("c3")]);
    list.mockResolvedValue([
      klass("c1", 24),
      klass("c2", 18),
      klass("c3", 30, "2026-07-31T00:00:00Z"),
    ]);

    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Classes/));

    const t = visibleText(container);
    // Two active classes, 24 + 18 - and the archived one is named, not dropped
    // in silence and not folded into the total.
    expect(t).toMatch(/\b2\b[\s\S]*Classes/);
    expect(t).toMatch(/plus 1 archived/i);
    expect(t).toMatch(/\b42\b[\s\S]*Students/);
    expect(t).not.toMatch(/\b72\b/);
  });

  it("marks the headcount as a floor when a held class is still unknown", async () => {
    teacherClasses.mockResolvedValue([held("c1"), held("gone")]);
    list.mockResolvedValue([klass("c1", 24)]);

    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Students/));
    // 24 is not the total, and the card no longer implies it is.
    expect(visibleText(container)).toMatch(/in the classes we could read/i);
  });

  it("says nothing unusual when every class is present and active", async () => {
    teacherClasses.mockResolvedValue([held("c1"), held("c2")]);
    list.mockResolvedValue([klass("c1", 24), klass("c2", 18)]);

    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Students/));
    const t = visibleText(container);
    expect(t).toMatch(/in their classes/);
    expect(t).not.toMatch(/archived/i);
    expect(t).not.toMatch(/could read/i);
  });
  it("marks the archived row the card left out", async () => {
    // The fix made the two cards agree and, in doing so, made the Classes card
    // disagree with the list right below it: 2 on the card, 3 rows beneath.
    teacherClasses.mockResolvedValue([held("c1"), held("c2"), held("c3")]);
    list.mockResolvedValue([
      klass("c1", 24),
      klass("c2", 18),
      klass("c3", 30, "2026-07-31T00:00:00Z"),
    ]);

    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Class c3/));
    // The row says which one it is, so the count and the list can be reconciled.
    expect(visibleText(container)).toMatch(/Class c3 Archived/);
  });
});
