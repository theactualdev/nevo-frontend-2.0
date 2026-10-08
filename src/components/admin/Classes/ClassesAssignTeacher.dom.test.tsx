import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import { ClassesView } from "./ClassesView";

/**
 * "Assign a teacher", ruled by Lydia on 7 Oct: "It is a control, and a control
 * says what pressing it does." The class list said "No teacher yet" - a state
 * - inside a row that was itself one button, so the words promised nothing and
 * pressing them opened the class. Now the class name opens the class and the
 * control opens the assign sheet, two siblings; where nothing can be assigned
 * (archived, or owned by a provider's sync) the plain state stays.
 */

const list = vi.fn();
const push = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: (includeArchived?: boolean) => list(includeArchived),
      classTeachers: async () => [],
    },
  };
});

vi.mock("@/lib/api/sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sso")>();
  return { ...actual, ssoApi: { ...actual.ssoApi, status: async () => null } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

// The sheet has its own tests; here it only has to open, for the right class.
vi.mock("./AssignTeachingSheet", () => ({
  AssignTeachingSheet: ({ door }: { door: { kind: string; klass: AdminClass } }) => (
    <div role="dialog" aria-label={`Assign a teacher to ${door.klass.name}`} />
  ),
}));

const klass = (id: string, over: Partial<AdminClass> = {}): AdminClass => ({
  id,
  name: `JSS 2${id}`,
  code: null,
  yearGroup: "jss2",
  source: "manual",
  subjects: [],
  studentCount: 20,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a class with nobody teaching it", () => {
  it("offers 'Assign a teacher', which opens the sheet for that class and does not leave the list", async () => {
    list.mockResolvedValue([klass("A")]);
    render(<ClassesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign a teacher" }));

    expect(screen.getByRole("dialog", { name: "Assign a teacher to JSS 2A" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText("No teacher yet")).toBeNull();
  });

  it("still opens the class from its name", async () => {
    list.mockResolvedValue([klass("A")]);
    render(<ClassesView />);

    fireEvent.click(await screen.findByRole("button", { name: /^JSS 2A/ }));
    expect(push).toHaveBeenCalledWith("/admin/classes/A");
  });

  it("keeps the plain state where nothing can be assigned from here", async () => {
    list.mockResolvedValue([
      klass("B", { source: "roster_sync" }),
      klass("C", { archivedAt: "2026-09-01T00:00:00Z" }),
    ]);
    render(<ClassesView />);

    expect((await screen.findAllByText("No teacher yet")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Assign a teacher" })).toBeNull();
  });

  it("names who teaches a class that has someone", async () => {
    list.mockResolvedValue([
      klass("D", { teachers: [{ id: "t1", name: "Ms. Adeyemi", role: "primary" }], teacherCount: 1 }),
    ]);
    render(<ClassesView />);

    expect(await screen.findByText("Ms. Adeyemi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign a teacher" })).toBeNull();
  });
});
