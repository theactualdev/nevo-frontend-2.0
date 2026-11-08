import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { WrittenConsentDraft, WrittenConsentRecord } from "@/lib/api/consents";
import type { AdminStudentDetail, ParentLink } from "@/lib/api/students";
import { WrittenConsentView } from "./WrittenConsentView";

/**
 * D25 PC-02. What would hurt: recording the admin as the one who consented,
 * a form "signed" in the future, and a school overriding a parent's
 * withdrawal with paper.
 */

const record = vi.fn<(id: string, d: WrittenConsentDraft) => Promise<WrittenConsentRecord>>();
let student: AdminStudentDetail;
const parentLinks = vi.fn<(id: string) => Promise<ParentLink[]>>();

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
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => student,
      parentLinks: (id: string) => parentLinks(id),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: async () => [{ id: "c-2a", name: "JSS 2A", yearGroup: "jss2" }],
      classStudents: async () => [],
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

const link = (over: Partial<ParentLink> = {}): ParentLink => ({
  id: "pl-1",
  schoolId: "sch-1",
  studentId: "s-1",
  parentId: null,
  parentName: "Ngozi Okafor",
  parentContact: "ngozi.okafor@example.com",
  contactMethod: "email",
  accountCreated: false,
  ...over,
});

beforeEach(() => {
  record.mockReset().mockResolvedValue(saved());
  parentLinks.mockReset().mockResolvedValue([link()]);
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
  await screen.findAllByRole("radio");
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
      consentHolderLinkId: "pl-1",
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
    await screen.findAllByRole("radio");
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

/**
 * Teslim 37961c4: a written form no longer lifts a parent's withdrawal - the
 * server refuses with 409 `consent_withdrawn`. The page read the child before
 * the parent withdrew, so it offered the form; the refusal must land on the
 * withdrawn state, with nothing left to press and no way back promised.
 */
describe("a form refused because the parent has since withdrawn", () => {
  it("shows the withdrawn state, with no Save left to press", async () => {
    record.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: {
          code: "consent_withdrawn",
          message:
            "This parent has withdrawn consent for this learner. Only they can give it again, from their own Nevo account. A form cannot restore it.",
          consentType: "data_processing",
        },
      }),
    );
    render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    expect(
      await screen.findByRole("heading", { name: "A parent has withdrawn consent for Amara Okafor" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Only the parent who withdrew can restore it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save consent record" })).toBeNull();
    expect(screen.queryByText(/Try again/)).toBeNull();
  });
});

/**
 * SCRUM-306 (Lydia and Teslim, 7 Nov): under paper consent only the adult the
 * school recorded as the consenting adult can withdraw. The form REQUIRES one
 * of the child's linked adults and sends it as `consentHolderLinkId`.
 */
describe("who gave this consent (SCRUM-306)", () => {
  const two = [
    link(),
    link({ id: "pl-2", parentName: "Chinedu Okafor", parentContact: "chinedu@example.com" }),
  ];

  it("with two adults on the record, chooses neither, and won't save until one is chosen", async () => {
    parentLinks.mockResolvedValue(two);
    render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    const saveBtn = screen.getByRole("button", { name: "Save consent record" });
    expect(saveBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Chinedu Okafor/ }));
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith("s-1", expect.objectContaining({ consentHolderLinkId: "pl-2" })),
    );
  });

  it("with one adult on the record, has them chosen already - as a one-guardian school works today", async () => {
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    expect(screen.getByRole("radio", { name: /Ngozi Okafor/ })).toBeChecked();
    expect(visibleText(container)).toMatch(/Only they will be able to withdraw it\./);
    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith("s-1", expect.objectContaining({ consentHolderLinkId: "pl-1" })),
    );
  });

  it("names an adult with no name on the record by their contact", async () => {
    parentLinks.mockResolvedValue([link({ parentName: "  " })]);
    render(<WrittenConsentView studentId="s-1" />);
    expect(await screen.findByRole("radio", { name: "ngozi.okafor@example.com" })).toBeInTheDocument();
  });

  it("with no adult on the record, says so and offers no Save", async () => {
    parentLinks.mockResolvedValue([]);
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await screen.findByRole("heading", { name: "Record written consent" });
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /No parent or guardian is linked to Amara yet, so there.s no one to record this consent against\./,
      ),
    );
    set(/Parent.s full name/, "Mrs. Ngozi Okafor");
    set("Relationship to child", "Mother");
    set("Date signed", "2026-10-01");
    expect(screen.getByRole("button", { name: "Save consent record" })).toBeDisabled();
  });

  it("when the adults can't be read, says so and reads again on Try again", async () => {
    parentLinks.mockRejectedValueOnce(new Error("offline"));
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/We couldn.t load the adults linked to Amara/),
    );
    expect(screen.getByRole("button", { name: "Save consent record" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radio", { name: /Ngozi Okafor/ })).toBeChecked();
    expect(parentLinks).toHaveBeenCalledTimes(2);
  });

  it("when the chosen adult was unlinked meanwhile, reads the adults again and asks to choose again", async () => {
    parentLinks.mockResolvedValueOnce(two).mockResolvedValue([two[0]]);
    record.mockRejectedValue(
      new ApiError(422, "Unprocessable", { detail: { code: "consent_holder_not_linked" } }),
    );
    const { container } = render(<WrittenConsentView studentId="s-1" />);
    await fillValid();
    fireEvent.click(screen.getByRole("radio", { name: /Chinedu Okafor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save consent record" }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /The adult you chose is no longer linked to Amara, so nothing has been recorded\. Choose again\./,
      ),
    );
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(1));
    expect(screen.queryByRole("radio", { name: /Chinedu Okafor/ })).toBeNull();
  });
});
