import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { AgeCheck } from "@/lib/api/ageChecks";

const { held, schoolRecheck, getStudent, listClasses } = vi.hoisted(() => ({
  held: vi.fn(),
  schoolRecheck: vi.fn(),
  getStudent: vi.fn(),
  listClasses: vi.fn(),
}));

vi.mock("@/lib/api/ageChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ageChecks")>();
  return { ...actual, ageChecksApi: { held, schoolRecheck } };
});
vi.mock("@/lib/api/students", () => ({ studentsApi: { get: getStudent } }));
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: listClasses } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/students/date-of-birth",
}));

import { DobHoldView } from "./DobHoldView";

/**
 * D30 Date of birth checks (SCRUM-243 as rewritten 20 Oct). The school sees
 * its own date - never the parent's - the one thing to do, and when the
 * record is removed. Whether a hold can clear is the server's `clearable`
 * (live 21 Oct), read as sent.
 */

const check = (over: Partial<AgeCheck> = {}): AgeCheck => ({
  id: "ac-tunde",
  studentId: "s-tunde",
  studentFirstName: "Tunde",
  schoolDateOfBirth: "2013-03-14",
  state: "mismatch",
  differs: true,
  blocksAccess: true,
  enrolledAgeBand: "11_13",
  holdReasons: ["reconfirmation_required"],
  schoolNotifiedAt: "2026-10-20T10:00:00Z",
  deletionDueAt: "2026-11-19T10:00:00Z",
  schoolRecheckedAt: null,
  parentReconfirmedAt: null,
  clearable: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  held.mockResolvedValue([check()]);
  getStudent.mockResolvedValue({ id: "s-tunde", firstName: "Tunde", lastName: "Adeyemi", classIds: ["c-2a"] });
  listClasses.mockResolvedValue([{ id: "c-2a", name: "JSS 2A" }]);
});

const card = async () => (await screen.findByText("Tunde Adeyemi")).closest("li") as HTMLElement;

describe("nothing waiting", () => {
  it("says so plainly, with what will happen when something does", async () => {
    held.mockResolvedValue([]);
    render(<DobHoldView />);
    expect(
      await screen.findByRole("heading", { name: "No accounts are waiting on a date of birth" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All students/ })).toHaveAttribute("href", "/admin/students");
  });
});

describe("a hold waiting on the school", () => {
  it("shows the school's own date, never the parent's, and when the record is removed", async () => {
    render(<DobHoldView />);
    const c = await card();
    expect(within(c).getByText("JSS 2A")).toBeInTheDocument();
    expect(within(c).getByText("On hold · date of birth difference")).toBeInTheDocument();
    expect(within(c).getByText("14 March 2013")).toBeInTheDocument();
    expect(within(c).getByText("The parent’s date is not shown.")).toBeInTheDocument();
    expect(c).toHaveTextContent("If this isn’t resolved, Tunde’s record is removed on 19 November 2026.");
    // No count of days: the server sends the date, not a number.
    expect(c.textContent).not.toMatch(/days? (from today|left)/);
  });

  it("confirms the date as it stands, then says it's waiting on the parent", async () => {
    schoolRecheck.mockResolvedValue(check({ schoolRecheckedAt: "2026-10-21T09:00:00Z" }));
    render(<DobHoldView />);
    fireEvent.click(within(await card()).getByRole("button", { name: "This date is correct" }));
    await waitFor(() => expect(schoolRecheck).toHaveBeenCalledWith("ac-tunde", "2013-03-14"));
    expect(await screen.findByRole("heading", { name: "You’ve confirmed Tunde’s date of birth" })).toBeInTheDocument();
    expect(screen.getByText(/Not active yet - waiting on the parent\. Record removed on 19 November 2026 if unresolved\./)).toBeInTheDocument();
  });

  it("corrects it in place with the re-check, and says what the record now reads", async () => {
    schoolRecheck.mockResolvedValue(
      check({ schoolDateOfBirth: "2014-09-03", schoolRecheckedAt: "2026-10-21T09:00:00Z" }),
    );
    render(<DobHoldView />);
    const c = await card();
    fireEvent.click(within(c).getByRole("button", { name: "Correct it" }));
    fireEvent.change(within(c).getByLabelText("Tunde’s date of birth"), { target: { value: "2014-09-03" } });
    fireEvent.click(within(c).getByRole("button", { name: "Save the corrected date" }));
    await waitFor(() => expect(schoolRecheck).toHaveBeenCalledWith("ac-tunde", "2014-09-03"));
    expect(await screen.findByRole("heading", { name: "You’ve updated Tunde’s date of birth" })).toBeInTheDocument();
    expect(screen.getByText(/Your record now reads 3 September 2014\./)).toBeInTheDocument();
  });
});

describe("whether it can clear is the server's to say", () => {
  it("when the server says it can't clear, drops the confirm and says so plainly", async () => {
    held.mockResolvedValue([check({ clearable: false })]);
    render(<DobHoldView />);
    const c = await card();
    expect(within(c).getByText("On hold · needs a correction")).toBeInTheDocument();
    expect(within(c).queryByRole("button", { name: "This date is correct" })).toBeNull();
    expect(c).toHaveTextContent(
      "As things stand, Tunde’s account won’t activate on either date. Confirming the date above won’t change that. Correcting your admissions record is what can.",
    );
    expect(within(c).getByRole("button", { name: "Correct it" })).toBeInTheDocument();
  });

  it("when the server says it can clear, is the ordinary re-check, and claims nothing more", async () => {
    held.mockResolvedValue([check({ clearable: true })]);
    render(<DobHoldView />);
    const c = await card();
    expect(within(c).getByRole("button", { name: "This date is correct" })).toBeInTheDocument();
    expect(within(c).getByRole("button", { name: "Correct it" })).toBeInTheDocument();
    expect(c.textContent).not.toMatch(/won.t activate/);
  });
});

describe("refusals", () => {
  it("says a closed check is closed", async () => {
    schoolRecheck.mockRejectedValue(new ApiError(410, "Gone", { detail: { code: "age_check_expired" } }));
    render(<DobHoldView />);
    fireEvent.click(within(await card()).getByRole("button", { name: "This date is correct" }));
    expect(await screen.findByText("This check has closed, so the date can’t be changed here.")).toBeInTheDocument();
  });

  it("reads the list again when the hold has already gone", async () => {
    schoolRecheck.mockRejectedValue(new ApiError(409, "Conflict", { detail: { code: "age_check_not_pending" } }));
    render(<DobHoldView />);
    fireEvent.click(within(await card()).getByRole("button", { name: "This date is correct" }));
    await waitFor(() => expect(held).toHaveBeenCalledTimes(2));
  });
});

describe("waiting on the parent", () => {
  it("tells the school it has done its part", async () => {
    held.mockResolvedValue([check({ schoolRecheckedAt: "2026-10-21T09:00:00Z" })]);
    render(<DobHoldView />);
    expect(await screen.findByText(/You’ve done your part on these\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This date is correct" })).toBeNull();
  });

  it("goes back to the school once the parent has given the date and it still holds", async () => {
    held.mockResolvedValue([
      check({ schoolRecheckedAt: "2026-10-21T09:00:00Z", parentReconfirmedAt: "2026-10-21T12:00:00Z" }),
    ]);
    render(<DobHoldView />);
    expect(within(await card()).getByRole("button", { name: "Correct it" })).toBeInTheDocument();
  });
});
