import { beforeEach, describe, expect, it, vi } from "vitest";

const { myConsentGate } = vi.hoisted(() => ({ myConsentGate: vi.fn() }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));

import {
  enterFirstLesson,
  entryRoute,
  ssoLanding,
  studentDestination,
  WAITING_ROUTE,
} from "./entryGate";

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

describe("the hand-off out of onboarding", () => {
  const FIRST = "/student/lessons/frac-1";

  it("holds a child the server says may not proceed, instead of opening the lesson", async () => {
    myConsentGate.mockResolvedValue(gate({ blocked: true, granted: false }));
    const go = vi.fn();

    await enterFirstLesson(FIRST, go);

    expect(go).toHaveBeenCalledWith(WAITING_ROUTE);
    expect(go).not.toHaveBeenCalledWith(FIRST);
  });

  it("opens the first lesson for a child who may proceed", async () => {
    myConsentGate.mockResolvedValue(gate());
    const go = vi.fn();

    await enterFirstLesson(FIRST, go);

    expect(go).toHaveBeenCalledWith(FIRST);
  });

  it("does not turn a failed read into a hold", async () => {
    myConsentGate.mockRejectedValue(new Error("offline"));
    const go = vi.fn();

    await enterFirstLesson(FIRST, go);

    expect(go).toHaveBeenCalledWith(FIRST);
  });
});

/**
 * `SsoCallbackResponse.destination` is an ENUM, and the callback routed to it
 * as a path - "home_dashboard" is a relative URL that 404s, and passing it
 * through `studentDestination` skipped consent because it is not under
 * `/student`.
 */
describe("ssoLanding", () => {
  it("sends a child's first use into the Observed Interaction Sequence", () => {
    expect(ssoLanding("student", "observed_interaction")).toBe(
      "/student/onboarding/sequence",
    );
  });

  it("sends a returning child Home", () => {
    expect(ssoLanding("student", "home_dashboard")).toBe("/student/dashboard");
  });

  it("lands every child on a route consent is resolved for", () => {
    for (const d of ["observed_interaction", "home_dashboard", "new_value", null]) {
      expect(ssoLanding("student", d)?.startsWith("/student/")).toBe(true);
    }
  });

  it("does not guess first use from a value it does not know", () => {
    // Guessing first use would run the baseline again on a returning child.
    expect(ssoLanding("student", "new_value")).toBe("/student/dashboard");
  });

  it("sends staff to their own console, not the enum", () => {
    expect(ssoLanding("teacher", "home_dashboard")).toBe("/teacher/dashboard");
    expect(ssoLanding("senco_admin", "home_dashboard")).toBe("/admin");
  });

  it("has nowhere for a role no console serves", () => {
    expect(ssoLanding("parent_guardian", "home_dashboard")).toBeNull();
    expect(ssoLanding(undefined, "home_dashboard")).toBeNull();
  });
});

/**
 * 05 Entry's share of the rule. The lookup matched a child on their school
 * code and Student ID; where they go next is decided here and only here.
 */
describe("entryRoute", () => {
  const state = (over: Record<string, unknown> = {}) => ({
    consentState: "given" as const,
    accountReady: false,
    ageCheckPending: false,
    ...over,
  });

  it("takes a consented child with no account into the first run", () => {
    expect(entryRoute(state())).toBe("first-run");
  });

  it("holds a child whose consent is pending, or withdrawn", () => {
    expect(entryRoute(state({ consentState: "pending" }))).toBe("waiting");
    expect(entryRoute(state({ consentState: "withdrawn" }))).toBe("waiting");
  });

  it("holds a child whose date of birth is in dispute, on the same screen", () => {
    // Design, 23 Sep: same screen as 00d, same words, different state.
    expect(entryRoute(state({ ageCheckPending: true }))).toBe("waiting");
  });

  it("holds on a consent state it does not know", () => {
    // A value the contract adds later is not a yes.
    expect(
      entryRoute(
        state({ consentState: "not_sent" }) as unknown as Parameters<
          typeof entryRoute
        >[0],
      ),
    ).toBe("waiting");
  });

  it("sends a child who already has an account to sign back in", () => {
    expect(entryRoute(state({ accountReady: true }))).toBe("sign-in");
  });

  it("holds before it signs in: one screen per state, whatever the door", () => {
    expect(
      entryRoute(state({ consentState: "pending", accountReady: true })),
    ).toBe("waiting");
  });

  it("treats an absent ageCheckPending as no dispute, as the contract defaults it", () => {
    expect(
      entryRoute({ consentState: "given", accountReady: false }),
    ).toBe("first-run");
  });
});
