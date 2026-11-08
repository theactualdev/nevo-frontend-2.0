import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { myClasses, classStudents } = vi.hoisted(() => ({
  myClasses: vi.fn(),
  classStudents: vi.fn(),
}));
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, myClasses, classStudents } };
});

import { useStudentDirectory } from "./useStudentDirectory";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * SCRUM-317: the directory every teacher picker reads carries each child's
 * avatar, from their class roster row, in the interim order the hub set -
 * `avatarTone`, then shape and colourway, then the nothing-chosen look - and
 * no initials at all.
 */

const student = (studentId: string, over: Record<string, unknown> = {}) => ({
  studentId,
  firstName: "Amara",
  lastName: studentId,
  displayName: `Amara ${studentId}`,
  loginIdentifier: null,
  status: "active",
  ...over,
});

beforeEach(() => {
  clearSession();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  myClasses.mockReset().mockResolvedValue([
    { assignmentId: "a-1", classId: "c-1", className: "JSS 2A", classCode: null, role: "primary", assignedAt: "2026-10-01T00:00:00Z", subject: null },
  ]);
  classStudents.mockReset().mockResolvedValue([
    student("s-1", { avatarTone: "star-near_black", avatarShape: "circle", avatarColourway: "navy" }),
    student("s-2", { avatarShape: "diamond", avatarColourway: "cream_elevated" }),
    student("s-3", { avatarTone: "navy" }),
  ]);
});

describe("the student directory's looks", () => {
  it("reads each child's look off their roster row, and keeps no initials", async () => {
    const { result } = renderHook(() => useStudentDirectory());
    await waitFor(() => expect(result.current.students).toHaveLength(3));

    expect(result.current.students.map((s) => s.look.id)).toEqual([
      // The child's own kept choice wins.
      "star-near_black",
      // Otherwise the server's shape and colourway.
      "diamond-cream_elevated",
      // An old colour-only id is no choice: the nothing-chosen look.
      "circle-navy",
    ]);
    expect(result.current.students[0]).not.toHaveProperty("initials");
  });
});
