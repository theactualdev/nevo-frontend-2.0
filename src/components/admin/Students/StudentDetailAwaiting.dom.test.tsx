import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { ConsentState } from "@/lib/api/students";
import { StudentDetailView } from "./StudentDetailView";

/**
 * D07b, "Consent pending · account not yet created" (admin backlog 64): the
 * header pill says "Awaiting consent", the card "Awaiting parent consent",
 * the reminder says it was a reminder, and a guardian with no account yet is
 * told the account comes on its own once they consent.
 */

let scopes: string[] = ["roster"];
vi.mock("@/context/PermissionContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/PermissionContext")>();
  const { createContext } = await import("react");
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

const h = vi.hoisted(() => ({
  consent: "pending" as ConsentState,
  parentLinks: vi.fn(),
  request: vi.fn(),
}));

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
        consent: {
          status: h.consent,
          actorId: null,
          actorName: null,
          timestamp: "2026-07-05T09:00:00Z",
          channel: "email",
        },
      }),
      parentLinks: () => h.parentLinks(),
    },
  };
});
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      requestParentConsent: (id: string, body: unknown) => h.request(id, body),
    },
  };
});
vi.mock("@/lib/api/classes", () => ({
  classesApi: { list: async () => [], classStudents: async () => [] },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const MRS_EZE = {
  id: "pl1",
  schoolId: "sch1",
  studentId: "s1",
  parentId: null,
  parentName: "Mrs. Eze",
  parentContact: "mrs.eze@email.com",
  contactMethod: "email" as const,
  accountCreated: false,
};

const receipt = (deliveryStatus: string) => ({
  invitationId: "i2",
  parentLinkId: "pl1",
  studentId: "s1",
  consentTypes: ["data_processing"],
  deliveryStatus,
  expiresAt: "2026-08-05T00:00:00Z",
});

const ACCOUNT_LINE =
  "A parent account for Mrs. Eze is created automatically the moment consent is confirmed. Nothing to do here in the meantime – Chisom’s progress is safe.";

beforeEach(() => {
  vi.clearAllMocks();
  scopes = ["roster"];
  h.consent = "pending";
  h.parentLinks.mockResolvedValue([MRS_EZE]);
  h.request.mockResolvedValue(receipt("sent"));
});

describe("a child whose consent is awaited", () => {
  it("says Awaiting consent at the top and on the card, never the roster's Pending", async () => {
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Awaiting parent consent/));

    expect(screen.getAllByText("Awaiting consent").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("tells the school the guardian's account comes on its own once they consent", async () => {
    render(<StudentDetailView studentId="s1" />);

    expect(await screen.findByText(ACCOUNT_LINE)).toBeInTheDocument();
    expect(screen.getByText("No account yet")).toBeInTheDocument();
  });

  it("says Reminder sent, naming the child where the frame says her", async () => {
    const { container } = render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send a gentle reminder" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Reminder sent to Mrs\. Eze – Chisom.s progress is safe\./),
    );
    expect(visibleText(container)).not.toMatch(/Consent request sent/);
    expect(h.request).toHaveBeenCalledWith("s1", {
      parentName: "Mrs. Eze",
      parentContact: "mrs.eze@email.com",
      contactMethod: "email",
    });
  });

  it("never says sent over a reminder that is only queued", async () => {
    h.request.mockResolvedValue(receipt("queued"));
    const { container } = render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send a gentle reminder" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/Reminder queued for Mrs\. Eze/));
    expect(visibleText(container)).not.toMatch(/Reminder sent/);
  });

  it("says Sending reminder while it goes", async () => {
    h.request.mockReturnValue(new Promise(() => {}));
    render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send a gentle reminder" }));

    expect(await screen.findByRole("button", { name: "Sending reminder…" })).toBeDisabled();
  });

  // Every send is a new link that revokes the last one; a second button
  // would offer a choice the server does not have (raised, 24 Nov).
  it("offers one way to ask again, not two that do the same thing", async () => {
    render(<StudentDetailView studentId="s1" />);
    await screen.findByRole("button", { name: "Send a gentle reminder" });

    expect(screen.queryByRole("button", { name: /Resend request/ })).not.toBeInTheDocument();
  });
});

describe("where the account line would be untrue", () => {
  it("is absent once the account exists", async () => {
    h.parentLinks.mockResolvedValue([{ ...MRS_EZE, accountCreated: true }]);
    render(<StudentDetailView studentId="s1" />);

    expect(await screen.findByText("Account active")).toBeInTheDocument();
    expect(screen.queryByText(/created automatically/)).not.toBeInTheDocument();
  });

  it("is absent where consent is recorded or withdrawn", async () => {
    for (const status of ["confirmed", "withdrawn"] as const) {
      h.consent = status;
      const { unmount } = render(<StudentDetailView studentId="s1" />);
      expect(await screen.findByText("No account yet")).toBeInTheDocument();
      expect(screen.queryByText(/created automatically/)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("names nobody when the guardian has given no name yet", async () => {
    h.parentLinks.mockResolvedValue([{ ...MRS_EZE, parentName: "" }]);
    render(<StudentDetailView studentId="s1" />);

    expect(
      await screen.findByText(/^A parent account is created automatically the moment consent is confirmed\./),
    ).toBeInTheDocument();
  });
});

describe("a first request, from a child with none sent", () => {
  it("keeps the request's own words, never a reminder's", async () => {
    h.consent = "not_sent";
    const { container } = render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send the consent request" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/Consent request sent to Mrs\. Eze\./));
    expect(visibleText(container)).not.toMatch(/Reminder/);
    expect(screen.queryByText("Awaiting consent")).not.toBeInTheDocument();
  });
});
