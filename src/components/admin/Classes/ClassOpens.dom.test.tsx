import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { visibleText } from "@/test/visibleText";
import { ClassDetailView } from "./ClassDetailView";

/**
 * "WHY ARE NONE OF THE CLASSES IN THE CLASSES TAB LOADING WHEN CLICKED ON?"
 * (Olayinka's TO-DO item 5, 24 Nov.)
 *
 * The class page read its students from `GET /classes/{id}/students` - the
 * teacher console's roster. The backend guards it with the teacher scope,
 * which no admin holds, and since 6b5d4968 (29 Oct) with an assignment to the
 * class as well, so every admin was refused. The three reads were one
 * `Promise.all`, so that refusal took the whole class down: "No access", for
 * every class, for every admin. e2e only ever opened the list, never a class.
 *
 * The teacher route below refuses exactly as the live one does; the page must
 * open regardless, from the admin's own list.
 */

const h = vi.hoisted(() => ({ list: vi.fn(), classStudents: vi.fn() }));

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      get: async () => ({
        id: "c1", name: "JSS 2A", code: null, yearGroup: "jss2",
        source: null, subjects: [], studentCount: 1, archivedAt: null,
      }),
      classTeachers: async () => [],
      classStudents: (id: string) => h.classStudents(id),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: (o: unknown) => h.list(o) } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const CHISOM = {
  id: "s1", name: "Chisom Eze", loginIdentifier: "chisom", admissionNumber: null,
  status: "active", ageBand: null,
  consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
};

beforeEach(() => {
  h.list.mockReset().mockResolvedValue([CHISOM]);
  // The live teacher roster, as it answers an admin.
  h.classStudents
    .mockReset()
    .mockRejectedValue(new ApiError(403, "Forbidden", { detail: "Missing permission scope" }));
});

describe("an admin opening a class", () => {
  it("opens it, with its students, though the teacher console's roster refuses admins", async () => {
    const { container } = render(<ClassDetailView classId="c1" />);

    expect(await screen.findByRole("heading", { name: "JSS 2A" })).toBeInTheDocument();
    await waitFor(() => expect(visibleText(container)).toMatch(/Chisom Eze/));
    expect(visibleText(container)).not.toMatch(/You don.t have access|couldn.t load this class/);
    expect(screen.getByRole("link", { name: /Chisom Eze/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/admin\/students\/s1\?/),
    );
  });

  it("reads the students from the admin's own list, never the teacher console's", async () => {
    render(<ClassDetailView classId="c1" />);
    await screen.findByRole("heading", { name: "JSS 2A" });
    await waitFor(() => expect(h.list).toHaveBeenCalledWith({ classId: "c1" }));
    expect(h.classStudents).not.toHaveBeenCalled();
  });

  it("says a lost student list in its own section, and the class still opens", async () => {
    h.list.mockRejectedValueOnce(new ApiError(500, "down"));
    const { container } = render(<ClassDetailView classId="c1" />);

    expect(await screen.findByRole("heading", { name: "JSS 2A" })).toBeInTheDocument();
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t read this class.s students just now/),
    );
    // Never an empty class: the lost read is not "Nobody is enrolled".
    expect(visibleText(container)).not.toMatch(/Nobody is enrolled/);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Chisom Eze/));
    expect(h.list).toHaveBeenCalledTimes(2);
  });
});
