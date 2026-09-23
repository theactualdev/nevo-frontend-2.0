import { beforeEach, describe, expect, it, vi } from "vitest";

const { myConsentGate } = vi.hoisted(() => ({ myConsentGate: vi.fn() }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));

import { studentDestination, WAITING_ROUTE } from "./entryGate";

/**
 * One rule, four doors. Design, 23 Sep: *"the gate is on the child's consent
 * state, not on the route they arrived by... a child in the same state meets
 * the same screen whichever door they use."*
 */

const gate = (over: Record<string, unknown> = {}) => ({
  studentId: "s-1",
  granted: true,
  blocked: false,
  requiredType: "data_processing",
  status: "confirmed",
  ...over,
});

beforeEach(() => {
  myConsentGate.mockReset();
});

describe("a child the server says may not proceed", () => {
  it("is held, whatever they were heading for", async () => {
    myConsentGate.mockResolvedValue(gate({ blocked: true }));

    expect(await studentDestination(null)).toBe(WAITING_ROUTE);
    expect(await studentDestination("/student/lessons/l-1")).toBe(
      WAITING_ROUTE,
    );
  });
});

describe("a child who may", () => {
  it("goes where they were going", async () => {
    myConsentGate.mockResolvedValue(gate());

    expect(await studentDestination("/student/lessons/l-1")).toBe(
      "/student/lessons/l-1",
    );
  });

  it("goes to the dashboard when nothing was asked for", async () => {
    myConsentGate.mockResolvedValue(gate());

    expect(await studentDestination(null)).toBe("/student/dashboard");
    expect(await studentDestination("")).toBe("/student/dashboard");
  });
});

describe("what it reads, and what it refuses to read", () => {
  it("follows `blocked` rather than `granted`", async () => {
    /*
     * THE DECISIVE ONE. `granted` is false in three of the four consent states
     * - `not_sent`, `pending` and `withdrawn` - so reading it would have the
     * frontend deciding a policy out of a field that does not state one.
     * `blocked` is the server's own answer to "may this child proceed?".
     */
    myConsentGate.mockResolvedValue(
      gate({ granted: false, blocked: false, status: "pending" }),
    );

    expect(await studentDestination(null)).toBe("/student/dashboard");
  });

  it("holds on `blocked` even when consent reads as granted", async () => {
    // The mirror. Whatever the server means by the combination, the answer to
    // "may they proceed" is the field named for it.
    myConsentGate.mockResolvedValue(gate({ granted: true, blocked: true }));

    expect(await studentDestination(null)).toBe(WAITING_ROUTE);
  });
});

describe("when the read does not answer", () => {
  it("lets them through - a dropped network is not a missing consent", async () => {
    /*
     * Same ruling `useConsentGate` made for withdrawal and `StudentEntry` made
     * for the link. Holding on an outage builds a wall a child cannot pass and
     * cannot be told about, at the moment they have just proved who they are.
     */
    myConsentGate.mockRejectedValue(new Error("network"));

    expect(await studentDestination("/student/dashboard")).toBe(
      "/student/dashboard",
    );
  });
});

describe("doors that are not a child's", () => {
  it("leaves a teacher's destination alone, and does not ask", async () => {
    // `consent-gate` is `students/me`. A teacher arriving through the shared
    // SSO callback has no student consent to read, so asking is a call that
    // can only fail.
    expect(await studentDestination("/teacher/dashboard")).toBe(
      "/teacher/dashboard",
    );
    expect(await studentDestination("/admin/overview")).toBe("/admin/overview");
    expect(myConsentGate).not.toHaveBeenCalled();
  });
});
