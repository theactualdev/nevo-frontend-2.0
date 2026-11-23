import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminStudentRow } from "@/lib/api/students";
import type { IepExport } from "@/lib/api/export";
import { IepExporterView } from "./IepExporterView";

/**
 * D08's draft as a document (backlog 98): the meta table - Student, Class,
 * Period - and the B / I toolbar over the server's markdown. "Prepared by"
 * is not drawn: the export names who asked for it by id only.
 */

const h = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  classes: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/api/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/export")>();
  return { ...actual, exportApi: { ...actual.exportApi, create: (b: unknown) => h.create(b) } };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      list: () => h.list(),
      get: (id: string) => h.get(id),
      parentLinks: async () => [],
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: () => h.classes() } };
});

const amara: AdminStudentRow = {
  id: "s1",
  name: "Amara Okafor",
  loginIdentifier: "amara1",
  status: "active",
  ageBand: "11-14",
  consent: { status: "not_sent", actorId: null, actorName: null, timestamp: null, channel: null },
};

const draft: IepExport = {
  id: "e1",
  studentId: "s1",
  requestedByUserId: "u1",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  status: "draft",
  exportContent: "Amara settles fastest when a lesson opens with audio.",
  sourceSummary: {},
  annotations: [],
  aiGatewayCallId: null,
  reviewedByUserId: null,
  reviewedAt: null,
  reviewNote: null,
};

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.list.mockResolvedValue([amara]);
  h.create.mockResolvedValue(draft);
  h.get.mockResolvedValue({ id: "s1", classIds: ["c1"] });
  h.classes.mockResolvedValue([
    { id: "c1", name: "JSS 2A" },
    { id: "c9", name: "SSS 1B" },
  ]);
});

const openDraft = async () => {
  const { container } = render(<IepExporterView initialStudentId="s1" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate draft" })).toBeInTheDocument());
  fireEvent.change(container.querySelector("#iep-from")!, { target: { value: "2026-09-01" } });
  fireEvent.change(container.querySelector("#iep-to")!, { target: { value: "2026-09-30" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
  await screen.findByText("Draft - review before sharing");
  return container;
};

describe("the IEP draft as D08's document", () => {
  it("heads it with D08's meta table: Student, Class, Period", async () => {
    await openDraft();

    const table = await waitFor(() => {
      const dl = document.querySelector("dl") as HTMLElement | null;
      if (!dl || !dl.textContent?.includes("JSS 2A")) throw new Error("no class yet");
      return dl;
    });
    expect(table).toHaveTextContent("StudentAmara Okafor");
    expect(table).toHaveTextContent("ClassJSS 2A");
    expect(table).toHaveTextContent(/Period1 September 2026 – 30 September 2026/);
    expect(table).not.toHaveTextContent("SSS 1B");
    expect(table).not.toHaveTextContent(/Prepared by/);
  });

  it("leaves the class out when it can't be read, never guessing it", async () => {
    h.get.mockRejectedValue(new Error("500"));
    await openDraft();

    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(document.querySelector("dl")).not.toHaveTextContent(/Class/);
    expect(document.querySelector("dl")).toHaveTextContent("StudentAmara Okafor");
  });

  it("makes the selection bold or italic, in the draft's own markdown", async () => {
    await openDraft();
    const box = screen.getByLabelText("Report wording") as HTMLTextAreaElement;

    box.setSelectionRange(6, 13);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    });
    expect(box.value).toBe("Amara **settles** fastest when a lesson opens with audio.");

    box.setSelectionRange(0, 5);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    });
    expect(box.value).toBe("*Amara* **settles** fastest when a lesson opens with audio.");
    expect(screen.getByRole("toolbar", { name: "Format" })).toBeInTheDocument();
  });
});
