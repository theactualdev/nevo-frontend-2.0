import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminStudentRow, ParentLink } from "@/lib/api/students";
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

const link = (over: Partial<ParentLink> = {}): ParentLink => ({
  id: "pl1",
  schoolId: "sch1",
  studentId: "s1",
  parentId: null,
  parentName: "Mrs. Eze",
  parentContact: "mrs.eze@email.com",
  contactMethod: "email",
  accountCreated: false,
  ...over,
});

const receipt = (delivery: string) => ({
  invitationId: "i1",
  parentLinkId: "pl1",
  studentId: "s1",
  consentTypes: ["data_processing"],
  deliveryStatus: delivery,
  expiresAt: "2026-10-01T00:00:00Z",
});


const roster = () => [
  student({ id: "s1", name: "Chisom Eze" }),
  student({ id: "s2", name: "Tunde Bello", consent: { ...student().consent, status: "pending" } }),
  student({ id: "s3", name: "Amara Okafor", consent: { ...student().consent, status: "confirmed" } }),
  student({ id: "s4", name: "Ngozi Uche" }),
];

/** Every child queued, with the receipt the single route would give. */
const queuedAll = (delivery = "sent") => async (requests: { studentId: string }[]) =>
  requests.map((r) => ({
    studentId: r.studentId,
    queued: true,
    request: { ...receipt(delivery), studentId: r.studentId },
    errorCode: null,
    errorMessage: null,
  }));

const sentTo = () =>
  bulk.mock.calls.flatMap(([requests]) => (requests as { studentId: string }[]).map((r) => r.studentId));

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue(roster());
  parentLinks.mockImplementation(async (id: string) =>
    id === "s4" ? [link({ parentContact: "08031234567" })] : [link({ studentId: id })],
  );
  bulk.mockImplementation(queuedAll());
});

const box = (name: string) => screen.getByRole("checkbox", { name: `Select ${name}` });

const sendSelection = () => {
  fireEvent.click(screen.getByRole("button", { name: "Send consent invitations" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("selecting who to send to", () => {
  it("lets a responded row be seen but never ticked", async () => {
    render(<StudentsView />);
    await screen.findByText("Amara Okafor");
    expect(box("Amara Okafor")).toBeDisabled();
    expect(box("Chisom Eze")).not.toBeDisabled();
  });

  it("selects every row that can still be asked, and only those", async () => {
    render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.click(screen.getByRole("checkbox", { name: /Select every student/ }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(box("Amara Okafor")).not.toBeChecked();
  });

  it("offers no ticking at all to an admin who cannot send", async () => {
    scopes = ["billing"];
    render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("sending to the selection", () => {
  it("asks first, in D07's words, and sends nothing on Cancel", async () => {
    render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.click(box("Chisom Eze"));
    fireEvent.click(box("Tunde Bello"));
    fireEvent.click(screen.getByRole("button", { name: "Send consent invitations" }));

    const dialog = screen.getByRole("dialog", { name: "Send consent invitations to 2 parents?" });
    expect(visibleText(dialog)).toMatch(
      /Each parent will receive a secure link to review and confirm consent for their child\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bulk).not.toHaveBeenCalled();
  });

  it("sends the askable children in one bulk call and accounts for every one", async () => {
    bulk.mockImplementation(async (requests: { studentId: string }[]) =>
      (await queuedAll()(requests)).map((r) =>
        r.studentId === "s2" ? { ...r, request: { ...r.request, deliveryStatus: "queued" } } : r,
      ),
    );
    const { container } = render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.click(screen.getByRole("checkbox", { name: /Select every student/ }));
    sendSelection();

    await waitFor(() => expect(visibleText(container)).toMatch(/1 invitation sent\./));
    const text = visibleText(container);
    expect(text).toMatch(/1 invitation is queued and goes out shortly\./);
    // D07's own words for a child with no parent email on file - settled from
    // the record, never sent to the bulk route.
    expect(text).toMatch(/1 could not be sent: that student does not have a parent email address on file yet\./);
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(sentTo().sort()).toEqual(["s1", "s2"]);
    expect(requestParentConsent).not.toHaveBeenCalled();
    // Each request carries the parent's contact from the record, by email.
    expect(bulk.mock.calls[0][0][0]).toMatchObject({
      parentContact: "mrs.eze@email.com",
      contactMethod: "email",
    });
    // The selection is spent.
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it("never sends to a ticked child the filter has since hidden", async () => {
    render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.click(box("Chisom Eze"));
    fireEvent.click(box("Tunde Bello"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search students" }), {
      target: { value: "Tunde" },
    });
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    sendSelection();
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(sentTo()).toEqual(["s2"]);
  });

  it("keeps each child's own outcome - a refusal in the server's words, a failure counted", async () => {
    bulk.mockImplementation(async (requests: { studentId: string }[]) =>
      requests.map((r) =>
        r.studentId === "s1"
          ? {
              studentId: "s1",
              queued: false,
              request: null,
              errorCode: "parent_already_refused",
              errorMessage: "This parent said no. Nevo will not ask them again.",
            }
          : { studentId: r.studentId, queued: false, request: null, errorCode: "student_not_found", errorMessage: null },
      ),
    );
    const { container } = render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.click(box("Chisom Eze"));
    fireEvent.click(box("Tunde Bello"));
    sendSelection();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/1 parent was already asked and did not consent/),
    );
    expect(visibleText(container)).toMatch(/1 didn.t send, and nothing changed for those\./);
    expect(visibleText(container)).toMatch(/This parent said no\. Nevo will not ask them again\./);
  });

  it("counts a whole call that failed as not sent - never as sent", async () => {
    bulk.mockRejectedValue(new Error("500"));
    const { container } = render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    fireEvent.click(box("Chisom Eze"));
    fireEvent.click(box("Tunde Bello"));
    sendSelection();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 didn.t send, and nothing changed for those\./),
    );
    expect(visibleText(container)).not.toMatch(/invitations? sent/);
  });
});
