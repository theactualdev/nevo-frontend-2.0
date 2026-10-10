import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TeachersView } from "./TeachersView";

/**
 * The teacher list carries `classCount` since 8 Oct, so the Classes column
 * needs no read per row. A row an older answer sent without it still gets its
 * own read, so nothing goes uncounted.
 */

const teacherClasses = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      list: async () => [
        { id: "t1", name: "Folake Adeyemi", email: "f@school.edu.ng", status: "active", classCount: 4 },
        { id: "t2", name: "Bisi Bello", email: "b@school.edu.ng", status: "active" },
      ],
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, teacherClasses: (id: string) => teacherClasses(id) },
  };
});

describe("the Classes column", () => {
  it("takes the list's own count, and reads only the row that came without one", async () => {
    teacherClasses.mockResolvedValue([{}, {}]);
    render(<TeachersView />);
    await screen.findByText("Folake Adeyemi");
    await waitFor(() => expect(teacherClasses).toHaveBeenCalledTimes(1));
    expect(teacherClasses).toHaveBeenCalledWith("t2");
    await waitFor(() => expect(screen.getAllByText("4 classes").length).toBeGreaterThan(0));
    expect(screen.getAllByText("2 classes").length).toBeGreaterThan(0);
  });
});
