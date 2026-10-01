import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { clearSession, setSession } from "@/lib/auth/session";
import { StudentDetailView } from "./StudentDetailView";

/**
 * Backend, 1 Oct: the consent request is SENCO-ADMIN ONLY ("Check the role
 * before you draw the button"), and a guardian recorded at enrolment carries
 * an email and NO NAME - while the request requires one. Both were drawn as
 * though neither were true.
 */

const parentLinks = vi.fn();
const addGuardian = vi.fn();
const requestParentConsent = vi.fn();

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

const signIn = (role: string) =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "a1",
    role,
  });

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

beforeEach(() => {
  vi.clearAllMocks();
  parentLinks.mockResolvedValue([]);
  addGuardian.mockResolvedValue({
    invitationId: "i1",
    parentLinkId: "pl1",
    studentId: "s1",
    consentTypes: ["data_processing"],
    deliveryStatus: "queued",
    expiresAt: "2026-10-30T00:00:00Z",
  });
});
afterEach(() => clearSession());

describe("an admin without SENCo access", () => {
  beforeEach(() => signIn("other_admin"));

  it("is not offered a request it would be refused, and is told who sends it", async () => {
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No guardian on the record/));
    expect(screen.queryByRole("button", { name: /Send the consent request/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add a parent or guardian/ })).toBeNull();
    expect(visibleText(container)).toMatch(
      /Consent requests are sent by an admin with SENCo \/ Learning Support access/,
    );
  });
});

describe("a guardian recorded at enrolment, with no name", () => {
  beforeEach(() => signIn("senco_admin"));

  it("shows the address rather than a blank row", async () => {
    parentLinks.mockResolvedValue([UNNAMED]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/eze@example\.com/));
    expect(visibleText(container)).toMatch(/They.ll give their own name when they answer the request/);
  });

  it("asks for the name the request needs, then sends to the same address", async () => {
    parentLinks.mockResolvedValue([UNNAMED]);
    const { container } = render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send the consent request" }));

    // Never "nobody on record" - there is somebody, with no name yet.
    await waitFor(() => expect(visibleText(container)).toMatch(/The request needs their name too/));
    expect(visibleText(container)).not.toMatch(/no parent or guardian/i);
    expect(requestParentConsent).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Parent or guardian.s name/), {
      target: { value: "Mrs. Eze" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send the consent request" }).at(-1)!);
    await waitFor(() =>
      expect(addGuardian).toHaveBeenCalledWith("s1", { name: "Mrs. Eze", email: "eze@example.com" }),
    );
    await waitFor(() => expect(visibleText(container)).not.toMatch(/The request needs their name too/));
  });
});
