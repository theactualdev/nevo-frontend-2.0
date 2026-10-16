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
/** The chosen teacher's record - unread by default, so the whole list shows. */
const getTeacher = vi.fn();
const reassign = vi.fn();
const update = vi.fn();
const listTeachers = vi.fn();
const listSubjects = vi.fn();
const addTeacherSubject = vi.fn();

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
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      list: () => listTeachers(),
      get: (id: string) => getTeacher(id),
      addSubject: (id: string, name: string) => addTeacherSubject(id, name),
    },
  };
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
  getTeacher.mockRejectedValue(new Error("unread"));
  reassign.mockResolvedValue({});
  update.mockResolvedValue({ id: "c-2c", name: "JSS 2C" });
  addTeacherSubject.mockResolvedValue([MATHS]);
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

describe("D05's Teaches, from the teacher's record (8 Oct)", () => {
  const pickTeacher = async () =>
    fireEvent.change(await screen.findByRole("combobox", { name: "Teacher" }), {
      target: { value: "t-bello" },
    });

  it("states a single subject and makes it the pick", async () => {
    getTeacher.mockResolvedValue({ id: "t-bello", name: "Bisi Bello", subjects: ["Mathematics"] });
    fromClass();
    await pickTeacher();
    await waitFor(() => expect(said(document.body)).toMatch(/Teaches Mathematics/));
    expect(screen.queryByLabelText("2 · Subject", { selector: "select" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Co-teacher/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 1 class" }));
    await waitFor(() =>
      expect(createAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: "t-bello", schoolSubjectId: "sub-maths" }),
      ),
    );
  });

  it("offers a choice between several, and only those", async () => {
    getTeacher.mockResolvedValue({ id: "t-bello", name: "Bisi Bello", subjects: ["Mathematics", "Biology"] });
    fromClass(undefined, vi.fn());
    await pickTeacher();
    const group = await screen.findByRole("radiogroup", { name: "2 · Subject" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(within(group).getByRole("radio", { name: "Mathematics" }));
    expect(within(group).getByRole("radio", { name: "Mathematics" })).toHaveAttribute("aria-checked", "true");
  });

  it("falls back to the school's whole list when the teacher has none on record", async () => {
    getTeacher.mockResolvedValue({ id: "t-bello", name: "Bisi Bello", subjects: [] });
    fromClass(undefined, vi.fn());
    await pickTeacher();
    await waitFor(() => expect(screen.getByRole("option", { name: "Biology" })).toBeInTheDocument());
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  /*
   * 16 Oct: "assign a teacher doesn't work sometimes". A teacher with no
   * subjects on record was offered the whole list, and the server refused
   * every pick (`subject_not_on_teacher`) with nothing to do about it.
   */
  it("says a subject the teacher doesn't teach can't be assigned yet, and adds it to them when asked - then it assigns", async () => {
    getTeacher.mockResolvedValue({ id: "t-bello", name: "Bisi Bello", subjects: [] });
    const { container } = fromClass(undefined, vi.fn());
    await pickTeacher();
    await waitFor(() => expect(screen.getByRole("option", { name: "Mathematics" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("2 · Subject"), { target: { value: "sub-maths" } });
    fireEvent.click(screen.getByRole("button", { name: /^Co-teacher/ }));

    expect(said(container)).toMatch(
      /Bisi Bello doesn't teach Mathematics yet, so it can't be assigned\. Add Mathematics to Bisi Bello's subjects and it's ready\./,
    );
    expect(screen.getByRole("button", { name: "Assign Mathematics to 1 class" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add Mathematics to Bisi Bello’s subjects" }));
    expect(said(container)).toMatch(/It joins the subjects they teach\. Nothing else about them changes\./);
    fireEvent.click(screen.getByRole("button", { name: "Add Mathematics" }));

    await waitFor(() => expect(addTeacherSubject).toHaveBeenCalledWith("t-bello", "Mathematics"));
    await waitFor(() =>
      expect(said(container)).toMatch(/Mathematics added to Bisi Bello's subjects\. Your other choices are as you left them\./),
    );
    // Their one subject now: D05's "Teaches Mathematics", already the pick.
    expect(said(container)).toMatch(/Teaches Mathematics/);
    fireEvent.click(screen.getByRole("button", { name: "Assign Mathematics to 1 class" }));
    await waitFor(() =>
      expect(createAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: "t-bello", schoolSubjectId: "sub-maths" }),
      ),
    );
  });

  it("says so in the server's words when the subject can't be added to the teacher", async () => {
    getTeacher.mockResolvedValue({ id: "t-bello", name: "Bisi Bello", subjects: [] });
    addTeacherSubject.mockRejectedValue(
      new ApiError(422, "x", { detail: { code: "bad", message: "A teacher can hold at most 12 subjects." } }),
    );
    const { container } = fromClass(undefined, vi.fn());
    await pickTeacher();
    await waitFor(() => expect(screen.getByRole("option", { name: "Biology" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("2 · Subject"), { target: { value: "sub-bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Biology to Bisi Bello’s subjects" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Biology" }));
    await waitFor(() => expect(said(container)).toMatch(/A teacher can hold at most 12 subjects\./));
    expect(createAssignment).not.toHaveBeenCalled();
  });
});

describe("a teacher who hasn't joined yet (16 Oct)", () => {
  it("is listed greyed with the reason, and a removed teacher isn't listed at all", async () => {
    // The server assigns an active teacher only; an invited one was refused
    // as "The requested teacher was not found."
    listTeachers.mockResolvedValue([
      { id: "t-bello", name: "Bisi Bello", email: "b@school.edu.ng", status: "active" },
      { id: "t-new", name: "Invited Teacher", email: "n@school.edu.ng", status: "invited" },
      { id: "t-gone", name: "Gone Teacher", email: "g@school.edu.ng", status: "deactivated" },
    ]);
    const { container } = fromClass(undefined, vi.fn());
    const invited = await screen.findByRole("option", { name: "Invited Teacher (invited, not yet joined)" });
    expect(invited).toBeDisabled();
    expect(screen.getByRole("option", { name: "Bisi Bello" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: /Gone Teacher/ })).toBeNull();
    expect(said(container)).toMatch(/A teacher you've invited can be assigned once they've joined\./);
  });
});
