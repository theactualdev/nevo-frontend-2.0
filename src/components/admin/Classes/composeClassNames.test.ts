import { describe, expect, it } from "vitest";
import type { AdminClass } from "@/lib/api/classes";
import {
  composeAcrossYears,
  composeClassNames,
  defaultDivision,
  sendable,
} from "./composeClassNames";
import { collisionNote, findCollision, normaliseClassName } from "./duplicateName";

/**
 * SCRUM-149 CL-03 and CL-04.
 *
 * The composer decides what up to a few dozen classes get called, and the
 * collision check decides which of them are never sent. Both are pure, both
 * are where this feature can be quietly wrong, and neither is visible in a
 * screenshot — so they are tested here rather than through the sheet.
 */

const cls = (over: Partial<AdminClass>): AdminClass =>
  ({
    id: "c1",
    name: "JSS 2A",
    code: null,
    yearGroup: "jss2",
    source: null,
    subjects: [],
    studentCount: 0,
    archivedAt: null,
    ...over,
  }) as AdminClass;

describe("matching, per CL-03", () => {
  it("ignores case", () => {
    expect(normaliseClassName("JSS 2A")).toBe(normaliseClassName("jss 2a"));
  });

  it("ignores surrounding whitespace", () => {
    expect(normaliseClassName("  JSS 2A  ")).toBe(normaliseClassName("JSS 2A"));
  });

  it("collapses interior whitespace, so a double space is not a new class", () => {
    expect(normaliseClassName("JSS  2A")).toBe(normaliseClassName("JSS 2A"));
  });

  it("does not match a genuinely different class", () => {
    expect(findCollision("JSS 2B", [cls({})])).toBeNull();
  });

  it("names the class AND the year it collided in, the way D05 does", () => {
    /*
     * Our first version said only "JSS 2A already exists." The frame names the
     * year group and offers a second action, and the year is the half that
     * makes it actionable: a school running JSS 2A in two years reads the bare
     * version as Nevo being wrong.
     */
    const hit = findCollision("  jss 2a ", [
      cls({ name: "JSS 2A", yearGroup: "jss2" }),
    ]);
    expect(hit).not.toBeNull();
    const note = collisionNote(hit!);
    expect(note).toMatch(/This matches JSS 2A/);
    expect(note).toMatch(/already exists in JSS 2/);
    expect(note).toMatch(/open the existing class/);
  });

  it("says where it exists, or says nothing about where", () => {
    // `yearGroup` is nullable and a roster import can produce one. "in null"
    // on the one sentence that is meant to make this actionable is worse than
    // no clause at all.
    const hit = findCollision("JSS 2A", [
      cls({ name: "JSS 2A", yearGroup: null }),
    ]);
    const note = collisionNote(hit!);
    expect(note).toContain("This matches JSS 2A, which already exists.");
    expect(note).not.toContain("null");
    expect(note).not.toContain("undefined");
    expect(note).not.toContain("exists in .");
  });

  it("treats an ARCHIVED class as taken, and says restore rather than rename", () => {
    // Archive is reversible and never deletes, so the name is still held. Two
    // classes differing only by a state the list hides by default is the
    // outcome this prevents.
    const hit = findCollision("JSS 2A", [
      cls({ archivedAt: "2026-07-01T00:00:00Z" }),
    ]);
    expect(hit).not.toBeNull();
    expect(collisionNote(hit!)).toMatch(/archived/i);
    expect(collisionNote(hit!)).toMatch(/Restore it/i);
  });

  it("an empty name collides with nothing", () => {
    expect(findCollision("   ", [cls({})])).toBeNull();
  });
});

describe("composing, per CL-04", () => {
  const compose = (sections: string[], existing: AdminClass[] = []) =>
    composeClassNames({ yearGroup: "jss2", sections, existing });

  it("joins the school's own year-group label to the section, with no separator", () => {
    const out = compose(["A", "B"]);
    expect(out.map((c) => c.name)).toEqual(["JSS 2A", "JSS 2B"]);
  });

  it("marks a name that already exists and keeps it out of the send", () => {
    const out = compose(["A", "B"], [cls({ name: "JSS 2A" })]);
    expect(out.find((c) => c.name === "JSS 2A")?.collision).toMatch(/already exists/);
    expect(sendable(out).map((c) => c.name)).toEqual(["JSS 2B"]);
  });

  it("still SHOWS the colliding row, so the count is explicable", () => {
    // Silently dropping it would make "tick three, create two" look like a bug.
    const out = compose(["A", "B", "C"], [cls({ name: "JSS 2A" })]);
    expect(out).toHaveLength(3);
    expect(sendable(out)).toHaveLength(2);
  });

  it("composes nothing when the school has not named the year group", () => {
    // Inventing a label would put a class in the building called something
    // nobody there says.
    expect(
      composeClassNames({ yearGroup: "not-a-year", sections: ["A"], existing: [] }),
    ).toEqual([]);
  });

  it("composes nothing when no section is ticked", () => {
    expect(compose([])).toEqual([]);
  });
});

describe("composing across year groups, per D05's grid", () => {
  it("names a stream after the year with a space, as the frame does", () => {
    const out = composeClassNames({
      yearGroup: "ss1",
      sections: ["Sciences", "Arts"],
      existing: [],
      division: "streams",
    });
    expect(out.map((c) => c.name)).toEqual(["SS 1 Sciences", "SS 1 Arts"]);
  });

  it("streams senior secondary by default and letters everything else", () => {
    expect(defaultDivision("ss2")).toBe("streams");
    expect(defaultDivision("jss1")).toBe("sections");
    expect(defaultDivision("p4")).toBe("sections");
  });

  it("composes every year group into one batch, each class carrying its own year", () => {
    const out = composeAcrossYears(
      [
        { yearGroup: "jss1", division: "sections", picked: ["A", "B"] },
        { yearGroup: "ss1", division: "streams", picked: ["Commercial"] },
      ],
      [cls({ name: "JSS 1B", yearGroup: "jss1" })],
    );
    expect(out.map((c) => [c.name, c.yearGroup])).toEqual([
      ["JSS 1A", "jss1"],
      ["JSS 1B", "jss1"],
      ["SS 1 Commercial", "ss1"],
    ]);
    expect(sendable(out).map((c) => c.name)).toEqual(["JSS 1A", "SS 1 Commercial"]);
  });

  it("never sends one name twice in the same batch", () => {
    // Two year groups a school has labelled alike compose the same name.
    const out = composeAcrossYears(
      [
        { yearGroup: "jss1", division: "sections", picked: ["A"] },
        { yearGroup: "jss1", division: "sections", picked: ["A"] },
      ],
      [],
    );
    expect(out[1].collision).toMatch(/Listed twice/);
    expect(sendable(out)).toHaveLength(1);
  });
});
