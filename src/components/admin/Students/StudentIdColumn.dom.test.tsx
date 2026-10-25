import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AdminStudentRow } from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/*
 * An admin with ROSTER access - the founding admin's, and enough to send the
 * consent request (backend, 1 Oct: roster OR senco). What an admin with
 * neither sees is pinned in `ConsentRole.dom.test.tsx`.
 */
let scopes: string[] = ["roster"];
beforeEach(() => {
  scopes = ["roster"];
});
vi.mock("@/context/PermissionContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/PermissionContext")>();
  const { createContext } = await import("react");
  // The context's DEFAULT, read when no provider is mounted - with a getter,
  // so each test's `scopes` is the one seen.
  return {
    ...actual,
    PermissionContext: createContext({
      get scopes() {
        return scopes;
      },
      resolved: true,
      status: "ready",
      refresh: () => {},
    } as never),
  };
});

/**
 * D07's "Student ID / Admission Number" column, which the roster could not
 * draw until the reads carried `admissionNumber` (8 Oct). It is the ID a child
 * signs back in with after a PIN clear, so it is also something to search by.
 */

const list = vi.fn();
const parentLinks = vi.fn();
const requestParentConsent = vi.fn();
/** The bulk route (backend, 8 Oct): one call, an outcome per child. */
const bulk = vi.fn();

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      list: () => list(),
      parentLinks: (id: string) => parentLinks(id),
    },
  };
});

vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      requestParentConsent: (id: string, body: unknown) =>
        requestParentConsent(id, body),
      requestParentConsentBulk: (requests: { studentId: string }[]) => bulk(requests),
    },
  };
});

vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const mismatches = vi.fn();
vi.mock("@/lib/api/ageChecks", () => ({ ageChecksApi: { held: () => mismatches() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const student = (over: Partial<AdminStudentRow> = {}): AdminStudentRow => ({
  id: "s1",
  name: "Chisom Eze",
  loginIdentifier: "chisom",
  status: "active",
  ageBand: "11-14",
  consent: {
    status: "not_sent",
    actorId: null,
    actorName: null,
    timestamp: null,
    channel: null,
  },
  ...over,
});


beforeEach(() => {
  vi.clearAllMocks();
  mismatches.mockResolvedValue([]);
  list.mockResolvedValue([
    student({ id: "s1", name: "Chisom Eze", admissionNumber: "BGA/2026/014" }),
    student({ id: "s2", name: "Tunde Bello", admissionNumber: null }),
  ]);
});

describe("the Student ID column", () => {
  it("heads the column and shows each child's admission number", async () => {
    render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    expect(screen.getByText("Student ID")).toBeInTheDocument();
    expect(screen.getByText("BGA/2026/014")).toBeInTheDocument();
  });

  it("finds a child by their Student ID", async () => {
    render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search students" }), {
      target: { value: "2026/014" },
    });
    expect(screen.getByText("Chisom Eze")).toBeInTheDocument();
    expect(screen.queryByText("Tunde Bello")).toBeNull();
  });
});
