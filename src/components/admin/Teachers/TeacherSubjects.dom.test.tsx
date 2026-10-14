import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { TeacherDetail } from "@/lib/api/teachers";
import { TeacherSubjects } from "./TeacherSubjects";

/**
 * What a teacher teaches (9 Oct). D05's assign sheet offers only a teacher's
 * own subjects, so a teacher with none could not be assigned anywhere until
 * an admin could set them. The server refuses removing one still assigned.
 */

const setSubjects = vi.fn();
const listSubjects = vi.fn();

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      setSubjects: (id: string, names: string[]) => setSubjects(id, names),
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { list: () => listSubjects() } };
});

const SUBJECTS = [
  { id: "s-maths", name: "Mathematics", displayName: "Mathematics", origin: "canonical", reviewState: "kept" },
  { id: "s-fm", name: "Further Mathematics", displayName: "Further Mathematics", origin: "canonical", reviewState: "kept" },
  { id: "s-bio", name: "Biology", displayName: "Biology", origin: "canonical", reviewState: "kept" },
];

const TEACHER: TeacherDetail = {
  id: "t-1",
  name: "Funmi Adeyemi",
  email: "adeyemi.f@brightgate.edu.ng",
  status: "active",
  classIds: [],
  subjects: ["Mathematics"],
};

beforeEach(() => {
  vi.clearAllMocks();
  listSubjects.mockResolvedValue(SUBJECTS);
  setSubjects.mockResolvedValue([]);
});

describe("Subjects they teach", () => {
  it("saves the whole list by name, and re-reads the teacher", async () => {
    const onSaved = vi.fn();
    render(<TeacherSubjects teacher={TEACHER} editable onSaved={onSaved} />);
    expect(
      await screen.findByRole("list", { name: "Subjects Funmi Adeyemi teaches" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save subjects" })).toBeNull();

    fireEvent.change(await screen.findByRole("combobox", { name: "Add a subject" }), {
      target: { value: "s-fm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subjects" }));

    await waitFor(() =>
      expect(setSubjects).toHaveBeenCalledWith("t-1", ["Mathematics", "Further Mathematics"]),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("only offers subjects they don't already teach", async () => {
    render(<TeacherSubjects teacher={TEACHER} editable onSaved={vi.fn()} />);
    const add = await screen.findByRole("combobox", { name: "Add a subject" });
    await waitFor(() => expect(add.querySelectorAll("option").length).toBe(3));
    expect(Array.from(add.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Add a subject",
      "Further Mathematics",
      "Biology",
    ]);
  });

  it("shows the server's refusal to drop a subject still assigned, and keeps the draft", async () => {
    setSubjects.mockRejectedValue(
      new ApiError(422, "x", {
        detail: {
          code: "subject_still_assigned",
          message: "Funmi Adeyemi still teaches Mathematics to JSS 2A.",
        },
      }),
    );
    const { container } = render(<TeacherSubjects teacher={TEACHER} editable onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Mathematics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save subjects" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/still teaches Mathematics to JSS 2A\./),
    );
    expect(screen.queryByRole("button", { name: "Remove Mathematics" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save subjects" })).toBeEnabled();
  });

  it("names the subject when the refusal is the in-use code (14 Oct)", async () => {
    setSubjects.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: {
          code: "subject_in_use_by_assignment",
          message: "This teacher is still assigned to a class for that subject. Remove the assignment first.",
        },
      }),
    );
    const { container } = render(<TeacherSubjects teacher={TEACHER} editable onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Mathematics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save subjects" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /Funmi Adeyemi still teaches Mathematics to a class, so it stays on their list\. Give that class.s Mathematics to another teacher first, then remove it here\./,
      ),
    );
  });

  it("falls back to its own line when the server gives no reason", async () => {
    setSubjects.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<TeacherSubjects teacher={TEACHER} editable onSaved={vi.fn()} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Add a subject" }), {
      target: { value: "s-bio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subjects" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/That didn.t save\. Funmi Adeyemi.s subjects are as they were\./),
    );
  });

  it("says plainly when a teacher has none on record", async () => {
    const { container } = render(
      <TeacherSubjects teacher={{ ...TEACHER, subjects: undefined }} editable onSaved={vi.fn()} />,
    );
    await screen.findByRole("combobox", { name: "Add a subject" });
    expect(visibleText(container)).toMatch(/None on record yet\./);
  });

  it("reads only for a removed teacher or a paused school", async () => {
    render(<TeacherSubjects teacher={TEACHER} editable={false} onSaved={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Remove Mathematics" })).toBeDisabled();
  });
});
