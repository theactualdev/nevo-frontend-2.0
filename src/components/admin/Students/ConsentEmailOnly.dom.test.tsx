import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { parentLinks, requestParentConsent } = vi.hoisted(() => ({
  parentLinks: vi.fn(),
  requestParentConsent: vi.fn(),
}));

vi.mock("@/lib/api/students", () => ({ studentsApi: { parentLinks } }));
vi.mock("@/lib/api/consents", () => ({
  consentsApi: { requestParentConsent },
}));

import {
  consentRequestLine,
  useConsentRequests,
} from "./useConsentRequests";

/**
 * SCRUM-162: parent contact is EMAIL ONLY. No phone, no SMS.
 *
 * Before the ruling, `methodFor` picked a method and fell through to `sms` for
 * any contact without an `@` — including one the school had never said was a
 * phone. That is the behaviour being removed, and these pin the two halves of
 * it: nothing may CHOOSE sms, and a contact we cannot email must be refused
 * rather than sent as though it were an email address.
 *
 * The refusal is the part that could regress silently. Sending
 * `contactMethod: "email"` with a phone number would satisfy the ruling's
 * letter, go nowhere, and tell the school it was queued — which is the invite
 * defect this repo has already paid for once.
 */

const link = (parentContact: string, contactMethod = "email") => [
  { parentName: "Mrs Eze", parentContact, contactMethod },
];

beforeEach(() => {
  parentLinks.mockReset();
  requestParentConsent.mockReset();
  requestParentConsent.mockResolvedValue({ deliveryStatus: "sent" });
});

describe("what gets sent", () => {
  it("always sends email, never sms", async () => {
    parentLinks.mockResolvedValue(link("mrs.eze@email.com"));
    const { result } = renderHook(() => useConsentRequests());

    act(() => result.current.send("s1"));
    await waitFor(() =>
      expect(result.current.stateFor("s1").kind).toBe("done"),
    );

    expect(requestParentConsent.mock.calls[0][1].contactMethod).toBe("email");
  });

  it("sends email even when the record itself declares sms", async () => {
    // A pre-ruling record. We no longer honour the declared channel when
    // choosing — the contact is an email, so the request goes by email.
    parentLinks.mockResolvedValue(link("mrs.eze@email.com", "sms"));
    const { result } = renderHook(() => useConsentRequests());

    act(() => result.current.send("s1"));
    await waitFor(() =>
      expect(result.current.stateFor("s1").kind).toBe("done"),
    );

    expect(requestParentConsent.mock.calls[0][1].contactMethod).toBe("email");
  });
});

describe("a contact we cannot email", () => {
  it("refuses rather than sending a phone number as an email", async () => {
    parentLinks.mockResolvedValue(link("+234 801 234 5678"));
    const { result } = renderHook(() => useConsentRequests());

    act(() => result.current.send("s1"));
    await waitFor(() =>
      expect(result.current.stateFor("s1").kind).toBe("needsEmail"),
    );

    expect(requestParentConsent).not.toHaveBeenCalled();
  });

  it("is distinct from having no contact at all", async () => {
    // Different state, because the school's next action is different: add an
    // email to a record that has a guardian, rather than find a guardian.
    parentLinks.mockResolvedValue([]);
    const { result } = renderHook(() => useConsentRequests());

    act(() => result.current.send("s1"));
    await waitFor(() =>
      expect(result.current.stateFor("s1").kind).toBe("noContact"),
    );
  });

  it("names the guardian and says what to add", async () => {
    const line = consentRequestLine(
      { kind: "needsEmail", parentName: "Mrs Eze" },
      "Chisom",
    );
    expect(line).toMatch(/only have a phone number for Mrs Eze/i);
    expect(line).toMatch(/needs an email address/i);
  });

  it("never tells the school it was sent", async () => {
    // The dangerous failure: a school that believes consent was requested
    // waits for a reply that is never coming.
    parentLinks.mockResolvedValue(link("08012345678"));
    const { result } = renderHook(() => useConsentRequests());

    act(() => result.current.send("s1"));
    await waitFor(() =>
      expect(result.current.stateFor("s1").kind).toBe("needsEmail"),
    );

    const line = consentRequestLine(result.current.stateFor("s1"), "Chisom");
    // Word boundaries matter here: "Consent" contains "sent", and the first
    // draft of this assertion failed on its own copy because of it.
    expect(line).not.toMatch(/\bsent\b|\bqueued\b/i);
  });
});
