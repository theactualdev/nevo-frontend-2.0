import { describe, expect, it } from "vitest";
import { ADDING_FRACTIONS } from "./adding-fractions";
import { PHOTOSYNTHESIS } from "./photosynthesis";

/**
 * THE SIGNED-OUT WALKTHROUGH'S QUICK CHECKS SAY WHAT THE FRAME SAYS (D93).
 *
 * Design confirmed the recovery note on 6 Oct as "Not quite. Let's look
 * again." - "'Your progress is saved' comes off for the same reason as D89",
 * and the explanation does not render until a field carries it. The authored
 * lessons are the walkthrough a visitor reads, so they carry the same line a
 * signed-in child's check does (`toQuickCheck`).
 */

const checks = [PHOTOSYNTHESIS, ADDING_FRACTIONS].flatMap((lesson) =>
  lesson.segments.flatMap((s) =>
    s.quickCheck ? [[`${lesson.id}/${s.id}`, s.quickCheck] as const] : [],
  ),
);

describe("the walkthrough's quick checks", () => {
  it("has checks to look at", () => {
    expect(checks.length).toBeGreaterThanOrEqual(3);
  });

  it("recover with design's line, and claim no save", () => {
    for (const [where, check] of checks) {
      expect(check.recoveryNote, where).toBe("Not quite. Let's look again.");
      expect(check.recoveryNote, where).not.toMatch(/saved/i);
    }
  });
});
