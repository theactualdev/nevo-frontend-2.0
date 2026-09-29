import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { withGate } from "@/test/setupGate";
import { ApiError } from "@/lib/api/client";
import { StudentDetailView } from "./StudentDetailView";

/**
 * Consent is a gate, so a child with no guardian on record could never start
 * - and the student page said "No guardian on the record" with nothing to
 * press. Adding one sends the consent request in the same step.
 */

const parentLinks = vi.fn();
const addGuardian = vi.fn();

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
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const MRS_EZE = {
  id: "pl1",
  schoolId: "sch1",
  studentId: "s1",
  parentId: null,
  parentName: "Mrs. Eze",
  parentContact: "eze@example.com",
  contactMethod: "email" as const,
  accountCreated: false,
};

const fillAndSend = () => {
  fireEvent.click(screen.getByRole("button", { name: /Add a parent or guardian/ }));
  fireEvent.change(screen.getByLabelText(/Parent or guardian.s name/), {
    target: { value: "Mrs. Eze" },
  });
  fireEvent.change(screen.getByLabelText(/Their email/), {
    target: { value: "eze@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Add and send the consent request/ }));
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

describe("adding a guardian to a student with none", () => {
  it("offers a way forward instead of a dead end", async () => {
    const { container } = render(<StudentDetailView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No guardian on the record/));

    expect(visibleText(container)).toMatch(/Chisom can.t start until a parent or guardian gives permission/);
    expect(screen.getByRole("button", { name: /Add a parent or guardian/ })).toBeEnabled();
  });

  it("adds the guardian, sends the request, and shows them on the record", async () => {
    const { container } = render(<StudentDetailView studentId="s1" />);
    await screen.findByRole("button", { name: /Add a parent or guardian/ });
    parentLinks.mockResolvedValue([MRS_EZE]);
    fillAndSend();

    await waitFor(() =>
      expect(addGuardian).toHaveBeenCalledWith("s1", { name: "Mrs. Eze", email: "eze@example.com" }),
    );
    // Queued, not "sent" - it never claims delivery it was not told about.
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Consent request queued for Mrs\. Eze/),
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/eze@example\.com/));
    expect(visibleText(container)).not.toMatch(/No guardian on the record/);
  });

  it("will not send to something that is not an email address", async () => {
    render(<StudentDetailView studentId="s1" />);
    await screen.findByRole("button", { name: /Add a parent or guardian/ });
    fireEvent.click(screen.getByRole("button", { name: /Add a parent or guardian/ }));
    fireEvent.change(screen.getByLabelText(/Parent or guardian.s name/), { target: { value: "Mrs. Eze" } });
    fireEvent.change(screen.getByLabelText(/Their email/), { target: { value: "08031234567" } });

    expect(screen.getByRole("button", { name: /Add and send/ })).toBeDisabled();
    expect(screen.getByText(/doesn.t look like an email address/)).toBeInTheDocument();
  });

  it("shows the server's reason when it refuses", async () => {
    addGuardian.mockRejectedValue(
      new ApiError(422, "no", { detail: { code: "validation_error", message: "That email address can't receive mail." } }),
    );
    const { container } = render(<StudentDetailView studentId="s1" />);
    await screen.findByRole("button", { name: /Add a parent or guardian/ });
    fillAndSend();

    await waitFor(() => expect(visibleText(container)).toMatch(/can't receive mail/));
  });

  it("pauses while setup is unfinished, like every other change", async () => {
    render(withGate(<StudentDetailView studentId="s1" />, "not_active"));
    expect(await screen.findByRole("button", { name: /Add a parent or guardian/ })).toBeDisabled();
  });
});
