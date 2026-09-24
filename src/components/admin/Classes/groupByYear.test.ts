import { describe, expect, it } from "vitest";
import type { AdminClass } from "@/lib/api/classes";
import { groupByYear, sessionLabel } from "./groupByYear";

/**
 * D05's grouped list, after the 20 September restructure.
 *
 * A Nigerian secondary school runs twelve to thirty classes across six years,
 * so the grouping is what makes "which JSS 2 classes do we have?" answerable
 * at a glance rather than by scanning.
 */

const cls = (over: Partial<AdminClass> & { name: string }): AdminClass => ({
  id: over.name,
  code: null,
  yearGroup: null,
  source: null,
  subjects: [],
  studentCount: 0,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
  ...over,
});

describe("groupByYear", () => {
  it("orders by the curriculum, not the alphabet", () => {
    /*
     * THE ONE THAT READS AS A BUG TO EVERY NIGERIAN SCHOOL. Sorting the labels
     * alphabetically puts "SS 1" before "JSS 1". `yearGroupOrder` is the
     * enum's own order.
     */
    const out = groupByYear([
      cls({ name: "SS 1A", yearGroup: "ss1" }),
      cls({ name: "JSS 2A", yearGroup: "jss2" }),
      cls({ name: "JSS 1A", yearGroup: "jss1" }),
    ]);
    expect(out.map((s) => s.label)).toEqual(["JSS 1", "JSS 2", "SS 1"]);
  });

  it("sorts classes inside a year by name", () => {
    const out = groupByYear([
      cls({ name: "JSS 2C", yearGroup: "jss2" }),
      cls({ name: "JSS 2A", yearGroup: "jss2" }),
      cls({ name: "JSS 2B", yearGroup: "jss2" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].classes.map((c) => c.name)).toEqual([
      "JSS 2A",
      "JSS 2B",
      "JSS 2C",
    ]);
  });

  it("keeps a class with no year group, and puts it last", () => {
    /*
     * A roster import can produce one. Dropping it would hide a class from a
     * school checking this list against its own records - the worst outcome
     * available on this screen.
     */
    const out = groupByYear([
      cls({ name: "Mystery" }),
      cls({ name: "JSS 1A", yearGroup: "jss1" }),
    ]);
    expect(out.map((s) => s.label)).toEqual(["JSS 1", "No year group"]);
    expect(out[1].classes.map((c) => c.name)).toEqual(["Mystery"]);
  });

  it("shows an unrecognised year group under its own name", () => {
    // `yearGroupLabel` returns the raw value for a year it does not know, and
    // here that is right: "Grade 7" is better than sweeping it into "No year
    // group", which would tell a school its import lost the year.
    const out = groupByYear([cls({ name: "7A", yearGroup: "Grade 7" })]);
    expect(out[0].label).toBe("Grade 7");
    expect(out[0].classes).toHaveLength(1);
  });

  it("loses nothing, whatever the mix", () => {
    const input = [
      cls({ name: "SS 1A", yearGroup: "ss1" }),
      cls({ name: "Mystery" }),
      cls({ name: "JSS 1A", yearGroup: "jss1" }),
      cls({ name: "JSS 1B", yearGroup: "jss1" }),
    ];
    const out = groupByYear(input);
    expect(out.flatMap((s) => s.classes)).toHaveLength(input.length);
  });

  it("returns nothing for nothing", () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe("sessionLabel", () => {
  it("states the session when every class agrees", () => {
    expect(
      sessionLabel([
        cls({ name: "A", academicSession: "2026/27" }),
        cls({ name: "B", academicSession: "2026/27" }),
      ]),
    ).toBe("2026/27");
  });

  it("says nothing when they disagree", () => {
    // A single session over a list containing two is a caption that is wrong
    // about half the rows.
    expect(
      sessionLabel([
        cls({ name: "A", academicSession: "2026/27" }),
        cls({ name: "B", academicSession: "2025/26" }),
      ]),
    ).toBeNull();
  });

  it("says nothing rather than guessing from the clock", () => {
    expect(sessionLabel([cls({ name: "A" })])).toBeNull();
    expect(sessionLabel([])).toBeNull();
  });
});
