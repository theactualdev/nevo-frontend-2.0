import { describe, expect, it } from "vitest";
import { OVERDUE_LINE } from "./overdue";

/**
 * D11.8, whose constraints are absolute: no red, no warning glyph, no
 * countdown, and - since the 2 Nov audit - no number worked out on this
 * device. The day count is the backend's to give (L1, rule 3).
 */

describe("the overdue row line", () => {
  it("says it is past its due date and that nothing has changed for the children", () => {
    expect(OVERDUE_LINE).toBe("Past its due date. Nothing has changed for your students.");
  });

  it("carries no count and no consequence", () => {
    expect(OVERDUE_LINE).not.toMatch(/[0-9]/);
    expect(OVERDUE_LINE).not.toMatch(/suspend|access|risk|lose|warning/i);
  });
});
