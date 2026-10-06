import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdminClass, AssignedClass, AssignedTeacher } from "@/lib/api/classes";
import { AssignTeachingSheet } from "./AssignTeachingSheet";

/**
 * D05 "Assign a teacher" since SCRUM-194: teacher, subject, classes, role.
 *
 * Every assignment now carries a subject, and the server refuses one without
 * (`subject_required`) - which is what broke both doors in production. These
 * pin that the subject is sent, that a class not taking it cannot be ticked
 * until it is added, that each class's outcome is its own, and that making
 * somebody primary demotes the old primary IN PLACE (keeping their subject)
 * before the new one is created.
 */

const listClasses = vi.fn();
const classTeachers = vi.fn();
const teacherClasses = vi.fn();
const createAssignment = vi.fn();
const reassign = vi.fn();
const update = vi.fn();
const listTeachers = vi.fn();
const listSubjects = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: () => listClasses(),
      classTeachers: (id: string) => classTeachers(id),
      teacherClasses: (id: string) => teacherClasses(id),
      createAssignment: (body: unknown) => createAssignment(body),
      reassign: (id: string, body: unknown) => reassign(id, body),
      update: (id: string, body: unknown) => update(id, body),
    },
  };
});
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, list: () => listTeachers() } };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { list: () => listSubjects() } };
});

const klass = (id: string, name: string, over: Partial<AdminClass> = {}): AdminClass => ({
  id,
  name,
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: ["Mathematics"],
  studentCount: 20,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
  ...over,
});

const MATHS = { id: "sub-maths", name: "Mathematics", displayName: "Mathematics", origin: "canonical", reviewState: "approved" };
const BIO = { id: "sub-bio", name: "Biology", displayName: "Biology", origin: "canonical", reviewState: "approved" };

const C2A = klass("c-2a", "JSS 2A");
const C2B = klass("c-2b", "JSS 2B");
const C2C = klass("c-2c", "JSS 2C", { subjects: ["English"] });
const CLASSES = [C2A, C2B, C2C, klass("c-old", "JSS 1C", { archivedAt: "2026-07-20T00:00:00Z" })];

const ADEYEMI: AssignedTeacher = {
  assignmentId: "a-adeyemi",
  teacherId: "t-adeyemi",
  firstName: "Folake",
  lastName: "Adeyemi",
  email: "f@school.edu.ng",
  role: "primary",
  assignedAt: "2026-09-01T00:00:00Z",
};

const onAssigned = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  listClasses.mockResolvedValue(CLASSES);
  listSubjects.mockResolvedValue([MATHS, BIO]);
  listTeachers.mockResolvedValue([
    { id: "t-bello", name: "Bisi Bello", email: "b@school.edu.ng", status: "active" },
  ]);
  teacherClasses.mockResolvedValue([]);
  classTeachers.mockResolvedValue([]);
  createAssignment.mockResolvedValue({});
  reassign.mockResolvedValue({});
  update.mockResolvedValue({ id: "c-2c", name: "JSS 2C" });
});

// A fresh callback can be passed: a successful assign schedules onAssigned a
// moment later, which would otherwise land in the next test.
const fromClass = (assigned: AssignedTeacher[] = [], done = onAssigned) =>
  render(
    <AssignTeachingSheet
      door={{ kind: "class", klass: C2A, assigned }}
      onClose={vi.fn()}
      onAssigned={done}
    />,
  );

const choose = async (subject = "Mathematics") => {
  fireEvent.change(await screen.findByRole("combobox", { name: "Teacher" }), {
    target: { value: "t-bello" },
  });
  await waitFor(() => expect(screen.getByRole("option", { name: subject })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("2 · Subject"), {
    target: { value: subject === "Biology" ? "sub-bio" : "sub-maths" },
  });
};
/** The sentence as a reader sees it: pieces joined as rendered, curly apostrophes straightened. */
const said = (el: HTMLElement) =>
  (el.textContent ?? "").replace(/’/g, "'").replace(/\s+/g, " ");
const row = (name: string) => screen.getByText(name, { selector: "span" }).closest("li") as HTMLElement;

describe("the subject is part of every assignment", () => {
  it("sends the chosen subject's id with the teacher, class and role", async () => {
    fromClass();
    await choose();
    fireEvent.click(screen.getByRole("button", { name: /^Co-teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 1 class" }));
    await waitFor(() =>
      expect(createAssignment).toHaveBeenCalledWith({
        teacherId: "t-bello",
        classId: "c-2a",
        role: "co_teacher",
        schoolSubjectId: "sub-maths",
      }),
    );
  });

  it("assigns one subject to several ticked classes, one call each", async () => {
    fromClass();
    await choose();
    fireEvent.click(within(row("JSS 2B")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Co-teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 2 classes" }));
    await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(2));
    expect(createAssignment.mock.calls.map((c) => (c[0] as { classId: string }).classId)).toEqual([
      "c-2a",
      "c-2b",
    ]);
  });

  it("never offers an archived class", async () => {
    fromClass();
    await choose();
    expect(screen.queryByText("JSS 1C")).toBeNull();
  });
});

describe("a class that doesn't take the subject", () => {
  it("can't be ticked, says why, and adds the subject when asked - then it can", async () => {
    const { container } = fromClass();
    await choose();
    const c = row("JSS 2C");
    expect(within(c).getByRole("checkbox")).toBeDisabled();
    expect(said(c)).toMatch(/JSS 2C doesn't take Mathematics, so it can't be assigned here yet/);

    fireEvent.click(within(c).getByRole("button", { name: "Add Mathematics to JSS 2C" }));
    expect(said(c)).toMatch(/It joins the class's 1 subject\. Nothing else about the class changes\./);
    fireEvent.click(within(c).getByRole("button", { name: "Add Mathematics" }));

    await waitFor(() =>
      // Name and year group ride along, or the PATCH clears the year group.
      expect(update).toHaveBeenCalledWith("c-2c", {
        name: "JSS 2C",
        yearGroup: "jss2",
        subjects: ["English", "Mathematics"],
      }),
    );
    await waitFor(() =>
      expect(said(container)).toMatch(
        /Mathematics added to JSS 2C\. Your other choices are as you left them\./,
      ),
    );
    expect(within(row("JSS 2C")).getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Assign Mathematics to 2 classes" })).toBeInTheDocument();
  });

  it("says so in the server's words when the subject can't be added", async () => {
    update.mockRejectedValue(
      new ApiError(422, "x", { detail: { code: "bad", message: "That subject name is too long." } }),
    );
    fromClass();
    await choose();
    fireEvent.click(within(row("JSS 2C")).getByRole("button", { name: "Add Mathematics to JSS 2C" }));
    fireEvent.click(within(row("JSS 2C")).getByRole("button", { name: "Add Mathematics" }));
    await waitFor(() => expect(visibleText(row("JSS 2C"))).toMatch(/That subject name is too long\./));
  });
});

describe("each class's outcome is its own", () => {
  it("shows a refusal beside its class, and Try again retries only that class", async () => {
    createAssignment.mockImplementation((b: { classId: string }) =>
      b.classId === "c-2b"
        ? Promise.reject(
            new ApiError(422, "x", {
              detail: {
                code: "subject_not_on_teacher",
                message: "That subject is not on this teacher's list.",
              },
            }),
          )
        : Promise.resolve({}),
    );
    const done = vi.fn();
    const { container } = fromClass([], done);
    await choose();
    fireEvent.click(within(row("JSS 2B")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Co-teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 2 classes" }));

    await waitFor(() =>
      expect(visibleText(row("JSS 2B"))).toMatch(/That subject is not on this teacher's list\./),
    );
    expect(visibleText(container)).toMatch(/Some of that went through/);
    expect(done).not.toHaveBeenCalled();

    createAssignment.mockClear();
    createAssignment.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));
    expect((createAssignment.mock.calls[0][0] as { classId: string }).classId).toBe("c-2b");
  });
});

describe("making somebody primary where the class has one", () => {
  it("names who moves, and demotes them in place before creating the new primary", async () => {
    const { container } = fromClass([ADEYEMI]);
    await choose();
    fireEvent.click(screen.getByRole("button", { name: /^Primary teacher/ }));
    expect(said(container)).toMatch(
      /Folake Adeyemi is the primary teacher for JSS 2A\. Making Bisi Bello primary moves Folake Adeyemi to co-teacher; they keep the class and their notes\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 1 class" }));

    await waitFor(() => expect(createAssignment).toHaveBeenCalled());
    // Her own assignment, back to her, as co-teacher: she keeps her subject.
    expect(reassign).toHaveBeenCalledWith("a-adeyemi", {
      newTeacherId: "t-adeyemi",
      role: "co_teacher",
    });
    expect(reassign.mock.invocationCallOrder[0]).toBeLessThan(
      createAssignment.mock.invocationCallOrder[0],
    );
    expect(createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: "t-bello", role: "primary", schoolSubjectId: "sub-maths" }),
    );
  });

  it("says the class has no primary when the second half fails, and retries only that half", async () => {
    createAssignment.mockRejectedValueOnce(new ApiError(500, "x"));
    fromClass([ADEYEMI]);
    await choose();
    fireEvent.click(screen.getByRole("button", { name: /^Primary teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 1 class" }));
    await waitFor(() =>
      expect(said(row("JSS 2A"))).toMatch(
        /Folake Adeyemi is now co-teacher for JSS 2A, but making Bisi Bello primary didn't go through/,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(2));
    // Not demoted twice.
    expect(reassign).toHaveBeenCalledTimes(1);
  });
});

describe("the reads behind it", () => {
  it("says nothing about the staff while they load, and offers a retry when the read fails", async () => {
    let fail!: (e: unknown) => void;
    listTeachers.mockReturnValue(new Promise((_, r) => (fail = r)));
    const { container } = fromClass();
    expect(visibleText(container)).toMatch(/Looking up your staff/);
    expect(visibleText(container)).not.toMatch(/No staff to assign yet/);
    fail(new Error("down"));
    await waitFor(() => expect(visibleText(container)).toMatch(/your staff list/));
  });

  it("offers a retry when the school's subject list can't be read", async () => {
    listSubjects.mockRejectedValue(new Error("down"));
    const { container } = fromClass();
    await waitFor(() => expect(visibleText(container)).toMatch(/your school's subject list/));
  });
});

describe("from the teacher's page", () => {
  it("fixes the teacher and leaves out the classes they already hold", async () => {
    const held: AssignedClass[] = [
      { assignmentId: "a", classId: "c-2b", className: "JSS 2B", classCode: null, role: "co_teacher", assignedAt: "2026-09-01T00:00:00Z" },
    ];
    render(
      <AssignTeachingSheet
        door={{ kind: "teacher", teacher: { id: "t-bello", name: "Bisi Bello" }, held }}
        classes={CLASSES}
        onClose={vi.fn()}
        onAssigned={onAssigned}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Teacher" })).toBeNull();
    expect(screen.getByText("Bisi Bello")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("option", { name: "Mathematics" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("2 · Subject"), { target: { value: "sub-maths" } });
    expect(screen.getByText("JSS 2A", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("JSS 2B", { selector: "span" })).toBeNull();
  });
});
