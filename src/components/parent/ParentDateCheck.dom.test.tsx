import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { AgeCheck } from "@/lib/api/ageChecks";

const { myChildren, parentChecks, parentReconfirm, search } = vi.hoisted(() => ({
  myChildren: vi.fn(),
  parentChecks: vi.fn(),
  parentReconfirm: vi.fn(),
  search: { value: "" },
}));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker on the parent module.
vi.mock("@/lib/api/parent", () => ({ parentApi: { myChildren } }));
vi.mock("@/lib/api/ageChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ageChecks")>();
  return { ...actual, ageChecksApi: { parent: parentChecks, parentReconfirm } };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

import { ParentDateCheck, isoFrom } from "./ParentDateCheck";

/**
 * D01d Parent Date Check (SCRUM-243). One date, asked plainly: no documents,
 * no identity number, nobody accused - and the school's date never shown.
 */

const CHILD = {
  studentId: "s-amara",
  firstName: "Amara",
  lastName: "Okafor",
  status: "active",
  schoolId: "sc-1",
  schoolName: "Corona Secondary School",
};

const check = (over: Partial<AgeCheck> = {}): AgeCheck => ({
  id: "ac-amara",
  studentId: "s-amara",
  studentFirstName: "Amara",
  schoolDateOfBirth: "2013-03-14",
  state: "mismatch",
  differs: true,
  blocksAccess: true,
  enrolledAgeBand: "11_13",
  holdReasons: [],
  schoolNotifiedAt: "2026-10-20T10:00:00Z",
  deletionDueAt: "2026-11-19T10:00:00Z",
  schoolRecheckedAt: "2026-10-21T09:00:00Z",
  parentReconfirmedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  search.value = "child=s-amara";
  myChildren.mockResolvedValue([CHILD]);
  parentChecks.mockResolvedValue([check()]);
  parentReconfirm.mockResolvedValue(check({ parentReconfirmedAt: "2026-10-21T12:00:00Z" }));
});

const enter = (day: string, month: string, year: string) => {
  fireEvent.change(screen.getByLabelText("Day"), { target: { value: day } });
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: month } });
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: year } });
};

describe("the ask", () => {
  it("asks for one date, plainly, and never shows the school's", async () => {
    const { container } = render(<ParentDateCheck />);
    expect(
      await screen.findByRole("heading", { name: "Can you confirm Amara’s date of birth?" }),
    ).toBeInTheDocument();
    expect(container.textContent).toMatch(/Amara’s account isn’t active yet\. Once the two dates agree, Amara can get started\./);
    // Not the school's date, in any form; and no proof is asked for.
    expect(container.textContent).not.toMatch(/14 March 2013|2013-03-14|March 2013/);
    expect(container.textContent).not.toMatch(/document|identity|passport|certificate|proof/i);
  });

  it("sends the date and thanks the parent", async () => {
    render(<ParentDateCheck />);
    await screen.findByRole("heading", { name: /Can you confirm/ });
    enter("3", "September", "2014");
    fireEvent.click(screen.getByRole("button", { name: "Confirm date of birth" }));
    await waitFor(() => expect(parentReconfirm).toHaveBeenCalledWith("ac-amara", "2014-09-03"));
    expect(await screen.findByRole("heading", { name: "Thank you - we’ve got that." })).toBeInTheDocument();
  });

  it("won't send a date that doesn't exist", async () => {
    render(<ParentDateCheck />);
    await screen.findByRole("heading", { name: /Can you confirm/ });
    enter("31", "February", "2014");
    expect(screen.getByRole("button", { name: "Confirm date of birth" })).toBeDisabled();
  });

  it("says the link has closed, with the school's name, when the deadline has passed", async () => {
    parentReconfirm.mockRejectedValue(new ApiError(410, "Gone", { detail: { code: "age_check_expired" } }));
    render(<ParentDateCheck />);
    await screen.findByRole("heading", { name: /Can you confirm/ });
    enter("3", "September", "2014");
    fireEvent.click(screen.getByRole("button", { name: "Confirm date of birth" }));
    expect(await screen.findByRole("heading", { name: "This link has closed." })).toBeInTheDocument();
    expect(screen.getByText("Corona Secondary School")).toBeInTheDocument();
  });
});

describe("the other states", () => {
  it("before the school has checked, says it's checking first rather than offering a form", async () => {
    parentChecks.mockResolvedValue([check({ schoolRecheckedAt: null })]);
    render(<ParentDateCheck />);
    expect(await screen.findByRole("heading", { name: "Amara’s school is checking first" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm date of birth" })).toBeNull();
  });

  it("once the parent has given it, says thank you rather than asking again", async () => {
    parentChecks.mockResolvedValue([check({ parentReconfirmedAt: "2026-10-21T12:00:00Z" })]);
    render(<ParentDateCheck />);
    expect(await screen.findByRole("heading", { name: "Thank you - we’ve got that." })).toBeInTheDocument();
  });

  it("after the hold has cleared, says it's already sorted", async () => {
    parentChecks.mockResolvedValue([check({ blocksAccess: false, state: "resolved" })]);
    render(<ParentDateCheck />);
    expect(await screen.findByRole("heading", { name: "This is already sorted." })).toBeInTheDocument();
    expect(screen.getByText(/Amara is all set\./)).toBeInTheDocument();
  });

  it("always offers the way home", async () => {
    render(<ParentDateCheck />);
    expect(await screen.findByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/parent-portal");
  });
});

describe("isoFrom", () => {
  it("builds a real date or nothing", () => {
    expect(isoFrom("3", "September", "2014")).toBe("2014-09-03");
    expect(isoFrom("31", "February", "2014")).toBeNull();
    expect(isoFrom("", "September", "2014")).toBeNull();
    expect(isoFrom("3", "", "2014")).toBeNull();
    expect(isoFrom("3", "September", "14")).toBeNull();
  });
});
