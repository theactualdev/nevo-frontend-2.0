import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculationFallbackReport } from "./clientErrors";

/**
 * A calculation the child was given as its text instead (Teslim, 19 Oct: "A
 * renderer failure on the device should use the source body and report the
 * failure"). It goes to the crash endpoint, whose field list is closed and
 * which takes nothing about a child and no lesson text - so what is pinned
 * here is that it names WHICH lesson and segment, why in our own words, and
 * nothing else.
 */

const LESSON = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const SEGMENT = "5c6a1f2e-0d4b-4e1a-9f3c-7a2b8c9d0e1f";
const PATH = `/student/lessons/${LESSON}`;

/** `ClientErrorReport`'s properties on the deployed contract (20 Oct spec). */
const CONTRACT_FIELDS = [
  "message",
  "route",
  "stack",
  "appVersion",
  "surface",
  "incidentId",
];

describe("the report for a calculation shown as text", () => {
  it("names the lesson, the segment and why, in the contract's fields alone", () => {
    const report = calculationFallbackReport(
      {
        lessonId: LESSON,
        segmentId: SEGMENT,
        reason: "step 2 of 3: a number step with no stored answer",
      },
      PATH,
    );

    for (const key of Object.keys(report)) {
      expect(CONTRACT_FIELDS).toContain(key);
    }
    expect(report.message).toBe(
      `Calculation shown as its source text: lesson ${LESSON}, segment ${SEGMENT}: step 2 of 3: a number step with no stored answer`,
    );
    expect(report.surface).toBe("student");
    // The route still has its values taken out, as every report's does.
    expect(report.route).toBe("/student/lessons/:param");
    expect(report.stack).toBeNull();
    expect(report.incidentId).toBeNull();
  });

  it("adds what the solver threw, cut down as any crash is, with its frames alone", () => {
    const error = new TypeError(
      'Cannot read "My answer is seven" of undefined',
    );
    error.stack = [
      `TypeError: Cannot read "My answer is seven" of undefined`,
      "    at CalculationSolver (solver.js:10:5)",
      "    at renderWithHooks (react.js:1:1)",
    ].join("\n");

    const report = calculationFallbackReport(
      {
        lessonId: LESSON,
        segmentId: SEGMENT,
        reason: "the solver failed on the device",
        error,
      },
      PATH,
    );

    expect(report.message).toBe(
      `Calculation shown as its source text: lesson ${LESSON}, segment ${SEGMENT}: the solver failed on the device - TypeError: Cannot read "[redacted]" of undefined`,
    );
    expect(report.stack).toBe(
      "    at CalculationSolver (solver.js:10:5)\n    at renderWithHooks (react.js:1:1)",
    );
    expect(JSON.stringify(report)).not.toContain("My answer is seven");
  });

  it("stays inside the contract's bounds", () => {
    const report = calculationFallbackReport(
      {
        lessonId: LESSON,
        segmentId: SEGMENT,
        reason: "x".repeat(5000),
        error: new Error("y".repeat(5000)),
      },
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

  it("posts it to the crash endpoint, once for a segment however often it is met", async () => {
    const { reportCalculationFallback } = await fresh();
    const fallback = {
      lessonId: LESSON,
      segmentId: SEGMENT,
      reason: "no steps",
    };

    reportCalculationFallback(fallback);
    reportCalculationFallback(fallback);
    await vi.waitFor(() => expect(posted()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));

    expect(posted()).toHaveLength(1);
    const [url, init] = posted()[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/client-errors$/);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: expect.stringContaining(`segment ${SEGMENT}: no steps`),
      surface: "student",
    });
  });

  it("still sends another segment's", async () => {
    const { reportCalculationFallback } = await fresh();

    reportCalculationFallback({ lessonId: LESSON, segmentId: "a", reason: "no steps" });
    reportCalculationFallback({ lessonId: LESSON, segmentId: "b", reason: "no steps" });

    await vi.waitFor(() => expect(posted()).toHaveLength(2));
  });
});
