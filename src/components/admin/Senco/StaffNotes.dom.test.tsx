import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { StaffNotes } from "./StaffNotes";

/**
 * Backlog 43, D08b SC-03: a member of staff's own note on a child's report,
 * under their name and the day the server stamps - separate from what Nevo
 * recorded, and never claimed to reach a parent.
 */

const composition = vi.fn();
const annotate = vi.fn();
vi.mock("@/lib/api/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/export")>();
  return {
    ...actual,
    exportApi: {
      ...actual.exportApi,
      composition: (id: string) => composition(id),
      annotate: (id: string, body: string) => annotate(id, body),
    },
  };
});

const note = (id: string, body: string, authorName = "Grace Eze") => ({
  id,
  exportId: "x1",
  body,
  authorUserId: "u1",
  authorName,
  authorRole: "senco_admin",
  createdAt: "2026-09-18T10:00:00Z",
});

const comp = (annotations: object[]) => ({
  exportId: "x1",
  studentId: "s1",
  status: "draft",
  nevoText: "…",
  annotations,
  reviewNote: null,
  reviewedBy: null,
  reviewedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  composition.mockResolvedValue(comp([note("n1", "Comprehension has held up well.")]));
});

describe("staff notes on a draft report", () => {
  it("shows each note under its author, apart from Nevo's record, and says it isn't part of what a parent reads", async () => {
    const { container } = render(<StaffNotes exportId="x1" firstName="Amara" editable />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Comprehension has held up well\./));
    const text = visibleText(container);
    expect(text).toMatch(/Grace Eze.s note · added by staff/);
    expect(text).toMatch(/18 September 2026/);
    expect(text).toMatch(/Everything above is what Nevo recorded\. Add your own judgement below\./);
    expect(text).toMatch(/Notes are kept with the report and are not part of what a parent reads\./);
    // Nothing promises a print or a share the contract can't make.
    expect(text).not.toMatch(/prints as yours/i);
  });

  it("adds a note as typed, and the server says who wrote it and when", async () => {
    annotate.mockResolvedValue(note("n2", "Keep the shorter segments."));
    const { container } = render(<StaffNotes exportId="x1" firstName="Amara" editable />);
    const box = await screen.findByLabelText("Your note");
    fireEvent.change(box, { target: { value: "  Keep the shorter segments.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Keep the shorter segments\./));
    // Only the words go up: the author and the time are the server's to stamp.
    expect(annotate).toHaveBeenCalledWith("x1", "Keep the shorter segments.");
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("holds Add note until there's something to add", async () => {
    render(<StaffNotes exportId="x1" firstName="Amara" editable />);
    await screen.findByLabelText("Your note");
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your note"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled();
  });

  it("says the server's own words when the report went final first", async () => {
    annotate.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: {
          code: "export_already_final",
          message: "This document has been approved. Annotations belong to the draft; produce a new one to add to it.",
        },
      }),
    );
    const { container } = render(<StaffNotes exportId="x1" firstName="Amara" editable />);
    fireEvent.change(await screen.findByLabelText("Your note"), { target: { value: "Late note" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Annotations belong to the draft/));
  });

  it("says a failed read is unknown, never 'no notes'", async () => {
    composition.mockRejectedValue(new Error("500"));
    const { container } = render(<StaffNotes exportId="x1" firstName="Amara" editable />);
    await waitFor(() => expect(visibleText(container)).toMatch(/couldn.t read the staff notes on Amara.s report/));
    expect(screen.queryByLabelText("Your note")).toBeNull();
  });
});

describe("staff notes on a final report", () => {
  it("shows the notes with no way to add one", async () => {
    const { container } = render(<StaffNotes exportId="x1" firstName="Amara" editable={false} />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Comprehension has held up well\./));
    expect(screen.queryByLabelText("Your note")).toBeNull();
    expect(visibleText(container)).not.toMatch(/Add your own judgement/);
  });

  it("draws nothing when the final report has no notes", async () => {
    composition.mockResolvedValue(comp([]));
    const { container } = render(<StaffNotes exportId="x1" firstName="Amara" editable={false} />);
    await waitFor(() => expect(composition).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-staff-notes]")).toBeNull());
  });
});
