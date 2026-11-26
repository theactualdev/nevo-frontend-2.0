import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AdminClass } from "@/lib/api/classes";
import { SetupGateContext, type SetupPause } from "@/context/SetupGateContext";
import { ClassDetailView } from "./ClassDetailView";

/**
 * N8 (Lydia, 11 Nov): a class is renamed "in the roster itself after
 * Confirm". Between Confirm and activation the school's writes are paused
 * (D24), but Edit class is not: T18 (Teslim 2e55663) means a rename there no
 * longer splits the class at activation. Everything else stays paused, and an
 * unconfirmed address still pauses Edit class too (D01b AC-05).
 */

const klass: AdminClass = {
  id: "c1",
  name: "JSS2 Blue",
  code: "JSS2B",
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 24,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      get: async () => klass,
      classTeachers: async () => [],
      classStudents: async () => [],
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/classes/c1",
}));

const gate = (pause: SetupPause | null) =>
  function Gate({ children }: { children: ReactNode }) {
    return (
      <SetupGateContext.Provider
        value={{
          writesPaused: pause !== null,
          pause,
          resolved: true,
          email: "head@school.edu.ng",
          onboarding: null,
          loading: false,
          refresh: () => {},
        }}
      >
        {children}
      </SetupGateContext.Provider>
    );
  };

describe("Edit class after Confirm (N8)", () => {
  it("is open while the school waits to be active, and the rest of the page stays paused", async () => {
    render(<ClassDetailView classId="c1" />, { wrapper: gate("not_active") });
    expect(await screen.findByRole("button", { name: "Edit class" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Assign a teacher" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive this class" })).toBeDisabled();
  });

  it("stays paused while the address is unconfirmed", async () => {
    render(<ClassDetailView classId="c1" />, { wrapper: gate("email_unconfirmed") });
    expect(await screen.findByRole("button", { name: "Edit class" })).toBeDisabled();
  });

  it("is open once the school is active, as before", async () => {
    render(<ClassDetailView classId="c1" />, { wrapper: gate(null) });
    expect(await screen.findByRole("button", { name: "Edit class" })).not.toBeDisabled();
  });
});
