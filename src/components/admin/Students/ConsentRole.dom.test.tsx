import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { StudentDetailView } from "./StudentDetailView";

/**
 * Backend, 1 Oct, on the consent request:
 * - it takes ROSTER OR SENCO access. The founding admin has roster and not
 *   senco, on purpose, and must be able to send;
 * - the guardian's name is OPTIONAL. One recorded at enrolment has none, and
 *   is asked as they are;
 * - a parent who already said no is refused with 409 `parent_already_refused`,
 *   and the message is safe to show as it stands.
 */

const parentLinks = vi.fn();
const addGuardian = vi.fn();
const requestParentConsent = vi.fn();
let scopes: string[] = ["roster"];

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
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Chisom",
        lastName: "Eze",
        loginIdentifier: "chisom.e",
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: { status: "not_sent" as const, actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      parentLinks: () => parentLinks(),
    },
  };
});
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      addGuardian: (id: string, g: unknown) => addGuardian(id, g),
      requestParentConsent: (id: string, body: unknown) => requestParentConsent(id, body),
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** A guardian recorded at enrolment: the address, and no name yet. */
const UNNAMED = {
  id: "pl1",
  schoolId: "sch1",
  studentId: "s1",
  parentId: null,
  parentName: "",
  parentContact: "eze@example.com",
  contactMethod: "email" as const,
  accountCreated: false,
};

const REFUSED =
  "This parent was already asked about this learner and did not consent. Nevo does not contact them again. Speak to them directly if something has changed.";

beforeEach(() => {
  vi.clearAllMocks();
  scopes = ["roster"];
  parentLinks.mockResolvedValue([]);
  requestParentConsent.mockResolvedValue({
    invitationId: "i1",
    parentLinkId: "pl1",
    studentId: "s1",
    consentTypes: ["data_processing"],
    deliveryStatus: "queued",
    expiresAt: "2099-01-01T00:00:00Z",
  });
});

describe("who may send", () => {
  it("offers the founding admin the request - roster access, no SENCo", async () => {
    scopes = ["oversight", "roster", "billing"];
    parentLinks.mockResolvedValue([UNNAMED]);
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByRole("button", { name: "Send the consent request" })).toBeInTheDocument();
  });

  it("tells an admin with neither roster nor SENCo access who sends it, and offers nothing", async () => {
    scopes = ["billing"];
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No guardian on the record/));
    expect(screen.queryByRole("button", { name: /Send the consent request/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add a parent or guardian/ })).toBeNull();
    expect(visibleText(container)).toMatch(
      /Consent requests are sent by an admin with roster or SENCo \/ Learning Support access/,
    );
  });
});

describe("a guardian recorded at enrolment, with no name", () => {
  it("shows the address rather than a blank row", async () => {
    parentLinks.mockResolvedValue([UNNAMED]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/eze@example\.com/));
    expect(visibleText(container)).toMatch(/They.ll give their own name when they answer the request/);
  });

  it("is asked as they are - no name needed", async () => {
    parentLinks.mockResolvedValue([UNNAMED]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send the consent request" }));
    await waitFor(() =>
      expect(requestParentConsent).toHaveBeenCalledWith("s1", {
        parentName: "",
        parentContact: "eze@example.com",
        contactMethod: "email",
      }),
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/queued for eze@example\.com/));
  });
});

describe("a parent who already said no", () => {
  it("is not asked again, and the school reads backend's own words", async () => {
    parentLinks.mockResolvedValue([UNNAMED]);
    requestParentConsent.mockRejectedValue(
      new ApiError(409, "conflict", {
        detail: { code: "parent_already_refused", message: REFUSED },
      }),
    );
    const { container } = render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send the consent request" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/did not consent\. Nevo does not contact them again/));
    expect(visibleText(container)).not.toMatch(/That didn.t go through/i);
  });
});

describe("the student page's actions", () => {
  it("offer no PIN control - SCRUM-216 gives clearing a PIN to the child's teachers", async () => {
    scopes = ["oversight", "roster", "senco"];
    render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByRole("button", { name: /Remove Chisom from the school/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PIN/i })).toBeNull();
  });
});
