import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
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

vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return {
    ...actual,
    onboardingApi: {
      ...actual.onboardingApi,
      get: () => get(),
      stageImport: (k: string, f: File) => stageImport(k, f),
      confirm: () => confirm(),
    },
  };
});

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

  it("does not invent the expected columns", async () => {
    // No endpoint serves them, and a school reformatting 400 rows to a header
    // we guessed gets 400 rejections.
    const { container } = render(<RosterImportView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Add your roster/));

    expect(visibleText(container)).not.toMatch(/Expected columns/i);
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
