import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminStudentRow } from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/**
 * Backlog 50: D25 PC-03's "Download the consent form", on the roster header -
 * the blank form (no child), for a family who'd rather sign on paper. Its two
 * neighbours in the frame, Record written consent and Upload signed forms,
 * wait on Lydia (L97) and are not here.
 */
const list = vi.fn();
const classes = vi.fn();
const params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => params,
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: (q: unknown) => list(q) },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: () => classes() } }));
const consentForm = vi.fn();
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return { ...actual, consentsApi: { ...actual.consentsApi, consentForm: (id?: string) => consentForm(id) } };
});

const consent = { status: "not_sent" as const, actorId: null, actorName: null, timestamp: null, channel: null };
const row = (
  id: string,
  name: string,
  over: Partial<typeof consent> | { status: "confirmed" | "pending" | "withdrawn"; channel: string | null } = {},
  status = "active",
): AdminStudentRow => ({
  id,
  name,
  status,
  ageBand: null,
  loginIdentifier: null,
  consent: { ...consent, ...over } as AdminStudentRow["consent"],
});

const CLASS = {
  id: "c1",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 1,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  classes.mockResolvedValue([CLASS]);
});

describe("the blank consent form on the roster (backlog 50)", () => {
  it("downloads the form with no child named, from beside the tallies", async () => {
    list.mockResolvedValue([row("a", "Amara Obi", { status: "pending", channel: "email" })]);
    consentForm.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
    URL.createObjectURL = vi.fn(() => "blob:form");
    URL.revokeObjectURL = vi.fn();
    render(<StudentsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Download the consent form" }));
    await waitFor(() => expect(consentForm).toHaveBeenCalledTimes(1));
    expect(consentForm).toHaveBeenCalledWith(undefined);
  });

  it("offers neither Record written consent nor Upload signed forms here (L97)", async () => {
    list.mockResolvedValue([row("a", "Amara Obi")]);
    render(<StudentsView />);
    await screen.findByRole("button", { name: "Download the consent form" });
    expect(screen.queryByText(/Record written consent/)).toBeNull();
    expect(screen.queryByText(/Upload signed forms/)).toBeNull();
  });
});
