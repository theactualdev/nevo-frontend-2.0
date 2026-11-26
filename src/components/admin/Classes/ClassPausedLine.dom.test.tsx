import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AdminClass } from "@/lib/api/classes";
import { SetupGateContext, type SetupPause } from "@/context/SetupGateContext";
import { ClassDetailView } from "./ClassDetailView";

/**
 * L57 (Lydia, 25 Nov): before the school is active, "Paused until your school
 * is active." sat under the class header - beside an Edit class that is
 * pressable then (N8). It moves down to the first section that IS paused,
 * Subjects, in the same words. While the header's own action is paused (an
 * unconfirmed address), it stays under the header.
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
// Class detail reads its students as an admin on a check 19 branch; answered
// here too, so this test stands either way.
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: async () => [] } };
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

/** The box holding the Subjects heading. */
const subjectsHeading = () =>
  screen.getByText("Subjects this class takes").parentElement as HTMLElement;

describe("the class page's paused line (L57)", () => {
  it("sits under Subjects, not the header, while Edit class is pressable before activation", async () => {
    render(<ClassDetailView classId="c1" />, { wrapper: gate("not_active") });
    expect(await screen.findByRole("button", { name: "Edit class" })).not.toBeDisabled();
    const lines = screen.getAllByText("Paused until your school is active.");
    expect(lines).toHaveLength(1);
    expect(subjectsHeading()).toContainElement(lines[0]);
  });

  it("stays under the header while the header's Edit class is paused too", async () => {
    render(<ClassDetailView classId="c1" />, { wrapper: gate("email_unconfirmed") });
    expect(await screen.findByRole("button", { name: "Edit class" })).toBeDisabled();
    expect(subjectsHeading().textContent).toBe("Subjects this class takes");
  });

  it("is nowhere once the school is active", async () => {
    render(<ClassDetailView classId="c1" />, { wrapper: gate(null) });
    await screen.findByRole("button", { name: "Edit class" });
    expect(screen.queryByText(/Paused until/)).toBeNull();
  });
});
