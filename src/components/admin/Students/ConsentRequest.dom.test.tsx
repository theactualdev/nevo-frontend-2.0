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

const press = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Send request" }));

describe("sending a parent the consent request", () => {
  it("sends using the contact already on the record", async () => {
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([link()]);
    requestParentConsent.mockResolvedValue(receipt("sent"));

    const { container } = render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Consent request sent to Mrs\. Eze/),
    );
    // D07: "Sending a request is deliberate and per-student" - no form, no
    // retyping a contact the school already gave us.
    expect(requestParentConsent).toHaveBeenCalledWith("s1", {
      parentName: "Mrs. Eze",
      parentContact: "mrs.eze@email.com",
      contactMethod: "email",
    });
  });

  it("does not say sent when the backend only queued it", async () => {
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([link()]);
    requestParentConsent.mockResolvedValue(receipt("queued"));

    const { container } = render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/queued for Mrs\. Eze/),
    );
    expect(visibleText(container)).not.toMatch(/sent to Mrs\. Eze/);
  });

  it("handles processing, which the client type used to omit entirely", async () => {
    // `ConsentDeliveryStatus` is four values; the client narrowed it to three,
    // so a real `processing` would have fallen through every branch.
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([link()]);
    requestParentConsent.mockResolvedValue(receipt("processing"));

    const { container } = render(<StudentsView />);
    await press();

    await waitFor(() => expect(visibleText(container)).toMatch(/queued for/));
  });

  it("says so when the backend reports it could not be delivered", async () => {
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([link()]);
    requestParentConsent.mockResolvedValue(receipt("failed"));

    const { container } = render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't get that to Mrs\. Eze/i),
    );
  });

  it("does not offer to send to a child with no guardian contact", async () => {
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([]);

    const { container } = render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/no parent or guardian on Chisom[^.]*record yet. Add one/i),
    );
    // An absent contact is an ordinary state, not a failure, and nothing was
    // posted on its behalf.
    expect(requestParentConsent).not.toHaveBeenCalled();
    expect(visibleText(container)).not.toMatch(/didn't send/i);
  });

  it("says nothing changed when the write is refused", async () => {
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([link()]);
    requestParentConsent.mockRejectedValue(new Error("500"));

    const { container } = render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/didn't send, and nothing has changed/i),
    );
  });

  it("holds the control while the request is in flight", async () => {
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([link()]);
    requestParentConsent.mockImplementation(() => new Promise(() => {}));

    render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled(),
    );
  });

  it("offers nothing where consent is already confirmed", async () => {
    list.mockResolvedValue([
      student({
        consent: {
          status: "confirmed",
          actorId: null,
          actorName: "Mrs. Eze",
          timestamp: null,
          channel: null,
        },
      }),
    ]);

    render(<StudentsView />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });
  it("refuses a phone number rather than inferring SMS from it", async () => {
    /*
     * THIS TEST IS INVERTED FROM WHAT IT USED TO ASSERT, and the inversion is
     * the point. It pinned the fallback: an unrecognised `contactMethod` was
     * decided by the contact itself, so a phone number "goes by SMS".
     *
     * SCRUM-162 (20 Sep) removes SMS entirely - "You cannot collect personal
     * data you have no use for." Nothing may choose `sms` any more, and a
     * contact we cannot email is refused rather than sent.
     *
     * Sending it as `contactMethod: "email"` instead would satisfy the ruling's
     * letter, go nowhere, and tell the school it was queued - which is the
     * invite defect this repo already paid for once.
     */
    list.mockResolvedValue([student()]);
    parentLinks.mockResolvedValue([
      link({ contactMethod: "whatsapp", parentContact: "+2348012345678" }),
    ]);

    render(<StudentsView />);
    await press();

    await waitFor(() =>
      expect(screen.getByText(/only have a phone number/i)).toBeInTheDocument(),
    );
    expect(requestParentConsent).not.toHaveBeenCalled();
  });
});
