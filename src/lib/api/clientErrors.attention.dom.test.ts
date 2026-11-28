import { describe, expect, it } from "vitest";
import { attentionRefusedReport } from "./clientErrors";

/**
 * A refused focus event, reported (28 Nov): what the server said, and nothing
 * that names a child, a sitting or a section.
 */
describe("attentionRefusedReport", () => {
  const LESSON = "/student/lessons/4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";

  it("says the action, the status and the server's code", () => {
    const report = attentionRefusedReport(
      { status: 404, code: "active_session_not_found", action: "return" },
      LESSON,
    );

    expect(report.message).toBe("Focus event refused: return answered 404 active_session_not_found");
    expect(report.surface).toBe("student");
    expect(report.stack).toBeNull();
  });

  it("takes the ids out of the route", () => {
    const report = attentionRefusedReport({ status: 403, code: null, action: "away" }, LESSON);

    expect(report.route).toBe("/student/lessons/:param");
    expect(report.message).toBe("Focus event refused: away answered 403");
    expect(JSON.stringify(report)).not.toContain("4f1c2a9e");
  });
});
