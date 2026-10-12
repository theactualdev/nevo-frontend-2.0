import { describe, expect, it } from "vitest";
import { toNoticed } from "./useStudentFlags";
import type { AttentionFlag } from "@/lib/api/intelligence";

/**
 * What reaches C08's noticing banner.
 *
 * Tested at the mapper rather than through the profile, because the profile
 * mocks this hook - a rule this console learned the hard way on Home, where
 * three component tests could not see the defect they were written for.
 */

const flag = (over: Partial<AttentionFlag> = {}): AttentionFlag => ({
  id: "f-1",
  studentId: "s-1",
  flagType: "engagement_decline",
  description: "Sessions have been getting shorter over the last fortnight.",
  generatedAt: "2026-09-15T09:00:00Z",
  acknowledged: false,
  ...over,
});

describe("what the banner is given", () => {
  it("carries Nevo's sentence through unchanged", () => {
    const out = toNoticed([flag()]);

    expect(out).toHaveLength(1);
    expect(out[0].note).toBe(
      "Sessions have been getting shorter over the last fortnight.",
    );
  });

  it("drops a flag somebody has already seen", () => {
    // The banner is what still wants the teacher, not a history - the same
    // rule "Worth your attention" follows on the dashboard.
    const out = toNoticed([
      flag({ id: "f-1", acknowledged: true }),
      flag({ id: "f-2", acknowledged: false }),
    ]);

    expect(out.map((n) => n.id)).toEqual(["f-2"]);
  });

  it("puts the most recent first", () => {
    const out = toNoticed([
      flag({ id: "older", generatedAt: "2026-09-02T09:00:00Z" }),
      flag({ id: "newer", generatedAt: "2026-09-14T09:00:00Z" }),
    ]);

    expect(out.map((n) => n.id)).toEqual(["newer", "older"]);
  });

  it("does not hand the banner the flag type", () => {
    // `engagement_decline` beside a named child is the diagnostic register
    // rule 2 forbids. It cannot be rendered by accident if it is not there.
    // `isSudden` is the one bit the profile chip needs (design, 12 Oct): a
    // boolean, not the type's words.
    expect(Object.keys(toNoticed([flag()])[0]).sort()).toEqual([
      "generatedAt",
      "id",
      "isSudden",
      "note",
    ]);
  });

  it("knows a sudden change from a standing pattern", () => {
    expect(toNoticed([flag({ flagType: "sudden_change" })])[0].isSudden).toBe(true);
    expect(toNoticed([flag({ flagType: "engagement_decline" })])[0].isSudden).toBe(false);
  });

  it("says nothing when every flag has been seen", () => {
    expect(toNoticed([flag({ acknowledged: true })])).toEqual([]);
  });
});
