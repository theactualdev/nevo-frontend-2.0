import { describe, expect, it } from "vitest";
import { isStoredAnswer } from "./storedAnswer";

/**
 * A calculation step is judged by matching, never by working anything out
 * (Lydia, SCRUM-177): the pipeline stores every acceptable form and the
 * child's entry is compared with that list.
 */
describe("matching an entry against the stored answers", () => {
  it("accepts any form the pipeline stored", () => {
    expect(isStoredAnswer("1 + x", ["x + 1", "1 + x"])).toBe(true);
    expect(isStoredAnswer("-2.5", ["-2.5"])).toBe(true);
  });

  it("evaluates nothing: an equal value written another way is not stored", () => {
    expect(isStoredAnswer("0.75", ["3/4"])).toBe(false);
    expect(isStoredAnswer("1 + x", ["x + 1"])).toBe(false);
    expect(isStoredAnswer("3.0", ["3"])).toBe(false);
  });

  it("ignores spacing, which is never part of what is written", () => {
    expect(isStoredAnswer(" 3x-4 ", ["3x - 4"])).toBe(true);
  });

  it("keeps letter case, which can be the whole answer", () => {
    expect(isStoredAnswer("Co", ["CO"])).toBe(false);
  });

  it("never matches an empty entry", () => {
    expect(isStoredAnswer("  ", [""])).toBe(false);
    expect(isStoredAnswer("", ["3"])).toBe(false);
  });
});
