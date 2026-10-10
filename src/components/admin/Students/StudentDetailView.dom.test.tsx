import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { StudentDetailView } from "./StudentDetailView";

/**
 * A guardian read that FAILED must not render as a child with no guardian.
 *
 * This screen's own docblock says it is written to be shown TO A PARENT, and
 * the card states real absences in almost identical words - "No guardian on the
 * record. A parent account is created automatically once a guardian confirms
 * consent." A 500 used to produce that sentence about a child whose guardian is
 * on file, and nobody reading it could tell.
 *
 * It is the shape PR #218 fixed once on the SENCo profile and #269 fixed in
 * five more places. Those five shipped WITHOUT tests on a belief that a mocked
 * rejection could not be tested here. That belief was wrong - this file is the
 * proof - so the guards are being pinned retrospectively.
 */

const parentLinks = vi.fn();
let admission: string | null = "BGA/2026/014";

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
        admissionNumber: admission,
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: {
          status: "confirmed" as const,
          actorId: null,
          actorName: null,
          timestamp: null,
          channel: null,
        },
      }),
      parentLinks: () => parentLinks(),
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));


describe("StudentDetailView guardians", () => {
  it("does not report a failed guardian read as no guardian on record", async () => {
    parentLinks.mockRejectedValue(new Error("500"));
    const { container } = render(<StudentDetailView studentId="s1" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/couldn't read/i));
    expect(visibleText(container)).toMatch(/Amara's guardians/);
    expect(visibleText(container)).toMatch(/not a record that it's empty/i);
    // The claim itself must be ABSENT, not merely accompanied by a caveat.
    expect(visibleText(container)).not.toMatch(/No guardian on the record/);
  });

  it("still states a real absence when the read succeeds and is empty", async () => {
    parentLinks.mockResolvedValue([]);
    const { container } = render(<StudentDetailView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/No guardian on the record/),
    );
    expect(visibleText(container)).not.toMatch(/couldn't read/i);
  });
});

describe("StudentDetailView's Student ID (on the read since 8 Oct)", () => {
  it("shows the admission number the school typed at enrolment", async () => {
    admission = "BGA/2026/014";
    parentLinks.mockResolvedValue([]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Student ID \/ Admission Number/));
    expect(visibleText(container)).toMatch(/BGA\/2026\/014/);
  });

  it("says Not set for a child enrolled without one", async () => {
    admission = null;
    parentLinks.mockResolvedValue([]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Student ID \/ Admission Number Not set/));
  });
});
