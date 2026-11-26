import { describe, expect, it } from "vitest";
import { applyMark } from "./draftMarks";

describe("D08's B / I on the draft's markdown", () => {
  it("wraps the selection in bold, and keeps it selected", () => {
    const r = applyMark("She settles fastest when a lesson opens", 4, 11, "bold");
    expect(r.text).toBe("She **settles** fastest when a lesson opens");
    expect(r.text.slice(r.start, r.end)).toBe("settles");
  });

  it("wraps it in italic", () => {
    expect(applyMark("one two", 0, 3, "italic").text).toBe("*one* two");
  });

  it("puts the caret between the marks when nothing is selected", () => {
    const r = applyMark("ab", 1, 1, "bold");
    expect(r.text).toBe("a****b");
    expect(r.start).toBe(3);
    expect(r.end).toBe(3);
  });

  it("does not care which way the selection was made", () => {
    expect(applyMark("one two", 3, 0, "italic").text).toBe("*one* two");
  });
});
