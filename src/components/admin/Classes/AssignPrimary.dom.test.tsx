import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AssignedTeacher } from "@/lib/api/classes";
import { AssignTeacherSheet } from "./AssignTeacherSheet";

/**
 * "Making Mr. Bello primary moves Ms. Adeyemi to co-teacher; she keeps the
 * class and her notes." The sheet said that, then sent one create with role
 * primary - so the class ended up with two primaries, and the sentence the
 * admin read was not what the button did.
 */

const list = vi.fn();
const reassign = vi.fn();
const createAssignment = vi.fn();

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, list: () => list() } };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      reassign: (id: string, body: unknown) => reassign(id, body),
      createAssignment: (body: unknown) => createAssignment(body),
    },
  };
});

const ADEYEMI: AssignedTeacher = {
  assignmentId: "as-1",
  teacherId: "t-adeyemi",
  firstName: "Folake",
  lastName: "Adeyemi",
  email: "f@school.edu.ng",
  role: "primary",
  assignedAt: "2026-09-01T00:00:00Z",
};

const onAssigned = vi.fn();

async function makePrimary(assigned: AssignedTeacher[]) {
  const r = render(
    <AssignTeacherSheet
      classId="c1"
      className="JSS 2A"
      classSubtitle="Year 8"
      assigned={assigned}
      onClose={() => {}}
      onAssigned={onAssigned}
    />,
  );
  await waitFor(() => expect(screen.getByRole("option", { name: /Tunde Bello/ })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Teacher"), { target: { value: "t-bello" } });
  fireEvent.click(screen.getByRole("button", { name: /Primary teacher/ }));
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([
    { id: "t-adeyemi", name: "Folake Adeyemi", email: "f@school.edu.ng", status: "active" },
    { id: "t-bello", name: "Tunde Bello", email: "t@school.edu.ng", status: "active" },
  ]);
  reassign.mockResolvedValue(undefined);
  createAssignment.mockResolvedValue(undefined);
});

describe("making somebody primary when the class has one", () => {
  it("hands the primary slot over, then keeps the old primary as co-teacher", async () => {
    await makePrimary([ADEYEMI]);
    fireEvent.click(screen.getByRole("button", { name: /Assign and make Primary/ }));

    await waitFor(() => expect(createAssignment).toHaveBeenCalled());
    expect(reassign).toHaveBeenCalledWith("as-1", { newTeacherId: "t-bello", role: "primary" });
    expect(createAssignment).toHaveBeenCalledWith({
      teacherId: "t-adeyemi",
      classId: "c1",
      role: "co_teacher",
    });
    // Never a second create with role primary - that is the two-primaries bug.
    expect(createAssignment).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: "primary" }),
    );
  });

  it("says which half happened when keeping the old primary fails", async () => {
    createAssignment.mockRejectedValueOnce(new Error("500"));
    const { container } = await makePrimary([ADEYEMI]);
    fireEvent.click(screen.getByRole("button", { name: /Assign and make Primary/ }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Tunde Bello is now primary for JSS 2A/),
    );
    expect(visibleText(container)).toMatch(/couldn.t keep Folake Adeyemi on as co-teacher/);

    // Try again redoes only the half that failed.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(2));
    expect(reassign).toHaveBeenCalledTimes(1);
  });

  it("changes nobody else when the class has no primary", async () => {
    await makePrimary([]);
    fireEvent.click(screen.getByRole("button", { name: /Assign teacher/ }));

    await waitFor(() =>
      expect(createAssignment).toHaveBeenCalledWith({
        teacherId: "t-bello",
        classId: "c1",
        role: "primary",
      }),
    );
    expect(reassign).not.toHaveBeenCalled();
  });
});
