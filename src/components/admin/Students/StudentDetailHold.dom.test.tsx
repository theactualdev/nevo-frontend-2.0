import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { held } = vi.hoisted(() => ({ held: vi.fn() }));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Tunde",
        lastName: "Adeyemi",
        loginIdentifier: "tunde.a",
        admissionNumber: null,
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: { status: "confirmed" as const, actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      parentLinks: async () => [],
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("@/lib/api/ageChecks", () => ({ ageChecksApi: { held } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { StudentDetailView } from "./StudentDetailView";

/**
 * D07b, fixed in 96cd4b4: a child held for a date of birth check is ON HOLD,
 * not "Active and learning normally" - the frame's old reading contradicted
 * the hold in production. The page points at the checks rather than
 * describing the hold in its own words, and never shows the parent's date.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a student held for a date of birth check", () => {
  it("reads On hold, and points at the checks, with a way back here", async () => {
    held.mockResolvedValue([{ id: "ac1", studentId: "s1", blocksAccess: true }]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("On hold")).toBeInTheDocument();
    expect(container.textContent).toMatch(
      /Tunde’s date of birth differs from the one the parent gave, so this account is on hold and hasn’t started yet\. The parent’s date is never shown\./,
    );
    expect(screen.getByRole("link", { name: "Date of birth checks" }).getAttribute("href")).toBe(
      "/admin/students/date-of-birth?back=%2Fadmin%2Fstudents%2Fs1&backLabel=Tunde",
    );
  });

  it("is the ordinary status for a child who isn't held", async () => {
    held.mockResolvedValue([{ id: "ac2", studentId: "s-other", blocksAccess: true }]);
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("On hold")).toBeNull();
    expect(screen.queryByRole("link", { name: "Date of birth checks" })).toBeNull();
  });

  it("asserts no hold when the checks can't be read", async () => {
    held.mockRejectedValue(new Error("down"));
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("On hold")).toBeNull();
  });
});
