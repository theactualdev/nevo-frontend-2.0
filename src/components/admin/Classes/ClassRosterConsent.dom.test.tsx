import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ClassDetailView } from "./ClassDetailView";

/**
 * The consent pill on each of a class's students, from the admin's own student
 * list (`GET /students?classId=`), whose `consent` is REQUIRED - the same row
 * and the same pill as the Students screen. (It came from the teacher console's
 * class roster until 25 Nov, which no admin may read; see `ClassOpens`.)
 */

const list = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      get: async () => ({
        id: "c1", name: "JSS 2A", code: null, yearGroup: "jss2",
        source: null, subjects: [], studentCount: 2, archivedAt: null,
      }),
      classTeachers: async () => [],
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: (o: unknown) => list(o) } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const student = (id: string, name: string, status: string | null) => ({
  id,
  name: `${name} Eze`,
  loginIdentifier: name.toLowerCase(),
  admissionNumber: null,
  status: "active",
  ageBand: null,
  consent: status
    ? { status, actorId: null, actorName: null, timestamp: null, channel: null }
    : null,
});

describe("class roster consent", () => {
  it("shows each student's consent", async () => {
    list.mockResolvedValue([
      student("s1", "Chisom", "confirmed"),
      student("s2", "Amara", "pending"),
    ]);

    const { container } = render(<ClassDetailView classId="c1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Chisom Eze/));

    expect(visibleText(container)).toMatch(/Confirmed/);
    expect(visibleText(container)).toMatch(/Pending/);
  });

  it("renders Unknown rather than Not sent when a row carries none", async () => {
    // The roster's rule, applied here too: an absent consent is not a record
    // that nobody asked.
    list.mockResolvedValue([student("s1", "Chisom", null)]);

    const { container } = render(<ClassDetailView classId="c1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Chisom Eze/));

    expect(visibleText(container)).toMatch(/Unknown/);
    expect(visibleText(container)).not.toMatch(/Not sent/);
  });
});
