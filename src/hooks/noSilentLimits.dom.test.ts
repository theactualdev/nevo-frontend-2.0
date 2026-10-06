import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  allFlags: vi.fn(),
  getFlags: vi.fn(),
  myClasses: vi.fn(),
  classStudents: vi.fn(),
  lessonsList: vi.fn(),
}));
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, allFlags: api.allFlags, getFlags: api.getFlags },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, myClasses: api.myClasses, classStudents: api.classStudents },
  };
});
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, list: api.lessonsList } };
});

import { useTeacherFlags } from "./useTeacherFlags";
import { useStudentDirectory } from "./useStudentDirectory";
import { useLessonLibrary } from "./useLessonLibrary";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THREE LISTS THAT STOPPED SHORT WITHOUT SAYING SO.
 *
 * The flags read one page of 50 and Home said its length as the total. The
 * student directory took a teacher's first 12 classes and dropped the rest.
 * The library took the endpoint's default 50 lessons, so lesson 51 onwards
 * was missing from the library, assign and recommend with nothing saying so.
 */

const flag = (id: string, acknowledged = false) => ({
  id,
  studentId: `s-${id}`,
  flagType: "slowing",
  description: "Taking longer on written segments.",
  generatedAt: "2026-10-05T08:00:00Z",
  acknowledged,
});

const lesson = (i: number) => ({
  id: `l-${i}`,
  title: `Lesson ${i}`,
  status: "completed",
  segmentCount: 3,
  sourceType: "pdf",
  estimatedMinutes: 10,
  assignmentCount: 0,
  createdAt: "2026-10-01T00:00:00Z",
});

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  for (const fn of Object.values(api)) fn.mockReset();
  api.myClasses.mockResolvedValue([]);
  api.classStudents.mockResolvedValue([]);
});

describe("the attention flags", () => {
  it("reads every page, not the first", async () => {
    api.allFlags.mockResolvedValue({ flags: [flag("1"), flag("2")], complete: true });
    const { result } = renderHook(() => useTeacherFlags());

    await waitFor(() => expect(result.current.live).toBe(true));
    expect(api.allFlags).toHaveBeenCalled();
    expect(api.getFlags).not.toHaveBeenCalled();
    expect(result.current.complete).toBe(true);
  });

  it("says when the pages ran out with more still coming", async () => {
    api.allFlags.mockResolvedValue({ flags: [flag("1")], complete: false });
    const { result } = renderHook(() => useTeacherFlags());

    await waitFor(() => expect(result.current.live).toBe(true));
    expect(result.current.complete).toBe(false);
  });

  it("still leaves out the acknowledged ones", async () => {
    api.allFlags.mockResolvedValue({ flags: [flag("1"), flag("2", true)], complete: true });
    const { result } = renderHook(() => useTeacherFlags());

    await waitFor(() => expect(result.current.flags).toHaveLength(1));
  });
});

describe("the student directory", () => {
  it("reads every class's roster, the thirteenth included", async () => {
    const classes = Array.from({ length: 13 }, (_, i) => ({
      classId: `c-${i + 1}`,
      className: `Class ${i + 1}`,
    }));
    api.myClasses.mockResolvedValue(classes);
    api.classStudents.mockImplementation(async (classId: string) => [
      { studentId: `s-${classId}`, firstName: "Ada", lastName: classId, displayName: null },
    ]);
    const { result } = renderHook(() => useStudentDirectory());

    await waitFor(() => expect(result.current.students).toHaveLength(13));
    expect(api.classStudents).toHaveBeenCalledWith("c-13");
    expect(result.current.students.some((s) => s.className === "Class 13")).toBe(true);
  });
});

describe("the lesson library", () => {
  it("asks for the most the endpoint will return", async () => {
    api.lessonsList.mockResolvedValue([lesson(1)]);
    renderHook(() => useLessonLibrary());

    await waitFor(() => expect(api.lessonsList).toHaveBeenCalledWith({ limit: 200 }));
  });

  it("says it may be capped when a full page comes back", async () => {
    api.lessonsList.mockResolvedValue(Array.from({ length: 200 }, (_, i) => lesson(i)));
    const { result } = renderHook(() => useLessonLibrary());

    await waitFor(() => expect(result.current.live).toBe(true));
    expect(result.current.capped).toBe(true);
  });

  it("does not say so when the page was short", async () => {
    api.lessonsList.mockResolvedValue(Array.from({ length: 199 }, (_, i) => lesson(i)));
    const { result } = renderHook(() => useLessonLibrary());

    await waitFor(() => expect(result.current.live).toBe(true));
    expect(result.current.capped).toBe(false);
  });
});
