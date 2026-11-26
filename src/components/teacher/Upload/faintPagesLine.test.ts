import { describe, expect, it } from "vitest";
import { cleanPagesLine, faintPagesLine, retryPagesLabel } from "./UploadWizard";
import { sourceHeldPages } from "./QuestionsLeftOut";

/**
 * How the faint pages are said.
 *
 * Tested here rather than through the wizard because the wizard needs a staged
 * upload, a session and a poll to reach this line - and the thing worth
 * pinning is the sentence a teacher reads about what is missing from their
 * unit.
 */

describe("the faint-pages line", () => {
  it("says one page in the singular", () => {
    const line = faintPagesLine([4]);

    expect(line).toContain("Page 4 ");
    expect(line).toContain("nothing from it");
  });

  it("says two pages with an and", () => {
    expect(faintPagesLine([4, 7])).toContain("Pages 4 and 7 ");
  });

  it("commas the list and keeps the and for the last one", () => {
    expect(faintPagesLine([4, 7, 12])).toContain("Pages 4, 7 and 12 ");
  });

  it("keeps the order the server sent", () => {
    // These are the parser's page numbers, not ours to sort or renumber.
    expect(faintPagesLine([12, 4])).toContain("Pages 12 and 4 ");
  });

  it("says a run of three or more as a range, not every number", () => {
    // Upload test, 15 Oct: twenty-seven numbers in one sentence.
    const all = Array.from({ length: 27 }, (_, i) => i + 1);
    expect(faintPagesLine(all)).toContain("Pages 1 to 27 ");
    expect(faintPagesLine(all)).toContain("nothing from them");
  });

  it("mixes ranges and single pages, keeping two in a row as two", () => {
    expect(faintPagesLine([3, 4, 5, 9, 11, 12])).toContain("Pages 3 to 5, 9, 11 and 12 ");
  });

  it("joins only runs the server sent in order", () => {
    expect(faintPagesLine([5, 4, 3])).toContain("Pages 5, 4 and 3 ");
  });

  it("says what it means for the unit, not just which pages", () => {
    // A teacher who reads only the first half must still learn that the tree
    // below is incomplete.
    expect(faintPagesLine([4])).toContain("is in what you see below");
  });
});

/**
 * Backlog item 38: C07f's retry names the pages it retries ("Retry pages
 * 15-16"), said exactly as the line above says them.
 */
describe("the retry's label", () => {
  it("names one page in the singular", () => {
    expect(retryPagesLabel([4])).toBe("Retry page 4");
  });

  it("names the pages as the line does", () => {
    expect(retryPagesLabel([15, 16])).toBe("Retry pages 15 and 16");
    expect(retryPagesLabel([3, 4, 5, 9])).toBe("Retry pages 3 to 5 and 9");
    expect(faintPagesLine([3, 4, 5, 9])).toContain("Pages 3 to 5 and 9 ");
  });
});

// C07f's "Pages 1-14 parsed cleanly." from the server's `pageTotal` (T11).
describe("cleanPagesLine", () => {
  it("names every page the server did not list as failed", () => {
    expect(cleanPagesLine(16, [15, 16])).toBe("Pages 1 to 14 parsed cleanly.");
  });

  it("names a gap in the middle as the pages either side of it", () => {
    expect(cleanPagesLine(8, [4, 5])).toBe("Pages 1 to 3 and 6 to 8 parsed cleanly.");
  });

  it("says one page in the singular", () => {
    expect(cleanPagesLine(2, [2])).toBe("Page 1 parsed cleanly.");
  });

  it("says nothing without a page total, as for pasted text", () => {
    expect(cleanPagesLine(null, [3])).toBeNull();
    expect(cleanPagesLine(undefined, [3])).toBeNull();
  });

  it("says nothing when no page came through", () => {
    expect(cleanPagesLine(2, [1, 2])).toBeNull();
  });
});

/*
 * NEVER VOUCHING FOR A HELD PAGE (Hub ruling, 25 Nov, under Lydia's 4 Nov
 * rule): a page of the teacher's own file held at the first check is not
 * "parsed cleanly", and a hold that names no page leaves no page to vouch for.
 */
describe("the clean pages, beside a safety hold on the teacher's file", () => {
  const hold = (over: Record<string, unknown>) => ({ code: "lesson_text_blocked_by_safety", ...over });

  it("leaves the held page out of the clean ones", () => {
    const held = sourceHeldPages([hold({ heldAtCheck: "lesson_source", pageNumbers: [5] })]);

    expect(cleanPagesLine(16, [15, 16], held)).toBe("Pages 1 to 4 and 6 to 14 parsed cleanly.");
  });

  it("draws no line where the hold names no page", () => {
    const held = sourceHeldPages([hold({ heldAtCheck: "lesson_source" })]);

    expect(held.unknown).toBe(true);
    expect(cleanPagesLine(16, [15, 16], held)).toBeNull();
  });

  it("reads an older server's source hold the same way", () => {
    const held = sourceHeldPages([hold({ textRetained: false, pageNumbers: [2, 3] })]);

    expect(held).toEqual({ pages: [2, 3], unknown: false });
    expect(cleanPagesLine(6, [6], held)).toBe("Pages 1, 4 and 5 parsed cleanly.");
  });

  it("still counts a page whose own text passed, where only Nevo's lesson was held", () => {
    // The file passed its own check: its pages did parse cleanly.
    const held = sourceHeldPages([hold({ heldAtCheck: "generated_content", pageNumbers: [5] })]);

    expect(held).toEqual({ pages: [], unknown: false });
    expect(cleanPagesLine(16, [15, 16], held)).toBe("Pages 1 to 14 parsed cleanly.");
  });

  it("reads no other note as a hold", () => {
    expect(sourceHeldPages([{ code: "source_read_by_backup_reader", pageNumbers: [5] }, null, "x"])).toEqual({
      pages: [],
      unknown: false,
    });
    expect(sourceHeldPages(undefined)).toEqual({ pages: [], unknown: false });
  });
});
