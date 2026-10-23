import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
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
 * THE DATE OF BIRTH HOLD (SCRUM-243 as rewritten 20 Oct; design 96cd4b4). The
 * 7 Oct "no child is ever blocked" is superseded: a parent's date that differs
 * from the school's now holds the account. The roster carries a note against
 * each held child, and the header routes to the checks (D30). Nevo still never
 * shows the parent's date, or any date, here.
 *
 * (The mocks below are shared with the bulk send's test, whose note follows.)
 *
 * D07's bulk send, ruled by Lydia on 7 Oct: "D07 wins. Bulk send exists. A
 * school with three hundred children cannot send consent requests one at a
 * time." Tick rows, or every row that can still be asked; confirm in D07's
 * words; each request goes the same way the row's own "Send request" does,
 * and the result accounts for every one of them.
 *
 * (What follows is the single-send test's own note on the receipt.)
 *
 * The trigger nothing in Nevo had.
 *
 * `consentsApi.requestParentConsent` was typed with ZERO callers, and the whole
 * parent surface sat behind it: three finished, merged screens no family could
 * reach, because the product could not send anybody a link.
 *
 * The receipt is READ, not assumed. `POST .../parent-consent-requests` answers
 * 202 with `deliveryStatus: queued | processing | sent | failed`, and only
 * `sent` means a parent was written to - the same distinction the invite
 * surfaces got wrong until 8 Sep.
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


const NOTE = "Parent gave a different date of birth.";

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([
    student({ id: "s1", name: "Chisom Eze" }),
    student({ id: "s2", name: "Tunde Bello" }),
  ]);
  mismatches.mockResolvedValue([{ id: "ac1", studentId: "s2", state: "mismatch", blocksAccess: true }]);
});

describe("a child held for a date of birth check", () => {
  it("is a note against that child, and only that child", async () => {
    render(<StudentsView />);
    await screen.findByText("Tunde Bello");
    await waitFor(() => expect(screen.getAllByText(NOTE)).toHaveLength(1));
    const row = screen.getByText(NOTE).closest("button") as HTMLElement;
    expect(row).toHaveTextContent("Tunde Bello");
  });

  it("names no date - the parent's is never shown, and nor is the school's here", async () => {
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(screen.getByText(NOTE)).toBeInTheDocument());
    expect(visibleText(container)).not.toMatch(
      /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/,
    );
  });

  it("routes from the header to the checks, saying how many are held", async () => {
    render(<StudentsView />);
    const link = await screen.findByRole("link", { name: "1 on hold · date of birth check" });
    expect(link.getAttribute("href")).toMatch(/^\/admin\/students\/date-of-birth\?back=%2Fadmin%2Fstudents/);
  });

  it("leaves the roster without notes when the list cannot be read", async () => {
    mismatches.mockRejectedValue(new Error("403"));
    render(<StudentsView />);
    await screen.findByText("Tunde Bello");
    await waitFor(() => expect(mismatches).toHaveBeenCalled());
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByRole("link", { name: /on hold/ })).toBeNull();
  });
});
