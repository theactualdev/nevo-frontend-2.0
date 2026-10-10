import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { TeacherDetailView } from "./TeacherDetailView";

/**
 * A deactivated teacher's page offered "Remove admin-side access" again. And
 * since 8 Oct `POST /teachers/{id}/restore` exists, so the page offers the
 * undo it once could not promise.
 */

const restore = vi.fn();
const get = vi.fn();

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      get: () => get(),
      restore: (id: string) => restore(id),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, teacherClasses: async () => [], list: async () => [] },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const REMOVED = {
  id: "t1",
  name: "Folake Adeyemi",
  email: "f@school.edu.ng",
  status: "deactivated",
  classIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(REMOVED);
  restore.mockResolvedValue(undefined);
});

describe("a deactivated teacher's page", () => {
  it("says access is removed instead of offering to remove it again", async () => {
    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/console access has been removed/));
    expect(screen.queryByRole("button", { name: /Remove admin-side access/ })).toBeNull();
  });

  it("offers Restore access, restores, and reads the teacher again", async () => {
    render(<TeacherDetailView teacherId="t1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore access" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("says why when the restore is refused, in the server's words", async () => {
    restore.mockRejectedValue(
      new ApiError(409, "conflict", { detail: { code: "x", message: "This teacher's account is closed." } }),
    );
    const { container } = render(<TeacherDetailView teacherId="t1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore access" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/This teacher's account is closed\./));
  });
});

describe("last active (8 Oct)", () => {
  it("draws D06's third card and the header's line", async () => {
    get.mockResolvedValue({ ...REMOVED, status: "active", lastActiveAt: new Date().toISOString() });
    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Last active/));
    expect(visibleText(container)).toMatch(/Today/);
    expect(visibleText(container)).toMatch(/Teacher · Active today/);
  });

  it("leaves the card off when there is no timestamp", async () => {
    get.mockResolvedValue({ ...REMOVED, status: "active" });
    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Students/));
    expect(visibleText(container)).not.toMatch(/Last active/);
  });
});
