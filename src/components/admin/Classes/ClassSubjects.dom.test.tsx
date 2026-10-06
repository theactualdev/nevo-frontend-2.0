import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdminClass } from "@/lib/api/classes";
import { ClassSubjects } from "./ClassSubjects";
import { ClassFormSheet } from "./ClassFormSheet";

/**
 * A class's subjects (D05, SCRUM-194). Since a teacher can only be assigned a
 * subject the class takes, a class with none is a class nobody can teach -
 * so the list has to be settable where the admin meets that, and on create.
 */

const update = vi.fn();
const create = vi.fn();
const listSubjects = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      update: (id: string, body: unknown) => update(id, body),
      create: (body: unknown) => create(body),
      list: () => Promise.resolve([]),
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { list: () => listSubjects() } };
});

const SUBJECTS = [
  { id: "s-maths", name: "Mathematics", displayName: "Mathematics", origin: "canonical", reviewState: "approved" },
  { id: "s-eng", name: "English", displayName: "English Language", origin: "canonical", reviewState: "approved" },
  { id: "s-bio", name: "Biology", displayName: "Biology", origin: "canonical", reviewState: "approved" },
];

const KLASS: AdminClass = {
  id: "c-2a",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: ["Mathematics", "English"],
  studentCount: 30,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  listSubjects.mockResolvedValue(SUBJECTS);
  update.mockResolvedValue({ id: "c-2a", name: "JSS 2A" });
  create.mockResolvedValue({ id: "c-new", code: null });
});

describe("Subjects this class takes", () => {
  it("shows the school's spelling, and saves the whole list with name and year group", async () => {
    const onSaved = vi.fn();
    render(<ClassSubjects klass={KLASS} editable onSaved={onSaved} />);
    // The class stores "English"; the school list spells it "English Language".
    expect(await screen.findByRole("button", { name: "Remove English Language" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save subjects" })).toBeNull();

    fireEvent.change(await screen.findByRole("combobox", { name: "Add a subject" }), {
      target: { value: "s-bio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Mathematics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save subjects" }));

    await waitFor(() =>
      // Year group rides along: the PATCH clears it otherwise.
      expect(update).toHaveBeenCalledWith("c-2a", {
        name: "JSS 2A",
        yearGroup: "jss2",
        subjects: ["English", "Biology"],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("only offers subjects the class doesn't already take", async () => {
    render(<ClassSubjects klass={KLASS} editable onSaved={vi.fn()} />);
    const add = await screen.findByRole("combobox", { name: "Add a subject" });
    await waitFor(() => expect(add.querySelectorAll("option").length).toBe(2));
    expect(Array.from(add.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Add a subject",
      "Biology",
    ]);
  });

  it("says a refused save in the server's words, and keeps the draft", async () => {
    update.mockRejectedValue(
      new ApiError(422, "x", { detail: { code: "bad", message: "A class can take at most 20 subjects." } }),
    );
    const { container } = render(<ClassSubjects klass={KLASS} editable onSaved={vi.fn()} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Add a subject" }), {
      target: { value: "s-bio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subjects" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/A class can take at most 20 subjects\./));
    expect(screen.getByRole("button", { name: "Remove Biology" })).toBeInTheDocument();
  });

  it("offers a retry when the school's subject list can't be read", async () => {
    listSubjects.mockRejectedValue(new Error("down"));
    const { container } = render(<ClassSubjects klass={KLASS} editable onSaved={vi.fn()} />);
    await waitFor(() => expect(visibleText(container)).toMatch(/your school's subject list/));
  });

  it("reads only, for an archived class or a paused school", async () => {
    render(<ClassSubjects klass={KLASS} editable={false} onSaved={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Remove Mathematics" })).toBeDisabled();
  });
});

describe("Create a class", () => {
  it("asks for the subjects the class takes, not a teacher, and sends them", async () => {
    const onSaved = vi.fn();
    const { container } = render(<ClassFormSheet onClose={vi.fn()} onSaved={onSaved} />);
    // A teacher at create could only be refused: a new class takes no subjects.
    expect(visibleText(container)).not.toMatch(/Primary teacher/);
    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "JSS 3B" } });
    fireEvent.change(await screen.findByRole("combobox", { name: "Add a subject" }), {
      target: { value: "s-maths" },
    });
    expect(visibleText(container)).toMatch(/1 subject\. You can change these later from the class\./);
    fireEvent.click(screen.getByRole("button", { name: "Create class" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "JSS 3B", subjects: ["Mathematics"] })),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("c-new"));
  });
});
