import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { SchoolSettings } from "./SchoolSettings";

/**
 * School settings are senior-only since 13 Oct (backend `bb59b37`): every
 * save here is `PATCH /school`, which answers 403 `senior_admin_required` to a
 * standard admin. That is a refusal, not a failure - no "try again" - and an
 * admin known to be standard is told before they type.
 */

const { get, update, saveContact, saveAcademic } = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  saveAcademic: vi.fn(),
}));

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: () => get(),
      update: (p: unknown) => update(p),
      saveContact: (p: unknown) => saveContact(p),
      saveAcademic: (p: unknown) => saveAcademic(p),
    },
  };
});

const SCHOOL = {
  id: "sch1",
  name: "Brightgate Academy",
  code: "BRG-1",
  retentionPolicy: "contract",
  retentionDays: 365,
  profile: {},
  academicConfig: {},
};

const REFUSED = new ApiError(403, "Forbidden", {
  detail: { code: "senior_admin_required", message: "A senior administrator manages school settings." },
});
const SENIOR_LINE = /Only a senior administrator can change your school.s settings/;

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(SCHOOL);
  update.mockResolvedValue(SCHOOL);
  saveContact.mockResolvedValue(SCHOOL);
  saveAcademic.mockResolvedValue(SCHOOL);
});

describe("school settings for a standard admin", () => {
  it("says up front who can change them, and switches the fields and Saves off", async () => {
    render(<SchoolSettings accessLevel="standard" />);
    expect(await screen.findByText(SENIOR_LINE)).toBeInTheDocument();
    expect(screen.getByLabelText("School name")).toBeDisabled();
    for (const save of screen.getAllByRole("button", { name: "Save changes" })) {
      expect(save).toBeDisabled();
    }
  });

  it("points at the founding administrator, who is senior", async () => {
    render(<SchoolSettings accessLevel="standard" />);
    expect(await screen.findByText(/marked Founding in Admin Team/)).toBeInTheDocument();
  });
});

describe("school settings for a senior admin", () => {
  it("are as they always were", async () => {
    render(<SchoolSettings accessLevel="senior" />);
    expect(await screen.findByLabelText("School name")).toBeEnabled();
    expect(screen.queryByText(SENIOR_LINE)).toBeNull();
  });
});

describe("a refusal when the level wasn't known", () => {
  it("is said as a refusal, not a failure to retry", async () => {
    update.mockRejectedValue(REFUSED);
    render(<SchoolSettings />);
    const name = await screen.findByLabelText("School name");
    fireEvent.change(name, { target: { value: "Brightgate College" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    expect(await screen.findByText(SENIOR_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/didn.t save/i)).toBeNull();
    await waitFor(() => expect(screen.getByLabelText("School name")).toBeDisabled());
  });

  it("from the calendar's Save too", async () => {
    saveAcademic.mockRejectedValue(REFUSED);
    render(<SchoolSettings />);
    await screen.findByLabelText("School name");
    fireEvent.change(screen.getByLabelText(/Year starts/i), { target: { value: "2026-09-01" } });
    // In page order: General, Data retention, Academic year.
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[2]);
    expect(await screen.findByText(SENIOR_LINE)).toBeInTheDocument();
  });

  it("leaves any other failure as a failure", async () => {
    update.mockRejectedValue(new ApiError(500, "Server error"));
    render(<SchoolSettings />);
    const name = await screen.findByLabelText("School name");
    fireEvent.change(name, { target: { value: "Brightgate College" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(screen.queryByText(SENIOR_LINE)).toBeNull();
    expect(screen.getByLabelText("School name")).toBeEnabled();
  });
});
