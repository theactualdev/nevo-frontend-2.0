import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { withGate } from "@/test/setupGate";
import type { AdminClass } from "@/lib/api/classes";
import { ClassesView } from "./ClassesView";

/**
 * D24: "The rest of the console is reachable and visibly locked." Before
 * 28 Sep only the Overview paused anything, and the backend refuses none of
 * these writes - so a school in setup could build classes by hand while its
 * dashboard told it no changes were possible.
 */

const list = vi.fn();
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, list: () => list(), classTeachers: async () => [] },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const klass: AdminClass = {
  id: "a",
  name: "JSS 2A",
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
};

describe("Classes while setup is unfinished", () => {
  it("greys both ways to add a class, and says why", async () => {
    list.mockResolvedValue([klass]);
    const { container } = render(withGate(<ClassesView />, "not_active"));

    await waitFor(() => expect(screen.getByRole("button", { name: /Add a class/ })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Add several" })).toBeDisabled();
    expect(visibleText(container)).toMatch(/Paused until your school is active\./);
  });

  it("keeps the roster upload open from the empty state - it is how setup gets classes", async () => {
    list.mockResolvedValue([]);
    render(withGate(<ClassesView />, "not_active"));

    await waitFor(() => expect(screen.getByRole("button", { name: /Add a class/ })).toBeDisabled());
    expect(screen.getByRole("link", { name: /Create from a staff or student file/ })).toHaveAttribute(
      "href",
      "/admin/roster",
    );
  });

  it("pauses nothing, and says nothing, for a running school", async () => {
    list.mockResolvedValue([klass]);
    const { container } = render(withGate(<ClassesView />, null));

    await waitFor(() => expect(screen.getByRole("button", { name: /Add a class/ })).toBeEnabled());
    expect(visibleText(container)).not.toMatch(/Paused until/);
  });
});
