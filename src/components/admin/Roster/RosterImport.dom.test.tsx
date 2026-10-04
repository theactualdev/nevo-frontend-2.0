import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { OnboardingState } from "@/lib/api/onboarding";
import { RosterImportView } from "./RosterImportView";

/**
 * D24 OB-01 "Add your roster" and OB-02 "What Nevo found".
 *
 * *"Nothing is created here"* is the server's promise and the screen's whole
 * pitch to a school about to hand over four hundred children. These pin the
 * parts of that promise the console is responsible for.
 */

const get = vi.fn();
const stageImport = vi.fn();
const confirm = vi.fn();
const template = vi.fn();

vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return {
    ...actual,
    onboardingApi: {
      ...actual.onboardingApi,
      get: () => get(),
      stageImport: (k: string, f: File) => stageImport(k, f),
      confirm: () => confirm(),
      template: (name: string) => template(name),
    },
  };
});

/*
 * The templates as the server writes them (backend `import_templates.py`): a
 * BOM for Excel, readable headings generated from the parser's columns, an
 * example row in the school's own class names, and a line saying to delete it.
 */
const STUDENT_TEMPLATE =
  "﻿First name,Surname,Class,Date of birth,Student ID / Admission Number,Guardian first name,Guardian surname,Guardian email,Relationship to the child\r\n" +
  "Amara,Okafor,JSS 1A,2015-04-23,ADM001,Ngozi,Okafor,ngozi.okafor@example.com,Mother\r\n" +
  "EXAMPLE ROW - DELETE THIS LINE BEFORE UPLOADING\r\n";
const TEACHER_TEMPLATE =
  "﻿First name,Surname,Email,Subject,Class\r\n" +
  "Bisi,Bello,bisi.bello@example.com,Mathematics,JSS 1A\r\n";
const csv = (text: string) => new Blob([text], { type: "text/csv" });

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  stage: "uploading",
  classes: [],
  teacherCount: 0,
  studentCount: 0,
  rejected: [],
  invoiceId: null,
  amountDue: null,
  currency: null,
  periodLabel: null,
  canConfirm: false,
  canPay: false,
  canActivate: false,
  inOnboarding: false,
  ...over,
});

const READ = state({
  studentCount: 336,
  teacherCount: 18,
  canConfirm: true,
  classes: [
    {
      name: "JSS 1A",
      normalisedName: "jss 1a",
      yearGroup: "jss1",
      section: "A",
      studentCount: 30,
      teacherCount: 1,
    },
  ],
  rejected: [
    { rowNumber: 12, field: "class", value: "JS1", reason: "No class called JS1." },
    { rowNumber: 40, field: "dob", value: "31/02/2013", reason: "Not a real date." },
  ],
});

const file = () => new File(["a,b"], "students.csv", { type: "text/csv" });

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(state());
  stageImport.mockResolvedValue(READ);
  confirm.mockResolvedValue(state({ stage: "confirmed" }));
  template.mockImplementation((name: string) =>
    Promise.resolve(csv(name === "students" ? STUDENT_TEMPLATE : TEACHER_TEMPLATE)),
  );
});

describe("OB-01 upload", () => {
  it("stages each file under its own kind", async () => {
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Add your roster/));

    fireEvent.change(screen.getByLabelText(/Upload students/i), {
      target: { files: [file()] },
    });

    await waitFor(() => expect(stageImport).toHaveBeenCalled());
    expect(stageImport.mock.calls[0][0]).toBe("student");
  });

  it("offers no way forward until something is actually staged", async () => {
    // A button leading to an empty screen is worse than one that is not there.
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Add your roster/));

    expect(screen.queryByRole("button", { name: /See what Nevo found/i })).toBeNull();

    fireEvent.change(screen.getByLabelText(/Upload students/i), {
      target: { files: [file()] },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /See what Nevo found/i })).toBeEnabled(),
    );
  });

  it("does not clear what was already staged when an upload fails", async () => {
    /*
     * Backend replaces a file of the same kind ON SUCCESS. A failure replaced
     * nothing, so wiping the screen would tell a school it had lost work it
     * still has.
     */
    get.mockResolvedValue(READ);
    stageImport.mockRejectedValue(new Error("500"));
    const { container } = render(<RosterImportView />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /See what Nevo found/i })).toBeEnabled(),
    );

    fireEvent.change(screen.getByLabelText(/Upload staff/i), {
      target: { files: [file()] },
    });

    await waitFor(() => expect(visibleText(container)).toMatch(/couldn.t read that/i));
    expect(screen.getByRole("button", { name: /See what Nevo found/i })).toBeEnabled();
    expect(visibleText(container)).toMatch(/Nothing has changed/i);
  });

  it("shows the server's reason for a refusal that retrying cannot fix", async () => {
    /*
     * A file missing a required column is a 400 naming what is absent. "Try
     * again in a moment" would send a school round the same loop forever.
     */
    stageImport.mockRejectedValue(
      new ApiError(400, "no", {
        detail: {
          code: "missing_columns",
          message: "This file is missing the columns first_name, last_name.",
        },
      }),
    );
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Add your roster/));

    fireEvent.change(screen.getByLabelText(/Upload students/i), {
      target: { files: [file()] },
    });

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/missing the columns first_name, last_name/),
    );
    expect(visibleText(container)).not.toMatch(/try again/i);
  });

  it("keeps the retry wording when the server gave no reason", async () => {
    stageImport.mockRejectedValue(new Error("network"));
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Add your roster/));

    fireEvent.change(screen.getByLabelText(/Upload students/i), {
      target: { files: [file()] },
    });

    await waitFor(() => expect(visibleText(container)).toMatch(/try again/i));
  });

  it("sends a confirmed school on to paying instead of offering an upload", async () => {
    /*
     * Past confirm the server refuses imports, and /admin/activate had no
     * inbound link anywhere - a school that confirmed its roster was stranded
     * one step from the end.
     */
    for (const stage of ["confirmed", "awaiting_payment"] as const) {
      get.mockResolvedValue(state({ stage, studentCount: 336, classes: READ.classes }));
      const { container, unmount } = render(<RosterImportView />);

      await waitFor(() =>
        expect(visibleText(container)).toMatch(/Your roster is confirmed/),
      );
      expect(visibleText(container)).toMatch(/336 students across 1 class/);
      expect(screen.queryByLabelText(/Upload students/i)).toBeNull();
      expect(screen.getByRole("link", { name: /Pay for the year/ })).toHaveAttribute(
        "href",
        "/admin/activate",
      );
      unmount();
    }
  });

  it("sends an active school to Students and Teachers instead of offering an upload", async () => {
    /*
     * Backend, 25 Sep: confirm prices the whole file as a fresh roster, so a
     * running school uploading here would be invoiced twice for the same
     * children. The server refuses it; the page should not offer it.
     */
    get.mockResolvedValue(state({ stage: "activated" }));
    const { container } = render(<RosterImportView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/already set up/i),
    );
    expect(screen.queryByLabelText(/Upload students/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Go to Students/ })).toHaveAttribute(
      "href",
      "/admin/students",
    );
  });
});

describe("OB-02 what Nevo found", () => {
  const reachFound = async () => {
    get.mockResolvedValue(READ);
    const r = render(<RosterImportView />);
    const go = await screen.findByRole("button", { name: /See what Nevo found/i });
    fireEvent.click(go);
    await screen.findByText(/What Nevo found/);
    return r;
  };

  it("states each count as the server gave it", async () => {
    const { container } = await reachFound();
    const text = visibleText(container);

    expect(text).toMatch(/336/);
    expect(text).toMatch(/18/);
    expect(text).toMatch(/2 rows to fix/);
  });

  it("names every rejected row individually, never only a count", async () => {
    /*
     * "No error is only a count." A school creating thirty classes will not
     * notice a count of failures - and did not, when an import of four hundred
     * children reported only that some rows failed.
     */
    const { container } = await reachFound();
    const text = visibleText(container);

    expect(text).toMatch(/Row 12/);
    expect(text).toMatch(/No class called JS1/);
    expect(text).toMatch(/Row 40/);
    expect(text).toMatch(/Not a real date/);
    expect(text).not.toMatch(/undefined/);
  });

  it("moves a school straight on to paying once its roster is confirmed", async () => {
    confirm.mockResolvedValue(
      state({ stage: "confirmed", studentCount: 336, classes: READ.classes }),
    );
    await reachFound();
    fireEvent.click(screen.getByRole("button", { name: /Confirm 336 students/i }));

    const pay = await screen.findByRole("link", { name: /Pay for the year/ });
    expect(pay).toHaveAttribute("href", "/admin/activate");
  });

  it("lets a school confirm with rows still to fix", async () => {
    // The frame is explicit: they can be fixed now or left for later.
    await reachFound();

    const btn = screen.getByRole("button", { name: /Confirm 336 students/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
  });

  it("refuses the confirm the server has not allowed", async () => {
    get.mockResolvedValue({ ...READ, canConfirm: false });
    render(<RosterImportView />);
    fireEvent.click(await screen.findByRole("button", { name: /See what Nevo found/i }));
    await screen.findByText(/What Nevo found/);

    expect(screen.getByRole("button", { name: /Confirm 336 students/i })).toBeDisabled();
  });

  it("says nothing was created when a confirm fails", async () => {
    confirm.mockRejectedValue(new Error("500"));
    const { container } = await reachFound();

    fireEvent.click(screen.getByRole("button", { name: /Confirm 336 students/i }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Nothing has been created/i),
    );
    expect(visibleText(container)).toMatch(/your files are still here/i);
  });

  it("does not draw a teachers panel it has no names for", async () => {
    // `OnboardingState` carries `teacherCount` and no teacher list.
    const { container } = await reachFound();
    expect(visibleText(container)).not.toMatch(/Teachers found/i);
  });

  it("hides the rows-to-fix section entirely on a clean file", async () => {
    get.mockResolvedValue({ ...READ, rejected: [] });
    const { container } = render(<RosterImportView />);
    fireEvent.click(await screen.findByRole("button", { name: /See what Nevo found/i }));
    await screen.findByText(/What Nevo found/);

    expect(visibleText(container)).not.toMatch(/rows to fix/i);
    expect(visibleText(container)).not.toMatch(/\b0 row/);
  });
});

describe("OB-01's expected columns and templates", () => {
  /*
   * The frame shows the columns BEFORE upload. They are read off the server's
   * template - whose header the server generates from the parser's own columns
   * - and never held by the console, which once drew a list the parser refused.
   */
  const columnsOf = (name: RegExp) =>
    Array.from(screen.getByRole("list", { name }).querySelectorAll("li")).map((li) => li.textContent);

  it("shows each template's own header row before anything is uploaded", async () => {
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(screen.getByRole("list", { name: /for students/ })).toBeInTheDocument());
    expect(columnsOf(/for students/)).toEqual([
      "First name",
      "Surname",
      "Class",
      "Date of birth",
      "Student ID / Admission Number",
      "Guardian first name",
      "Guardian surname",
      "Guardian email",
      "Relationship to the child",
    ]);
    await waitFor(() => expect(screen.getByRole("list", { name: /for staff/ })).toBeInTheDocument());
    expect(columnsOf(/for staff/)).toEqual(["First name", "Surname", "Email", "Subject", "Class"]);
    expect(template).toHaveBeenCalledWith("students");
    expect(template).toHaveBeenCalledWith("teachers");
    expect(stageImport).not.toHaveBeenCalled();
    expect(visibleText(container)).toMatch(/The format is strict, which is why the columns are shown here/);
  });

  it("shows no list, and no sentence pointing at one, when a template can't be read", async () => {
    template.mockRejectedValue(new ApiError(500, "x"));
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Add your roster/));
    await waitFor(() => expect(template).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("list", { name: /Expected columns/ })).toBeNull();
    expect(visibleText(container)).not.toMatch(/Expected columns/i);
    expect(visibleText(container)).not.toMatch(/format is strict/);
    // The link is still there, and says so when it can't fetch either.
    fireEvent.click(screen.getByRole("button", { name: "Download the student template" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/That didn.t download/));
    expect(template).toHaveBeenCalledTimes(3);
  });

  it("downloads the file it already read, under the server's own name", async () => {
    const saved: string[] = [];
    const created = vi.fn((b: Blob) => {
      void b;
      return "blob:template";
    });
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });
    render(<RosterImportView />);
    await waitFor(() => expect(screen.getByRole("list", { name: /for staff/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Download the teacher template" }));
    await waitFor(() => expect(saved).toEqual(["nevo-teacher-import.csv"]));
    expect(template).toHaveBeenCalledTimes(2);
    expect(await (created.mock.calls[0][0] as Blob).text()).toContain("Bisi,Bello");
    click.mockRestore();
  });

  it("fetches nothing for a school past the upload step", async () => {
    get.mockResolvedValue(state({ stage: "activated" }));
    render(<RosterImportView />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(template).not.toHaveBeenCalled();
  });
});
