import { describe, expect, it } from "vitest";
import type { AdminClass } from "@/lib/api/classes";
import type { SchoolSubject } from "@/lib/api/subjects";
import { NO_EMAIL, groupTeachers, parseInviteCsv, type Teaching } from "./csv";
import {
  alsoLine,
  andList,
  answersFrom,
  classesFor,
  namesToAdd,
  sameWords,
  subjectFor,
  toSettle,
} from "./staffImport";

/**
 * Backlog 19, D19's staff import (T15): rows join by email, a subject Nevo
 * doesn't recognise is settled in its row, and each teacher's invitation
 * carries every class with its subject.
 */

const classes = [
  { id: "c1", name: "JSS 2A", archivedAt: null },
  { id: "c2", name: "SSS 1 Sciences", archivedAt: null },
  { id: "c9", name: "Old 1A", archivedAt: "2026-07-01T00:00:00Z" },
] as AdminClass[];

const school = [
  { id: "s-maths", name: "Mathematics", displayName: "Mathematics", origin: "canonical", reviewState: "approved" },
] as SchoolSubject[];

const file = (...lines: string[]) =>
  parseInviteCsv(["first_name,last_name,email,subject,class", ...lines].join("\n"), classes);

describe("reading the staff file", () => {
  it("joins rows by email, never by name, and a repeated email is no longer an error", () => {
    const { rows } = file(
      "Kunle,Bello,k.bello@school.edu.ng,Mathematics,JSS 2A",
      "Kunle,Bello,K.BELLO@school.edu.ng,Further Mathematics,SSS 1 Sciences",
      "Folake,Bello,f.bello@school.edu.ng,Social Studies,JSS 2A",
      "Grace,Bello,g.bello@school.edu.ng,Home Economics,JSS 2A",
    );
    expect(rows.every((r) => r.error === null)).toBe(true);
    const teachers = groupTeachers(rows);
    // Two Mrs Bellos with two addresses stay two (D19 draws exactly that).
    expect(teachers.map((t) => t.lines)).toEqual([[2, 3], [4], [5]]);
    expect(teachers[0].teaches.map((t) => [t.classId, t.subject])).toEqual([
      ["c1", "Mathematics"],
      ["c2", "Further Mathematics"],
    ]);
  });

  it("leaves out a row with no email, in D19's words, and joins nothing from it", () => {
    const { rows } = file("Emeka,Obi,,Computer Studies,JSS 2A");
    expect(rows[0]).toMatchObject({ error: NO_EMAIL, noEmail: true, subject: "Computer Studies" });
    expect(groupTeachers(rows)).toEqual([]);
  });

  it("leaves out a subject with no class, and never matches an archived class", () => {
    const { rows } = file(
      "Ada,Eze,a.eze@school.edu.ng,Biology,",
      "Ada,Eze,a.eze@school.edu.ng,Biology,Old 1A",
    );
    expect(rows[0].error).toBe("This row names a subject but no class.");
    expect(rows[1]).toMatchObject({ unknownClass: true, classId: null });
  });
});

const teaching = (line: number, subject: string, classId = "c1"): Teaching => ({
  line,
  classId,
  className: classId === "c1" ? "JSS 2A" : "SSS 1 Sciences",
  subject,
});

const answers = answersFrom([
  { typed: "Maths", resolved: true, schoolSubjectId: "s-maths", displayName: "Mathematics", origin: "canonical" },
  { typed: "Biology", resolved: false, schoolSubjectId: null, displayName: "Biology", origin: "canonical" },
  { typed: "Maths Dept", resolved: false },
]);

describe("what each row's subject became", () => {
  it("takes the server's answer, holds Nevo's-not-yet-the-school's by name, and leaves the unknown to settle", () => {
    expect(subjectFor(teaching(2, "maths"), answers, {})).toBe("Mathematics");
    expect(subjectFor(teaching(3, "Biology"), answers, {})).toBe("Biology");
    expect(subjectFor(teaching(4, "Maths Dept"), answers, {})).toBeNull();
    // A class with no subject is still to settle: T15 needs one per class.
    expect(subjectFor(teaching(5, ""), answers, {})).toBeNull();
    // The admin's pick wins.
    expect(subjectFor(teaching(4, "Maths Dept"), answers, { 4: "Further Mathematics" })).toBe("Further Mathematics");
  });

  it("finds the other rows that typed the same words, for D19's 'Also use it for row'", () => {
    const open = [teaching(7, "Maths Dept"), teaching(15, " maths  dept"), teaching(23, "Agric")];
    expect(sameWords(open[0], open).map((t) => t.line)).toEqual([15]);
    expect(sameWords(teaching(9, ""), open)).toEqual([]);
    expect(alsoLine([teaching(15, "Maths Dept")], "Maths Dept")).toBe(
      "Also use it for row 15, which says “Maths Dept” too",
    );
    expect(alsoLine([teaching(15, "x"), teaching(23, "x"), teaching(31, "x")], "x")).toBe(
      "Also use it for rows 15, 23 and 31, which say “x” too",
    );
    expect(andList([3, 18])).toBe("3 and 18");
  });
});

describe("what Save sends", () => {
  // The server is asked about every subject a class row typed.
  const answers = answersFrom([
    { typed: "Maths", resolved: true, schoolSubjectId: "s-maths", displayName: "Mathematics", origin: "canonical" },
    { typed: "Mathematics", resolved: true, schoolSubjectId: "s-maths", displayName: "Mathematics", origin: "canonical" },
    { typed: "Biology", resolved: false, schoolSubjectId: null, displayName: "Biology", origin: "canonical" },
    { typed: "Maths Dept", resolved: false },
  ]);
  const { rows } = file(
    "Kunle,Bello,k.bello@school.edu.ng,Maths,JSS 2A",
    "Kunle,Bello,k.bello@school.edu.ng,Mathematics,JSS 2A",
    "Kunle,Bello,k.bello@school.edu.ng,Biology,SSS 1 Sciences",
    "Ada,Eze,a.eze@school.edu.ng,Maths Dept,JSS 2A",
  );
  const teachers = groupTeachers(rows);

  it("holds Save while a row is still to settle", () => {
    expect(toSettle(teachers, answers, {}).map((t) => t.line)).toEqual([5]);
    expect(toSettle(teachers, answers, { 5: "Mathematics" })).toEqual([]);
  });

  it("adds to the school's list only what it doesn't hold, then sends each class with each subject once", () => {
    const settled = { 5: "Mathematics" };
    expect(namesToAdd(teachers, answers, settled, school)).toEqual(["Biology"]);
    const added = new Map([["biology", "s-bio"]]);
    // "Maths" and "Mathematics" in JSS 2A are one pair, sent once.
    expect(classesFor(teachers[0], answers, settled, school, added)).toEqual([
      { classId: "c1", subjectId: "s-maths" },
      { classId: "c2", subjectId: "s-bio" },
    ]);
    expect(classesFor(teachers[1], answers, settled, school, added)).toEqual([
      { classId: "c1", subjectId: "s-maths" },
    ]);
  });
});
