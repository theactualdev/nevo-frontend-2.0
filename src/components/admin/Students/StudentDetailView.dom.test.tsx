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
let consentStatus: "confirmed" | "pending" | "not_sent" | "withdrawn" = "confirmed";

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
          status: consentStatus,
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
// The child's look comes from their class roster (#1055's useChildLook).
vi.mock("@/lib/api/classes", () => ({
  classesApi: { list: async () => [], classStudents: async () => [] },
}));
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

/**
 * SCRUM-327 and the 12 Nov dry run. A guardian row and a consent record are
 * separate on the server, so a confirmed child can have no guardian row - and
 * the card said "{Name} can't start until a parent or guardian gives
 * permission" beside "Consent is recorded… Confirmed" on a child who had
 * learned all morning. And before the read answered, it said "No guardian on
 * the record" about a child it hadn't asked about yet.
 */
describe("StudentDetailView's guardian card says only what is true", () => {
  it("claims nothing about guardians until the read answers", async () => {
    consentStatus = "confirmed";
    parentLinks.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Consent is recorded for Amara/));
    expect(visibleText(container)).not.toMatch(/No guardian on the record/);
    expect(visibleText(container)).not.toMatch(/can't start/);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("never says a confirmed child can't start", async () => {
    consentStatus = "confirmed";
    parentLinks.mockResolvedValue([]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No guardian on the record/));
    expect(visibleText(container)).not.toMatch(/can't start/);
  });

  it("nor a child whose parent withdrew - the consent card has the words for that", async () => {
    consentStatus = "withdrawn";
    parentLinks.mockResolvedValue([]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No guardian on the record/));
    expect(visibleText(container)).not.toMatch(/until a parent or guardian gives permission/);
  });

  it("still says it while consent is outstanding", async () => {
    for (const s of ["pending", "not_sent"] as const) {
      consentStatus = s;
      parentLinks.mockResolvedValue([]);
      const { container, unmount } = render(<StudentDetailView studentId="s1" />);
      await waitFor(() =>
        expect(visibleText(container)).toMatch(
          /Amara can't start until a parent or guardian gives permission\./,
        ),
      );
      unmount();
    }
    consentStatus = "confirmed";
  });

  it("keeps the name and the next word in one text node, so no reader can join them", async () => {
    consentStatus = "pending";
    parentLinks.mockResolvedValue([]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No guardian on the record/));
    const nodes = [...container.querySelectorAll("p, span")].flatMap((e) =>
      [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? ""),
    );
    expect(nodes).toContain("Amara can’t start until a parent or guardian gives permission. ");
    expect(nodes.some((n) => n.startsWith("How Amara is getting on isn’t shown here."))).toBe(true);
    consentStatus = "confirmed";
  });
});
