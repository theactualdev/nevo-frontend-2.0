import { describe, expect, it } from "vitest";
import type { SchoolTerm } from "@/lib/api/school";
import {
  termIssues,
  TERM_STARTS_STORED,
  termStartDatesFrom,
  unresolvedLine,
} from "./academicCalendar";

/**
 * Every "this half-term" figure in the product resolves through this record,
 * so both halves matter: what a school is stopped from saving, and what Nevo
 * is actually told when they do save.
 */

const term = (over: Partial<SchoolTerm> = {}): SchoolTerm => ({
  id: "t1",
  name: "First term",
  start: "2026-09-07",
  end: "2026-12-11",
  ...over,
});

const NIGERIAN_YEAR: SchoolTerm[] = [
  term({ id: "t1", name: "First term", start: "2026-09-07", end: "2026-12-11" }),
  term({ id: "t2", name: "Second term", start: "2027-01-11", end: "2027-03-26" }),
  term({ id: "t3", name: "Third term", start: "2027-04-19", end: "2027-07-24" }),
];

describe("termIssues", () => {
  it("passes a correctly configured year", () => {
    expect(termIssues(NIGERIAN_YEAR)).toEqual([]);
  });

  it("does NOT flag the holidays between terms", () => {
    // The frame's own fixture runs First term to 11 December and Second from
    // 11 January. Treating that month as a gap to resolve would disable Save
    // on every real Nigerian calendar.
    const gaps = termIssues(NIGERIAN_YEAR).filter((i) => i.message.includes("gap"));
    expect(gaps).toEqual([]);
  });

  it("catches a term that starts before the last one ends", () => {
    const issues = termIssues([
      NIGERIAN_YEAR[0],
      term({ id: "t2", name: "Second term", start: "2026-12-01", end: "2027-03-26" }),
    ]);
    expect(issues).toHaveLength(1);
    // SCRUM-99's copy line, in shape: "Second term starts before First term ends."
    expect(issues[0].message).toBe(
      "Second term starts before First term ends.",
    );
    expect(issues[0].index).toBe(1);
  });

  it("catches a term that ends before it starts", () => {
    const issues = termIssues([
      term({ start: "2026-12-11", end: "2026-09-07" }),
    ]);
    expect(issues[0].message).toBe("First term ends before it starts.");
  });

  it("catches a half-term break outside its own term", () => {
    const issues = termIssues([
      term({ halfTermStart: "2027-02-15", halfTermEnd: "2027-02-19" }),
    ]);
    expect(issues.map((i) => i.problem.kind)).toContain("half-outside");
  });

  it("catches a half-term break that runs backwards", () => {
    const issues = termIssues([
      term({ halfTermStart: "2026-10-30", halfTermEnd: "2026-10-26" }),
    ]);
    expect(issues.map((i) => i.problem.kind)).toContain("half-reversed");
  });

  it("accepts a half-term break inside its term", () => {
    expect(
      termIssues([
        term({ halfTermStart: "2026-10-26", halfTermEnd: "2026-10-30" }),
      ]),
    ).toEqual([]);
  });

  it("claims nothing about a date it cannot read", () => {
    // An unparseable date is not evidence that anything is wrong, and must not
    // hold Save hostage to a row we do not understand.
    expect(termIssues([term({ start: "", end: "" })])).toEqual([]);
    expect(termIssues([term({ start: "soon", end: "later" })])).toEqual([]);
  });
});

describe("unresolvedLine", () => {
  it("counts rows, not issues", () => {
    // One row can carry two problems; a school should read "1 term needs".
    const issues = termIssues([
      term({ start: "2026-12-11", end: "2026-09-07", halfTermStart: "2020-01-01", halfTermEnd: "2020-01-05" }),
    ]);
    expect(issues.length).toBeGreaterThan(1);
    expect(unresolvedLine(issues)).toBe("1 term needs a date sorted out.");
  });

  it("says nothing when there is nothing to say", () => {
    expect(unresolvedLine([])).toBeNull();
  });
});

describe("termStartDatesFrom", () => {
  it("sends Nevo the field it actually reads", () => {
    // The save wrote `terms`, which is ours and which nothing reads, and never
    // `termStartDates`, which is the only typed field on AcademicConfig - so a
    // school that set three term dates had told Nevo nothing and its year went
    // on being split into equal thirds.
    expect(termStartDatesFrom(NIGERIAN_YEAR)).toEqual([
      "2026-09-07",
      "2027-01-11",
      "2027-04-19",
    ]);
  });

  it("is earliest first whatever order the rows are in", () => {
    expect(
      termStartDatesFrom([NIGERIAN_YEAR[2], NIGERIAN_YEAR[0], NIGERIAN_YEAR[1]]),
    ).toEqual(["2026-09-07", "2027-01-11", "2027-04-19"]);
  });

  it("emits ISO dates, not date-times", () => {
    expect(
      termStartDatesFrom([term({ start: "2026-09-07T00:00:00.000Z" })]),
    ).toEqual(["2026-09-07"]);
  });

  it("sends the fourth date rather than quietly dropping it", () => {
    /*
     * THE INVERSE OF WHAT THIS TEST USED TO ASSERT, and its old name is the
     * reason it survived: "respects the contract's cap of three" made a
     * client-side `.slice(0, 3)` sound like compliance. It was data loss.
     *
     * The cap is real and backend enforces it with a 422. That refusal is a
     * school being TOLD. Cutting the date off here meant the request was
     * never made, the save reported success, and the school believed a fourth
     * term start had been stored - on the record every period figure in the
     * product resolves through.
     *
     * The form caps the inputs at three so this normally cannot arise; a
     * calendar stored before that cap existed still can, and must fail loudly.
     */
    const four = [
      ...NIGERIAN_YEAR,
      term({ id: "t4", name: "Fourth term", start: "2027-08-01" }),
    ];
    expect(termStartDatesFrom(four)).toEqual([
      "2026-09-07",
      "2027-01-11",
      "2027-04-19",
      "2027-08-01",
    ]);
  });

  it("keeps the cap available to the form as a number, not a magic 3", () => {
    // The form stops at this rather than repeating the literal, so the two
    // cannot disagree if backend ever moves it.
    expect(TERM_STARTS_STORED).toBe(3);
  });

  it("drops a row it cannot read rather than sending a bad date", () => {
    expect(
      termStartDatesFrom([term({ start: "" }), NIGERIAN_YEAR[1]]),
    ).toEqual(["2027-01-11"]);
    expect(termStartDatesFrom([term({ start: "sometime" })])).toEqual([]);
  });
});
