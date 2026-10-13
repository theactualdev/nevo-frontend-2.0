import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { WrittenConsentDraft, WrittenConsentRecord } from "@/lib/api/consents";
import type { AdminStudentDetail } from "@/lib/api/students";
import { WrittenConsentView } from "./WrittenConsentView";

/**
 * D25 PC-02. What would hurt: recording the admin as the one who consented,
 * a form "signed" in the future, and a school overriding a parent's
 * withdrawal with paper.
 */

const record = vi.fn<(id: string, d: WrittenConsentDraft) => Promise<WrittenConsentRecord>>();
let student: AdminStudentDetail;

vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      recordWrittenConsent: (id: string, d: WrittenConsentDraft) => record(id, d),
      consentForm: async () => new Blob(["%PDF"]),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, get: async () => student } };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: async () => [{ id: "c-2a", name: "JSS 2A", yearGroup: "jss2" }],
    },
  };
});

const saved = (over: Partial<WrittenConsentRecord> = {}): WrittenConsentRecord => ({
  studentId: "s-1",
  consentTypes: ["data_processing"],
  parentName: "Mrs. Ngozi Okafor",
  parentRelationship: "Mother",
  signedOn: "2026-10-01",
  noticeVersion: "2026-09-v1",
  method: "written",
  evidenceStoragePath: "consent/written/s-1/abc.jpg",
  uploadedBy: "admin-1",
  uploadedAt: "2026-10-12T09:00:00Z",
  parentNotified: true,
  ...over,
});

beforeEach(() => {
  record.mockReset().mockResolvedValue(saved());
  student = {
    id: "s-1",
    firstName: "Amara",
    lastName: "Okafor",
    loginIdentifier: null,
    email: null,
    status: "active",
    ageBand: null,
    classIds: ["c-2a"],
    firstUse: false,
    consent: { status: "not_sent" } as AdminStudentDetail["consent"],
  };
});

function set(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function fillValid() {
  await screen.findByRole("heading", { name: "Record written consent" });
  set(/Parent.s full name/, "Mrs. Ngozi Okafor");
  set("Relationship to child", "Mother");
  set("Date signed", "2026-10-01");
}

describe("Record written consent", () => {
  it("names the child the form is for, with their class", async () => {
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/JSS 2A/));
    expect(visibleText(container)).toMatch(/Amara Okafor/);
    expect(visibleText(container)).toMatch(/the name is the parent.s, never yours/);
  });

  it("records the parent as the one who consented, with the photo as evidence", async () => {
    render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    const photo = new File(["jpg"], "okafor-consent.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [photo] } });
    expect(await screen.findByText("okafor-consent.jpg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith("s-1", {
      parentName: "Mrs. Ngozi Okafor",
      parentRelationship: "Mother",
      signedOn: "2026-10-01",
      form: photo,
    });
    expect(
      await screen.findByRole("heading", { name: "Written consent recorded for Amara Okafor" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toMatch(/with the form kept as evidence/);
    expect(screen.getByRole("status").textContent).toMatch(/a way to withdraw at any time/);
  });

  it("will not save until the form's name, relationship and date are in", async () => {
    render(<WrittenConsentView studentId="s-1" />);
    await screen.findByRole("heading", { name: "Record written consent" });
    const saveBtn = screen.getByRole("button", { name: "Save consent record" });
    expect(saveBtn).toBeDisabled();
    set(/Parent.s full name/, "Mrs. Ngozi Okafor");
    set("Relationship to child", "Mother");
    expect(saveBtn).toBeDisabled();
    set("Date signed", "2999-01-01");
    // A form cannot have been signed in the future.
    expect(saveBtn).toBeDisabled();
    set("Date signed", "2026-10-01");
    expect(saveBtn).toBeEnabled();
  });

  it("takes the relationship as the form writes it when it is someone else", async () => {
    render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    set("Relationship to child", "Someone else");
    set(/Their relationship, as on the form/, "Aunt");
    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith("s-1", expect.objectContaining({ parentRelationship: "Aunt", form: null })),
    );
  });

  it("shows the server's refusal and keeps what was typed", async () => {
    record.mockRejectedValue(
      new ApiError(400, "Bad Request", {
        detail: { code: "signed_in_the_future", message: "Check the date on the form: it is later than today." },
      }),
    );
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Check the date on the form: it is later than today\./),
    );
    expect((screen.getByLabelText(/Parent.s full name/) as HTMLInputElement).value).toBe("Mrs. Ngozi Okafor");
  });

  it("does not claim the parent was told when they were not", async () => {
    record.mockResolvedValue(saved({ parentNotified: false, evidenceStoragePath: null }));
    render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).not.toMatch(/withdraw/);
    expect(status.textContent).not.toMatch(/evidence/);
  });

  it("offers no form for a child whose parent withdrew", async () => {
    student = { ...student, consent: { status: "withdrawn" } as AdminStudentDetail["consent"] };
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/A parent has withdrawn consent for Amara Okafor/));
    expect(visibleText(container)).toMatch(/Only the parent who withdrew can restore it/);
    expect(screen.queryByRole("button", { name: "Save consent record" })).toBeNull();
  });
});
