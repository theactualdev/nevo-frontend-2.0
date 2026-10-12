import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentDetailView } from "./StudentDetailView";

/**
 * QA, 10 Oct: "← All students" was hard-coded, so a student opened from a
 * class sent the admin to the whole school's list. Back now returns to the
 * class the admin came from.
 */

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Amara",
        lastName: "Okafor",
        loginIdentifier: "amara.o",
        admissionNumber: null,
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: ["c-2a"],
        firstUse: false,
        consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      parentLinks: async () => [],
    },
  };
});
vi.mock("@/lib/api/classes", () => ({
  classesApi: {
    list: async () => [
      { id: "c-2a", name: "JSS 2A", yearGroup: "jss2", archivedAt: null, subjects: [] },
    ],
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/students/s1",
}));

describe("the student page's back link", () => {
  it("returns to the class the admin came from", async () => {
    render(<StudentDetailView studentId="s1" fromClassId="c-2a" />);
    const back = await screen.findByRole("link", { name: /JSS 2A/ });
    expect(back).toHaveAttribute("href", "/admin/classes/c-2a");
    expect(back.textContent).toMatch(/^←/);
  });

  it("goes to all students when opened from anywhere else", async () => {
    render(<StudentDetailView studentId="s1" />);
    const back = await screen.findByRole("link", { name: /All students/ });
    expect(back).toHaveAttribute("href", "/admin/students");
  });

  it("does not follow a class this school does not have", async () => {
    render(<StudentDetailView studentId="s1" fromClassId="someone-elses" />);
    expect(await screen.findByRole("link", { name: /All students/ })).toHaveAttribute(
      "href",
      "/admin/students",
    );
  });
});
