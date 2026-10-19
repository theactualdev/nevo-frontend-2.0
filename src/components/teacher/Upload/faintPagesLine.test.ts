import { describe, expect, it } from "vitest";
import { faintPagesLine } from "./UploadWizard";

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
