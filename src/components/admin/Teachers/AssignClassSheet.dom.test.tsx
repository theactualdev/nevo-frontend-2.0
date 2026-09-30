import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass, AssignedClass, AssignedTeacher } from "@/lib/api/classes";
import { AssignClassSheet } from "./AssignClassSheet";
import { TeacherDetailView } from "./TeacherDetailView";

/**
 * SCRUM-40: "The same assignment can be made from either class or teacher
 * detail with identical copy." Teacher detail offered only a link back to
 * Classes. The sheet here is class detail's turned round, and the one thing it
 * must add is a read of the chosen class's teachers - without it, the
 * primary-conflict notice has nobody to name, and a Primary assigned blind
 * leaves the class with two.
 */

const classTeachers = vi.fn();
const createAssignment = vi.fn();
const reassign = vi.fn();
const teacherClasses = vi.fn();
const list = vi.fn();
let status = "active";

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      classTeachers: (id: string) => classTeachers(id),
      createAssignment: (body: unknown) => createAssignment(body),
      reassign: (id: string, body: unknown) => reassign(id, body),
      teacherClasses: () => teacherClasses(),
      list: () => list(),
    },
  };
});
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      get: async () => ({
        id: "t-adeyemi",
        name: "Folake Adeyemi",
        email: "f@school.edu.ng",
        status,
        classIds: [],
      }),
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const klass = (id: string, name: string, over: Partial<AdminClass> = {}): AdminClass => ({
  id,
  name,
  code: null,
  yearGroup: "jss2",
  source: null,
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

const CLASSES = [
  klass("c-2a", "JSS 2A"),
  klass("c-2b", "JSS 2B"),
  klass("c-old", "JSS 1C", { archivedAt: "2026-07-20T00:00:00Z" }),
  klass("c-sso", "JSS 3A", { source: "roster_sync" }),
];

const HELD: AssignedClass[] = [
  {
    assignmentId: "a-2b",
    classId: "c-2b",
    className: "JSS 2B",
    classCode: null,
    role: "co_teacher",
    assignedAt: "2026-09-01T00:00:00Z",
  },
];

const BELLO: AssignedTeacher = {
  assignmentId: "as-bello",
  teacherId: "t-bello",
  firstName: "Tunde",
  lastName: "Bello",
  email: "t@school.edu.ng",
  role: "primary",
  assignedAt: "2026-09-01T00:00:00Z",
};

const onAssigned = vi.fn();

function openSheet(held: AssignedClass[] = HELD) {
  return render(
    <AssignClassSheet
      teacher={{ id: "t-adeyemi", name: "Folake Adeyemi" }}
      classes={CLASSES}
      held={held}
      onClose={() => {}}
      onAssigned={onAssigned}
    />,
  );
}

const commit = () => screen.getByRole("button", { name: /^Assign (teacher|and make Primary)$/ });

beforeEach(() => {
  vi.clearAllMocks();
  status = "active";
  classTeachers.mockResolvedValue([]);
  createAssignment.mockResolvedValue(undefined);
  reassign.mockResolvedValue(undefined);
});

describe("assigning a class from a teacher's page", () => {
  it("offers only the classes class detail would let them be assigned to", () => {
    openSheet();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a class", "JSS 2A · JSS 2"]);
  });

  it("assigns a co-teacher with the class-side wording", async () => {
    const { container } = openSheet();
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c-2a" } });
    fireEvent.click(screen.getByRole("button", { name: /Co-teacher/ }));
    await waitFor(() => expect(commit()).not.toBeDisabled());
    expect(visibleText(container)).toMatch(/Role in this class/);

    fireEvent.click(commit());
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Folake Adeyemi added to JSS 2A/),
    );
    expect(classTeachers).toHaveBeenCalledWith("c-2a");
    expect(createAssignment).toHaveBeenCalledWith({
      teacherId: "t-adeyemi",
      classId: "c-2a",
      role: "co_teacher",
    });
  });

  it("names the class's current Primary before the commit, and hands over in two calls", async () => {
    classTeachers.mockResolvedValue([BELLO]);
    const { container } = openSheet();
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c-2a" } });
    fireEvent.click(screen.getByRole("button", { name: /Primary teacher/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Assign and make Primary" })).toBeInTheDocument(),
    );
    expect(visibleText(container)).toMatch(
      /Tunde Bello is the primary teacher for JSS 2A ?\. Making Folake Adeyemi primary moves Tunde Bello to co-teacher; they keep the class and their notes\./,
    );

    fireEvent.click(commit());
    await waitFor(() => expect(createAssignment).toHaveBeenCalled());
    expect(reassign).toHaveBeenCalledWith("as-bello", {
      newTeacherId: "t-adeyemi",
      role: "primary",
    });
    expect(createAssignment).toHaveBeenCalledWith({
      teacherId: "t-bello",
      classId: "c-2a",
      role: "co_teacher",
    });
  });

  it("will not commit until it knows who teaches the class, and retries a failed read", async () => {
    classTeachers.mockRejectedValueOnce(new Error("network")).mockResolvedValue([BELLO]);
    const { container } = openSheet();
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c-2a" } });
    fireEvent.click(screen.getByRole("button", { name: /Primary teacher/ }));

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(commit()).toBeDisabled();
    expect(visibleText(container)).not.toMatch(/is the primary teacher/);

    fireEvent.click(retry);
    await waitFor(() => expect(visibleText(container)).toMatch(/Tunde Bello is the primary teacher/));
    expect(commit()).not.toBeDisabled();
  });

  it("ignores a late answer for a class the admin has moved off", async () => {
    let answerFirst: (rows: AssignedTeacher[]) => void = () => {};
    classTeachers.mockImplementation((id: string) =>
      id === "c-2a"
        ? new Promise<AssignedTeacher[]>((r) => (answerFirst = r))
        : Promise.resolve([]),
    );
    const held: AssignedClass[] = [];
    const { container } = openSheet(held);
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c-2a" } });
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c-2b" } });
    fireEvent.click(screen.getByRole("button", { name: /Primary teacher/ }));
    await waitFor(() => expect(commit()).not.toBeDisabled());

    answerFirst([BELLO]);
    await new Promise((r) => setTimeout(r, 0));
    // JSS 2A's Primary is not JSS 2B's, and must not be named as though it were.
    expect(visibleText(container)).not.toMatch(/Tunde Bello/);
    expect(commit()).toHaveTextContent("Assign teacher");
  });
});

describe("the teacher's page", () => {
  beforeEach(() => {
    teacherClasses.mockResolvedValue([]);
    list.mockResolvedValue(CLASSES);
  });

  it("opens the sheet in place, rather than sending the admin back to Classes", async () => {
    render(<TeacherDetailView teacherId="t-adeyemi" />);
    fireEvent.click(await screen.findByRole("button", { name: /Assign to a class/ }));
    expect(screen.getByLabelText("Class")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Assign one from a class/ })).toBeNull();
  });

  it("offers no assignment for a teacher whose access has been removed", async () => {
    status = "deactivated";
    const { container } = render(<TeacherDetailView teacherId="t-adeyemi" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/access has been removed/));
    expect(screen.queryByRole("button", { name: /Assign to a class/ })).toBeNull();
  });
});
