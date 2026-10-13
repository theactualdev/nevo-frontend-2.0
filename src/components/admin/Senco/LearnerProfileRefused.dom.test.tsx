import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { LearnerProfileView } from "./LearnerProfileView";

/**
 * QA, 10 Oct: "We couldn't read Ada's adaptation history … Try again" over a
 * read that was REFUSED. A 403 is a permission decision; retrying cannot
 * grant it - the rule #685 applied across the rest of the console.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/senco/s1",
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Ada",
        lastName: "Obi",
        loginIdentifier: "NV-1",
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      accommodations: async () => null,
      mastery: async () => [],
      adaptations: async () => {
        throw new ApiError(403, "Forbidden");
      },
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: async () => [] } };
});

describe("a refused section on the learner profile", () => {
  it("says the admin has no access, and offers no retry", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() =>
      // `visibleText` joins text nodes with a space: "Ada 's".
      expect(visibleText(container)).toMatch(/You don.t have access to Ada\s?.s adaptation history/),
    );
    expect(visibleText(container)).not.toMatch(/couldn.t read Ada\s?.s adaptation history/);
    // The other sections read fine and say nothing about access.
    expect(visibleText(container)).not.toMatch(/access to Ada\s?.s concept record/);
  });
});
