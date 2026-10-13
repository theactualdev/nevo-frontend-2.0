import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import {
  clientErrorReport,
  reportableRoute,
  surfaceForPath,
} from "./clientErrors";

/**
 * Crash reports (B36). The screens say "We're on it", and this is what makes
 * that true - but the endpoint is a log line backend will read, so what is
 * pinned here is mostly what must NOT reach it: anything a child typed, any
 * lesson text, any token.
 *
 * `.dom.test.ts` because sending needs `window`, and `client.ts` reads it.
 */

/** A child's held answer, which is exactly what `JSON.parse` quotes back. */
const CHILD_TEXT = "My answer is seven";

/** A real V8 parse failure on a child's words, not a hand-built one. */
function parseFailure(): Error {
  try {
    JSON.parse(CHILD_TEXT);
  } catch (e) {
    return e as Error;
  }
  throw new Error("JSON.parse accepted it");
}

/** `ClientErrorReport`'s properties on the deployed contract, 6 Oct. */
const CONTRACT_FIELDS = [
  "message",
  "route",
  "stack",
  "appVersion",
  "surface",
  "incidentId",
];

describe("what a report carries", () => {
  it("is the contract's fields and nothing else", () => {
    const report = clientErrorReport(new Error("x"), "student", "/student/dashboard");

    for (const key of Object.keys(report)) {
      expect(CONTRACT_FIELDS).toContain(key);
    }
    expect(report.surface).toBe("student");
  });

  it("keeps the fault but not the child's words it quoted", () => {
    const report = clientErrorReport(parseFailure(), "student", "/student/dashboard");

    expect(report.message).toMatch(/^SyntaxError: /);
    expect(report.message).toMatch(/is not valid JSON/);
    expect(report.message).not.toContain(CHILD_TEXT);
  });

  it("sends the stack's frames, never the message V8 puts at the top of it", () => {
    // V8's stack opens "SyntaxError: ... "My answer is seven" ...", so sending
    // the stack whole would carry back what the message filter took out.
    const error = parseFailure();
    expect(error.stack).toContain(CHILD_TEXT);

    const report = clientErrorReport(error, "student", "/student/dashboard");

    expect(report.stack).not.toContain(CHILD_TEXT);
    for (const line of report.stack?.split("\n") ?? []) {
      expect(line).toMatch(/^\s*at\s/);
    }
  });

  it("takes values out of the route, and never sends the query string", () => {
    expect(reportableRoute("/student/entry/Xk92mQ4pLt7?token=abc123")).toBe(
      "/student/entry/:param",
    );
    expect(
      reportableRoute(
        "/student/lessons/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/summary",
      ),
    ).toBe("/student/lessons/:param/summary");
    // Our own route names stay, or the report would say nothing.
    expect(reportableRoute("/student/lessons/review-session")).toBe(
      "/student/lessons/review-session",
    );
    expect(reportableRoute("/student/warm-up#top")).toBe("/student/warm-up");
  });

  it("takes a token in the path out of the message and the stack as well", () => {
    const path = "/student/entry/Xk92mQ4pLt7";
    const error = new Error(`could not resolve ${path}`);
    error.stack = `Error: could not resolve ${path}\n    at https://nevo.test${path}:1:20`;

    const report = clientErrorReport(error, "student", path);

    expect(JSON.stringify(report)).not.toContain("Xk92mQ4pLt7");
  });

  it("sends the kind of a thrown non-error, never its contents", () => {
    const report = clientErrorReport(CHILD_TEXT, "student", "/student/dashboard");

    expect(report.message).toBe("Non-error thrown: string");
    expect(report.stack).toBeNull();
  });

  it("carries the server's reference when a failed read was what was thrown", () => {
    const report = clientErrorReport(
      new ApiError(500, "x", {
        detail: { code: "unexpected_error", incidentId: "9f2c4a7b1d3e" },
      }),
      "student",
      "/student/dashboard",
    );

    expect(report.incidentId).toBe("9f2c4a7b1d3e");
  });

  it("carries Next's digest, which finds the server's own log line", () => {
    const error = Object.assign(new Error("render failed"), { digest: "2913374" });

    expect(clientErrorReport(error, "student", "/").message).toContain(
      "digest 2913374",
    );
  });

  it("stays inside the contract's bounds, where a 422 would lose the report", () => {
    const error = new Error("x".repeat(5000));
    error.stack = Array.from({ length: 2000 }, (_, i) => `    at f${i} (a.js:1:1)`).join("\n");

    const report = clientErrorReport(error, "student", `/student/${"lessons/".repeat(60)}`);

    expect(report.message.length).toBeLessThanOrEqual(2000);
    expect(report.stack!.length).toBeLessThanOrEqual(20000);
    expect(report.route!.length).toBeLessThanOrEqual(300);
  });
});

describe("whose console it was", () => {
  it("counts the child's sign-in doors as the child's", () => {
    for (const path of [
      "/student/dashboard",
      "/auth/login",
      "/auth/sign-in",
      "/auth/session-expired",
    ]) {
      expect(surfaceForPath(path)).toBe("student");
    }
  });

  it("names the others, and says unknown rather than guess", () => {
    expect(surfaceForPath("/teacher/classes")).toBe("teacher");
    expect(surfaceForPath("/auth/teacher")).toBe("teacher");
    expect(surfaceForPath("/admin")).toBe("admin");
    expect(surfaceForPath("/parent-portal")).toBe("parent");
    expect(surfaceForPath("/")).toBe("unknown");
    expect(surfaceForPath("/studentish")).toBe("unknown");
  });
});

describe("sending one", () => {
  // `reported` is module state and latches per page, so each test takes a
  // fresh copy - otherwise the first report would silence the rest, and the
  // "once" test would pass for the wrong reason.
  const fresh = async () => {
    vi.resetModules();
    return import("./clientErrors");
  };
  const posted = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes("/client-errors"));

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ incidentId: "abc", receivedAt: "2026-10-06T10:00:00Z" }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/student/lessons/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d?next=x");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it("posts the report to the contract's path, in the background", async () => {
    const { reportClientError } = await fresh();

    reportClientError(new Error("boom"), "student");
    await vi.waitFor(() => expect(posted()).toHaveLength(1));

    const [url, init] = posted()[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/client-errors$/);
    expect(init.method).toBe("POST");
    // So a child who taps Go back at once does not cancel it.
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(String(init.body));
    expect(body.route).toBe("/student/lessons/:param");
    expect(body.surface).toBe("student");
    expect(String(init.body)).not.toContain("next=");
  });

  it("sends one fault once, however often the boundary renders it", async () => {
    const { reportClientError } = await fresh();

    // A re-render, StrictMode's second effect, and a Try again that failed the
    // same way: three objects, one fault, thrown from one place.
    const boom = () => new Error("boom");
    reportClientError(boom(), "student");
    reportClientError(boom(), "student");
    reportClientError(boom(), "student");
    await vi.waitFor(() => expect(posted()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));

    expect(posted()).toHaveLength(1);
  });

  it("still sends a different fault", async () => {
    const { reportClientError } = await fresh();

    reportClientError(new Error("boom"), "student");
    reportClientError(new TypeError("other"), "student");

    await vi.waitFor(() => expect(posted()).toHaveLength(2));
  });

  it("swallows a report that fails, so it never shows", async () => {
    // An unhandled rejection fails this file, so passing is the assertion.
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { reportClientError } = await fresh();

    expect(() => reportClientError(new Error("boom"), "student")).not.toThrow();
    await vi.waitFor(() => expect(posted()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
  });

  it("swallows a refusal the same way", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const { reportClientError } = await fresh();

    reportClientError(new Error("boom"), "student");
    await vi.waitFor(() => expect(posted()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
  });
});
