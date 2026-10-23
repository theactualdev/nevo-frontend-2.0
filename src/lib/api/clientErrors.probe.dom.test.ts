import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeNothingToAskReport } from "./clientErrors";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A Module 4 that readiness, read twice, still holds as owed while no subject
 * gives a question. Olayinka's order on Teslim's 21 Oct answers: flag it to
 * backend rather than move the child on (`planProbe`). It goes to the crash
 * endpoint, whose field list is closed and which takes nothing about a child -
 * so what is pinned here is that it says what readiness said (the subject ids
 * it marked available, and the module's status) and nothing else.
 */

/** The continue route, where Module 4 is planned for a child with an account. */
const PATH = "/student/onboarding/continue";

/** `ClientErrorReport`'s properties on the deployed contract (20 Oct spec). */
const CONTRACT_FIELDS = [
  "message",
  "route",
  "stack",
  "appVersion",
  "surface",
  "incidentId",
];

const signIn = () =>
  setSession({
    token: "tok-child",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-7c1e",
    role: "student",
  });

afterEach(() => {
  clearSession();
});

describe("the report for a Module 4 with nothing to ask", () => {
  it("names the subjects and the status readiness sent, in the contract's fields alone", () => {
    const report = probeNothingToAskReport(
      { subjectIds: ["sub-maths", "sub-eng"], status: "pending" },
      PATH,
    );

    for (const key of Object.keys(report)) {
      expect(CONTRACT_FIELDS).toContain(key);
    }
    expect(report.message).toBe(
      "Module 4 has nothing to ask but readiness says the probe is available: subjects [sub-maths, sub-eng], probe status pending",
    );
    expect(report.surface).toBe("student");
    expect(report.route).toBe(PATH);
    expect(report.stack).toBeNull();
    expect(report.incidentId).toBeNull();
  });

  it("says so when readiness sent no status and marked no subject", () => {
    const report = probeNothingToAskReport({ subjectIds: [] }, PATH);

    expect(report.message).toBe(
      "Module 4 has nothing to ask but readiness says the probe is available: subjects [], probe status not sent",
    );
  });

  it("carries nothing about the child, signed in or not", () => {
    signIn();
    const report = probeNothingToAskReport(
      { subjectIds: ["sub-maths"], status: "pending" },
      // A value in the path is taken out, as every report's is.
      "/student/entry/9b1deb4d3b7d",
    );

    const sent = JSON.stringify(report);
    expect(sent).not.toContain("student-7c1e");
    expect(sent).not.toContain("tok-child");
    expect(sent).not.toContain("9b1deb4d3b7d");
    expect(report.route).toBe("/student/entry/:param");
  });

  it("stays inside the contract's bounds", () => {
    const report = probeNothingToAskReport(
      { subjectIds: Array.from({ length: 200 }, (_, i) => `subject-${i}-${"x".repeat(20)}`) },
      PATH,
    );

    expect(report.message.length).toBeLessThanOrEqual(2000);
  });
});

describe("sending it", () => {
  // `reported` latches per page, so each test takes a fresh copy.
  const fresh = async () => {
    vi.resetModules();
    return import("./clientErrors");
  };
  const posted = () =>
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/client-errors"),
    );

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ incidentId: "abc" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", PATH);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it("posts it to the crash endpoint, once for the page however often it is met", async () => {
    const { reportProbeNothingToAsk } = await fresh();
    const found = { subjectIds: ["sub-maths"], status: "pending" };

    reportProbeNothingToAsk(found);
    reportProbeNothingToAsk(found);
    await vi.waitFor(() => expect(posted()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));

    expect(posted()).toHaveLength(1);
    const [url, init] = posted()[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/client-errors$/);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: expect.stringContaining("subjects [sub-maths], probe status pending"),
      surface: "student",
      route: PATH,
    });
  });
});
