import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import { BulkImportModal } from "./BulkImportModal";

/**
 * D19's staff import, step 2 and 3 (backlog 19; T15): the frame's own file -
 * a teacher on two rows, two rows typing "Maths Dept", a row with no email -
 * through to what is sent and what is said after.
 */

const bulk = vi.fn();
const resolve = vi.fn();
const add = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, bulk: (d: unknown) => bulk(d) } };
});
const subject = (id: string, name: string) => ({
  id,
  name,
  displayName: name,
  origin: "canonical",
  reviewState: "approved",
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return {
    ...actual,
    subjectsApi: {
      ...actual.subjectsApi,
      list: async () => [subject("s-maths", "Mathematics"), subject("s-fm", "Further Mathematics")],
      canonical: async () => [],
      resolve: (names: string[]) => resolve(names),
      add: (name: string) => add(name),
    },
  };
});

const CLASSES = [
  { id: "c1", name: "JSS 2A", archivedAt: null },
  { id: "c2", name: "SSS 1 Sciences", archivedAt: null },
] as AdminClass[];

const FILE = [
  "first_name,last_name,email,subject,class",
  "Kunle,Bello,k.bello@school.edu.ng,Mathematics,JSS 2A",
  "Kunle,Bello,K.Bello@school.edu.ng,Further Mathematics,SSS 1 Sciences",
  "Adaeze,Nwosu,a.nwosu@school.edu.ng,Maths Dept,JSS 2A",
  "Segun,Afolabi,s.afolabi@school.edu.ng,Maths Dept,SSS 1 Sciences",
  "Emeka,Obi,,Computer Studies,JSS 2A",
  "Funke,Bello,f.bello@school.edu.ng,Biology,SSS 1 Sciences",
].join("\n");

const ANSWERS: Record<string, object> = {
  Mathematics: { resolved: true, schoolSubjectId: "s-maths", displayName: "Mathematics", origin: "canonical" },
  "Further Mathematics": { resolved: true, schoolSubjectId: "s-fm", displayName: "Further Mathematics", origin: "canonical" },
  "Maths Dept": { resolved: false },
  Biology: { resolved: false, schoolSubjectId: null, displayName: "Biology", origin: "canonical" },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolve.mockImplementation(async (names: string[]) =>
    names.map((typed) => ({ typed, ...(ANSWERS[typed] ?? { resolved: false }) })),
  );
  add.mockImplementation(async (name: string) => subject(`s-${name.toLowerCase()}`, name));
  bulk.mockImplementation(async (drafts: unknown[]) => ({
    created: drafts.map((_, i) => ({
      id: `i${i}`,
      token: `t${i}`,
      role: "teacher",
      email: null,
      name: null,
      status: "pending",
      expiresAt: "2099-01-01T00:00:00Z",
      consentStatus: null,
      deliveryStatus: "sent",
    })),
    rejected: [],
    rowNumberBase: 1,
  }));
});

async function upload() {
  const view = render(<BulkImportModal classes={CLASSES} onClose={vi.fn()} onSent={vi.fn()} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File([FILE], "staff.csv", { type: "text/csv" })] });
  fireEvent.change(input);
  await screen.findByRole("button", { name: /^Save 4 teachers$/ });
  return view;
}

const settleRow4 = async () => {
  fireEvent.click(screen.getByRole("button", { name: /From file: Maths Dept · JSS 2A/ }));
  fireEvent.focus(screen.getByRole("combobox", { name: "Add a subject" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
};

describe("the staff import, D19 step 2", () => {
  it("joins rows by email, names what's to settle, and leaves out the row with no email", async () => {
    const { container } = await upload();
    // Only the subjects a class row typed are asked about, each once.
    expect(resolve).toHaveBeenCalledWith(["Mathematics", "Further Mathematics", "Maths Dept", "Biology"]);
    expect(container.querySelector("[data-import-lead]")!.textContent).toBe(
      "6 rows became 4 teachers. 1 teacher appears twice with one email, so their rows are joined into one. 2 subjects to settle in their rows.",
    );
    const text = visibleText(container);
    expect(text).toMatch(/Merged · rows 2 and 3/);
    expect(text).toMatch(/Same email, so one teacher/);
    expect(text).toMatch(/Mathematics · JSS 2A/);
    expect(text).toMatch(/Further Mathematics · SSS 1 Sciences/);
    // One of Nevo's the school doesn't hold yet is already settled.
    expect(text).toMatch(/Biology · SSS 1 Sciences/);
    expect(text).toMatch(
      /This row has no email address, and email is how Nevo knows each teacher, so it can.t be imported\. The rest of the file isn.t affected\. Add the email to your file and import this row again, or add Emeka Obi by hand\./,
    );
    expect(text).toMatch(/2 subjects to settle before saving:/);
    expect(screen.getByRole("button", { name: /^Save 4 teachers$/ })).toBeDisabled();
  });

  it("settles a subject with the picker, and the other row with the same words too", async () => {
    const { container } = await upload();
    fireEvent.click(screen.getByRole("button", { name: /From file: Maths Dept · JSS 2A/ }));
    expect(screen.getByRole("checkbox", { name: /Use this for row 5, which says “Maths Dept” as well\./ })).toBeChecked();
    fireEvent.focus(screen.getByRole("combobox", { name: "Add a subject" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
    await waitFor(() => expect(visibleText(container)).not.toMatch(/to settle/));
    expect(visibleText(container)).toMatch(/Mathematics · SSS 1 Sciences/);
    expect(screen.getByRole("button", { name: /^Save 4 teachers$/ })).not.toBeDisabled();
  });

  it("settles only its own row when told not to use it for the others", async () => {
    const { container } = await upload();
    fireEvent.click(screen.getByRole("button", { name: /From file: Maths Dept · JSS 2A/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Use this for row 5/ }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Add a subject" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/1 subject to settle before saving:/));
    expect(screen.getByRole("button", { name: /^Save 4 teachers$/ })).toBeDisabled();
  });

  it("sends each teacher once with every class and subject, adding only what the school doesn't hold", async () => {
    const { container } = await upload();
    await settleRow4();
    fireEvent.click(screen.getByRole("button", { name: /^Save 4 teachers$/ }));
    await waitFor(() => expect(bulk).toHaveBeenCalled());
    expect(add.mock.calls).toEqual([["Biology"]]);
    expect(bulk.mock.calls[0][0]).toEqual([
      {
        role: "teacher",
        firstName: "Kunle",
        lastName: "Bello",
        email: "k.bello@school.edu.ng",
        classes: [
          { classId: "c1", subjectId: "s-maths" },
          { classId: "c2", subjectId: "s-fm" },
        ],
      },
      { role: "teacher", firstName: "Adaeze", lastName: "Nwosu", email: "a.nwosu@school.edu.ng", classes: [{ classId: "c1", subjectId: "s-maths" }] },
      { role: "teacher", firstName: "Segun", lastName: "Afolabi", email: "s.afolabi@school.edu.ng", classes: [{ classId: "c2", subjectId: "s-maths" }] },
      { role: "teacher", firstName: "Funke", lastName: "Bello", email: "f.bello@school.edu.ng", classes: [{ classId: "c2", subjectId: "s-biology" }] },
    ]);
    // D19 step 3.
    await waitFor(() => expect(visibleText(container)).toMatch(/4 teachers invited/));
    const summary = container.querySelector("[data-import-summary]")!;
    expect(within(summary as HTMLElement).getByText("1 pair of rows joined by email.")).toBeInTheDocument();
    expect(within(summary as HTMLElement).getByText("1 row left out because it has no email.")).toBeInTheDocument();
  });

  it("says when the subjects couldn't be checked, and checks again on Try again", async () => {
    resolve.mockRejectedValueOnce(new Error("500"));
    const view = render(<BulkImportModal classes={CLASSES} onClose={vi.fn()} onSent={vi.fn()} />);
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File([FILE], "staff.csv", { type: "text/csv" })] });
    fireEvent.change(input);
    await waitFor(() =>
      expect(visibleText(view.container)).toMatch(/We couldn.t check your file.s subjects against the ones Nevo knows just now\./),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: /^Save 4 teachers$/ });
  });

  // L63 (Lydia, 25 Nov): rows join by email, so it was never "each row".
  it("promises one invite for each teacher, never one for each row", () => {
    const view = render(<BulkImportModal classes={CLASSES} onClose={vi.fn()} onSent={vi.fn()} />);
    expect(visibleText(view.container)).toMatch(/We'll create one invite for each teacher\./);
    expect(visibleText(view.container)).not.toMatch(/for each row/);
  });
});
