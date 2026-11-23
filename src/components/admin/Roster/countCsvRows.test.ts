import { describe, expect, it } from "vitest";
import { countCsvRows } from "./rosterImport";

/**
 * OB-01's file line counts the FILE's rows in the browser (Lydia 19 Nov, L23).
 * Records, not lines; no header, no blank rows.
 */
describe("countCsvRows", () => {
  it("counts the data rows under the header", () => {
    expect(countCsvRows("first_name,last_name\nAda,Obi\nTunde,Bello\n")).toBe(2);
  });

  it("is not fooled by a newline inside a quoted field", () => {
    expect(countCsvRows('name,note\n"Ada","line one\nline two"\nTunde,ok\n')).toBe(2);
  });

  it("skips blank lines, Excel's empty rows and a trailing newline", () => {
    expect(countCsvRows("name,class\r\nAda,JSS 1A\r\n\r\n,,\r\nTunde,JSS 1B\r\n\r\n")).toBe(2);
  });

  it("reads a last row with no newline after it", () => {
    expect(countCsvRows("name\nAda")).toBe(1);
  });

  it("is zero for a header alone, or nothing", () => {
    expect(countCsvRows("name,class\n")).toBe(0);
    expect(countCsvRows("")).toBe(0);
  });
});
