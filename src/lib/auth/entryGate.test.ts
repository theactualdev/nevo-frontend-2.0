import { beforeEach, describe, expect, it, vi } from "vitest";

const { myConsentGate, reportClientError } = vi.hoisted(() => ({
  myConsentGate: vi.fn(),
  reportClientError: vi.fn(),
}));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));
vi.mock("@/lib/api/clientErrors", () => ({ reportClientError }));

import {
  enterFirstLesson,
  entryRoute,
  ssoLanding,
  studentDestination,
  UNCHECKED_ROUTE,
  WAITING_ROUTE,
  WITHDRAWN_ROUTE,
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
  reportClientError.mockReset();
});

describe("a child the server says may not proceed", () => {
  it("is held, whatever they were heading for", async () => {
    myConsentGate.mockResolvedValue(gate({ blocked: true, status: "pending" }));

    expect(await studentDestination(null)).toBe(WAITING_ROUTE);
    expect(await studentDestination("/student/lessons/l-1")).toBe(
      WAITING_ROUTE,
    );
  });

  it("is held on 00e, not 00d, when the consent was withdrawn (D117)", async () => {
    // 00e: "it was there and is gone, so 'soon' would be a lie".
    myConsentGate.mockResolvedValue(
      gate({ blocked: true, granted: false, status: "withdrawn" }),
    );

    expect(await studentDestination("/student/lessons/l-1")).toBe(
      WITHDRAWN_ROUTE,
    );
  });

  it("is not held on 00e for a withdrawal the server does not block on", async () => {
    // `blocked` decides; `status` only says which hold.
    myConsentGate.mockResolvedValue(
      gate({ blocked: false, granted: false, status: "withdrawn" }),
    );

    expect(await studentDestination(null)).toBe("/student/dashboard");
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
  it("holds them, carrying where they were going - a check that cannot complete does not leave the door open (D69)", async () => {
    /*
     * Design, 4 and 6 Oct, raised as a defect: "If the consent lookup or the
     * account creation fails, the child does not proceed. Today they do."
     * This used to let them through on the reading that a dropped network is
     * not a missing consent.
     */
    myConsentGate.mockRejectedValue(new Error("network"));

    const to = await studentDestination("/student/lessons/l-1");

    expect(to).toBe(`${UNCHECKED_ROUTE}?next=%2Fstudent%2Flessons%2Fl-1`);
    expect(to).not.toBe("/student/lessons/l-1");
  });

  it("is its own hold, not 00d or 00e: the consent was not read as missing", async () => {
    myConsentGate.mockRejectedValue(new Error("503"));

    const to = await studentDestination(null);

    expect(to.startsWith(UNCHECKED_ROUTE)).toBe(true);
    expect(to).not.toBe(WAITING_ROUTE);
    expect(to).not.toBe(WITHDRAWN_ROUTE);
  });

  it("reports the failure, so the hold's We're on it is true (B36)", async () => {
    const cause = new Error("503");
    myConsentGate.mockRejectedValue(cause);

    await studentDestination(null);

    expect(reportClientError).toHaveBeenCalledWith(cause, "student");
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

  it("holds on a failed read rather than opening the lesson (D69)", async () => {
    myConsentGate.mockRejectedValue(new Error("offline"));
    const go = vi.fn();

    await enterFirstLesson(FIRST, go);

    expect(go).toHaveBeenCalledWith(
      `${UNCHECKED_ROUTE}?next=%2Fstudent%2Flessons%2Ffrac-1`,
    );
    expect(go).not.toHaveBeenCalledWith(FIRST);
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

  it("takes a consented child with no PIN into the first run", () => {
    expect(entryRoute(state())).toBe("first-run");
    expect(entryRoute(state({ pinCleared: false }))).toBe("first-run");
  });

  it("sends a child whose PIN a teacher cleared to choose a new one (B67)", () => {
    // Not 00c, which 401s on the PIN they remember, and not the first run,
    // which would sit them through the baseline again.
    expect(entryRoute(state({ pinCleared: true }))).toBe("new-pin");
  });

  it("holds a cleared child exactly as it holds any other", () => {
    // Consent first, then the age check, whatever `pinCleared` says.
    expect(
      entryRoute(state({ pinCleared: true, consentState: "pending" })),
    ).toBe("waiting");
    expect(
      entryRoute(state({ pinCleared: true, consentState: "withdrawn" })),
    ).toBe("withdrawn");
    expect(
      entryRoute(state({ pinCleared: true, ageCheckPending: true })),
    ).toBe("age-check");
  });

  it("signs in a child the server says has a PIN, even with pinCleared set", () => {
    // `accountReady` is "has a PIN and can sign in normally" (B64).
    expect(
      entryRoute(state({ pinCleared: true, accountReady: true })),
    ).toBe("sign-in");
  });

  it("holds a child whose consent is pending at 00d, and one whose consent was withdrawn at 00e", () => {
    expect(entryRoute(state({ consentState: "pending" }))).toBe("waiting");
    // D117: there and gone, so 00d's "It will be soon" would be a lie.
    expect(entryRoute(state({ consentState: "withdrawn" }))).toBe(
      "withdrawn",
    );
    expect(
      entryRoute(state({ consentState: "withdrawn", accountReady: true })),
    ).toBe("withdrawn");
  });

  it("holds a child whose date of birth is in dispute, at the age check", () => {
    // Backend, B64: the child cannot start and can do nothing about it.
    expect(entryRoute(state({ ageCheckPending: true }))).toBe("age-check");
  });

  it("holds at the age check before it signs in", () => {
    // The age check gates every door a child can reach, sign-in included.
    expect(
      entryRoute(state({ ageCheckPending: true, accountReady: true })),
    ).toBe("age-check");
  });

  it("holds for consent before the age check, while consent is outstanding or gone", () => {
    expect(
      entryRoute(state({ ageCheckPending: true, consentState: "pending" })),
    ).toBe("waiting");
    expect(
      entryRoute(state({ ageCheckPending: true, consentState: "withdrawn" })),
    ).toBe("withdrawn");
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

  it("sends a child who already has a PIN to sign back in", () => {
    // B64: accountReady means "has a PIN and can sign in normally".
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
