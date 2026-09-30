import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { TeacherDetailView } from "./TeacherDetailView";

/**
 * A deactivated teacher's page offered "Remove admin-side access" again, and
 * both it and the removal sheet promised "you can restore access later" -
 * the contract has `POST /teachers/{id}/revoke` and nothing that undoes it.
 */

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      get: async () => ({
        id: "t1",
        name: "Folake Adeyemi",
        email: "f@school.edu.ng",
        status: "deactivated",
        classIds: [],
      }),
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

describe("a deactivated teacher's page", () => {
  it("says access is removed instead of offering to remove it again", async () => {
    const { container } = render(<TeacherDetailView teacherId="t1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/console access has been removed/));
    expect(screen.queryByRole("button", { name: /Remove admin-side access/ })).toBeNull();
    expect(visibleText(container)).not.toMatch(/restore access/i);
  });
});
