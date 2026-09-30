import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { SchoolSettings } from "./SchoolSettings";

/**
 * SCRUM-99: "Each section saves independently." Every save used to re-hydrate
 * EVERY field from the server's answer, so an edit in one section vanished
 * when another section saved - silently, with a "Saved" beside it.
 */

const get = vi.fn();
const saveAcademic = vi.fn();
const update = vi.fn();
const saveContact = vi.fn();

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: () => get(),
      saveAcademic: (p: unknown) => saveAcademic(p),
      update: (p: unknown) => update(p),
      saveContact: (p: unknown) => saveContact(p),
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
  academicConfig: {
    yearStart: "2026-09-01",
    yearEnd: "2027-07-31",
    terms: [
      { id: "t1", name: "Term 1", start: "2026-09-07", end: "" },
      { id: "t2", name: "Term 2", start: "2027-01-11", end: "" },
    ],
  },
};

const saveButtons = () => screen.getAllByRole("button", { name: "Save changes" });

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(SCHOOL);
  // The server's answer to any save is the stored school - which does NOT
  // carry an edit made in a different section and not yet saved.
  saveAcademic.mockResolvedValue(SCHOOL);
  update.mockResolvedValue(SCHOOL);
  saveContact.mockResolvedValue(SCHOOL);
});

describe("Settings sections", () => {
  it("keeps an unsaved name when the term dates are saved", async () => {
    render(<SchoolSettings />);
    const name = await screen.findByLabelText("School name");
    fireEvent.change(name, { target: { value: "Brightgate College" } });

    // In page order: General, Data retention, Academic year - the third is the calendar's.
    fireEvent.click(saveButtons()[2]);
    await waitFor(() => expect(saveAcademic).toHaveBeenCalled());

    await waitFor(() => expect(screen.getAllByText("Saved").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("School name")).toHaveValue("Brightgate College");
  });

  it("says which half of the General save landed when the second half fails", async () => {
    saveContact.mockRejectedValue(new Error("500"));
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("School name");

    fireEvent.click(saveButtons()[0]);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /name was saved, but the contact details weren.t/,
      ),
    );
    expect(visibleText(container)).not.toMatch(/Nothing changed/);
  });

  it("saves retention on its own, and General no longer carries it", async () => {
    render(<SchoolSettings />);
    const name = await screen.findByLabelText("School name");
    fireEvent.change(name, { target: { value: "Brightgate College" } });
    fireEvent.change(screen.getByLabelText(/keep their records for/), {
      target: { value: "contract_plus_3_years" },
    });

    fireEvent.click(saveButtons()[1]);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ retentionPolicy: "contract_plus_3_years" }));
    // The unsaved name is still there - retention refreshed only itself.
    expect(screen.getByLabelText("School name")).toHaveValue("Brightgate College");

    fireEvent.click(saveButtons()[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ name: "Brightgate College" }));
  });

  it("offers SCRUM-99's options verbatim, and names what follows the setting", async () => {
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("School name");
    const options = Array.from(
      (screen.getByLabelText(/keep their records for/) as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options).toEqual([
      "Keep for the length of our contract",
      "Keep for 3 years after our contract ends",
      "Keep for 7 years after our contract ends",
    ]);
    expect(visibleText(container)).toMatch(/Show deactivated.+on your roster, and to leaving students when you promote a year/);
  });
});
