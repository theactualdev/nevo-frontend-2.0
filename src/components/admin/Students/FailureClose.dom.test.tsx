import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass, AssignedClass } from "@/lib/api/classes";
import { MoveStudentSheet } from "./MoveStudentSheet";
import { EraseRecordModal } from "./EraseRecordModal";
import { BulkClassSheet } from "../Classes/BulkClassSheet";
import { RemoveAccessSheet } from "../Teachers/RemoveAccessSheet";

/**
 * SCRUM-40: a failed write offers "Primary 'Try again', secondary 'Close'".
 * Six of the console's sheets offered only Try again, so the one way out of a
 * failure was to succeed. Each is pinned here, with the sheet's own close.
 */

const moveToClass = vi.fn();
const erase = vi.fn();
const createMany = vi.fn();
const revoke = vi.fn();

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      moveToClass: () => moveToClass(),
      erase: () => erase(),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: async () => [klass("c1", "JSS 1A", "jss1")],
      createMany: () => createMany(),
    },
  };
});
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: { ...actual.teachersApi, list: async () => [], revoke: () => revoke() },
  };
});

function klass(id: string, name: string, yearGroup: string, studentCount = 20): AdminClass {
  return {
    id,
    name,
    code: null,
    yearGroup,
    source: null,
    subjects: [],
    studentCount,
    section: null,
    academicSession: null,
    capacity: null,
    teacherCount: 0,
    teachers: [],
    archivedAt: null,
  };
}

const TEACHER = {
  id: "t1",
  name: "Folake Adeyemi",
  email: "f@school.edu.ng",
  status: "active" as const,
  classIds: [],
};

const HELD: AssignedClass[] = [
  {
    assignmentId: "a1",
    classId: "c2",
    className: "JSS 2A",
    classCode: null,
    role: "co_teacher",
    assignedAt: "2026-09-01T00:00:00Z",
  },
];

const closeAfterFailure = async (onClose: ReturnType<typeof vi.fn>) => {
  await screen.findByRole("button", { name: "Try again" });
  // The footer's Close, not the header's × (which is also named Close).
  const footerClose = screen
    .getAllByRole("button", { name: "Close" })
    .find((b) => b.textContent?.trim() === "Close");
  expect(footerClose).toBeTruthy();
  fireEvent.click(footerClose!);
  expect(onClose).toHaveBeenCalled();
};

beforeEach(() => vi.clearAllMocks());

describe("a failed write can be closed, not only retried", () => {
  it("moving a student", async () => {
    moveToClass.mockRejectedValue(new Error("500"));
    const onClose = vi.fn();
    const { container } = render(
      <MoveStudentSheet
        studentId="s1"
        studentName="Amara Obi"
        currentClass={klass("c1", "JSS 1A", "jss1")}
        classes={[klass("c1", "JSS 1A", "jss1"), klass("c2", "JSS 1B", "jss1")]}
        onClose={onClose}
        onMoved={() => {}}
      />,
    );
    fireEvent.change(container.querySelector("#move-dest")!, { target: { value: "c2" } });
    fireEvent.click(screen.getByRole("button", { name: "Move Amara" }));
    await closeAfterFailure(onClose);
  });

  it("erasing a record", async () => {
    erase.mockRejectedValue(new Error("500"));
    const onClose = vi.fn();
    const { container } = render(
      <EraseRecordModal studentId="s1" studentName="Amara Obi" onClose={onClose} onErased={() => {}} />,
    );
    fireEvent.change(container.querySelector("#erase-confirm")!, { target: { value: "Amara Obi" } });
    fireEvent.click(screen.getByRole("button", { name: "Erase this record" }));
    await closeAfterFailure(onClose);
  });

  it("adding several classes", async () => {
    createMany.mockRejectedValue(new Error("500"));
    const onClose = vi.fn();
    render(<BulkClassSheet onClose={onClose} onCreated={() => {}} />);
    const row = await screen.findByRole("group", { name: "JSS 1" });
    // B, because JSS 1A already exists and would not be sent.
    fireEvent.click(within(row).getByRole("button", { name: "B" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Create 1 class$/ }));
    await closeAfterFailure(onClose);
  });

  it("removing a teacher's access", async () => {
    revoke.mockRejectedValue(new Error("500"));
    const onClose = vi.fn();
    render(
      <RemoveAccessSheet teacher={TEACHER} held={[]} onClose={onClose} onRemoved={() => {}} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove access" }));
    await closeAfterFailure(onClose);
    // Nothing moved, and the parent is told so.
    expect(onClose).toHaveBeenCalledWith(false);
  });
});

describe("the hand-over rows", () => {
  it("say which class each one is, as D06b does", async () => {
    const { container } = render(
      <RemoveAccessSheet
        teacher={TEACHER}
        held={HELD}
        classes={[klass("c2", "JSS 2A", "jss2", 34)]}
        onClose={() => {}}
        onRemoved={() => {}}
      />,
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/JSS 2 · 34 students/));
  });

  it("show no meta for a class the page could not see", async () => {
    const { container } = render(
      <RemoveAccessSheet teacher={TEACHER} held={HELD} onClose={() => {}} onRemoved={() => {}} />,
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/JSS 2A/));
    expect(visibleText(container)).not.toMatch(/students/);
  });
});
