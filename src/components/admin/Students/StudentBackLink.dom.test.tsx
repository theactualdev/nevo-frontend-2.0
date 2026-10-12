import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentDetailView } from "./StudentDetailView";

/**
 * QA, 10 Oct: "← All students" was hard-coded, so a student opened from a
 * class sent the admin to the whole school's list. Back now returns to
 * wherever the admin came from - see `back.ts`.
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
        consent: { status: "pending", actorId: null, actorName: null, timestamp: null, channel: null },
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
  it("returns to wherever the admin came from", async () => {
    render(<StudentDetailView studentId="s1" back={{ href: "/admin/classes/c-2a", label: "JSS 2A" }} />);
    const back = await screen.findByRole("link", { name: /JSS 2A/ });
    expect(back).toHaveAttribute("href", "/admin/classes/c-2a");
    expect(back.textContent).toMatch(/^←/);
  });

  it("goes to all students when the page was opened any other way", async () => {
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByRole("link", { name: /All students/ })).toHaveAttribute(
      "href",
      "/admin/students",
    );
  });

  it("carries the way back through to the written-consent page", async () => {
    // Student -> consent form -> Cancel lands on the student page as the
    // admin left it, whose own Back still returns to the class.
    render(<StudentDetailView studentId="s1" back={{ href: "/admin/classes/c-2a", label: "JSS 2A" }} />);
    const record = await screen.findByRole("link", { name: /Record a signed paper form/ });
    const url = new URL(record.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/admin/students/s1/consent");
    const backHref = url.searchParams.get("back")!;
    expect(url.searchParams.get("backLabel")).toBe("Amara Okafor");
    const student = new URL(backHref, "http://x");
    expect(student.pathname).toBe("/admin/students/s1");
    expect(student.searchParams.get("back")).toBe("/admin/classes/c-2a");
    expect(student.searchParams.get("backLabel")).toBe("JSS 2A");
  });
});
