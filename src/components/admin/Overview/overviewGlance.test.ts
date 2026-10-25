import { describe, expect, it } from "vitest";
import type { AttentionFlag } from "@/lib/api/intelligence";
import type { AdminStudentRow } from "@/lib/api/students";
import type { ClassActivity } from "@/lib/api/school";
import {
  awaitingParentReply,
  classesWithoutALesson,
  glanceRows,
  learnersWithOpenFlags,
  nameClasses,
} from "./overviewGlance";

/**
 * This roll-up was three invented counts under a note admitting they were
 * invented — a school with nothing in it was told six students were waiting on
 * parent consent. Two are real now, so the rules that matter are the ones that
 * stop a real count being wrong in a subtler way than a fixture was.
 */

const student = (
  id: string,
  status: AdminStudentRow["consent"] extends infer _ ? string : never,
): AdminStudentRow => ({
  id,
  name: `Student ${id}`,
  loginIdentifier: id,
  status: "active",
  ageBand: "11-14",
  consent: {
    status: status as "pending",
    actorId: null,
    actorName: null,
    timestamp: null,
    channel: null,
  },
});

const flag = (id: string, studentId: string, acknowledged = false): AttentionFlag => ({
  id,
  studentId,
  flagType: "pace",
  description: "Paused repeatedly on the same step.",
  generatedAt: "2026-09-10T09:00:00Z",
  acknowledged,
});

describe("awaitingParentReply", () => {
  it("counts pending only", () => {
    // `not_sent` is a school that has not asked - nobody is being waited on.
    // `withdrawn` is a decision, not a wait.
    const rows = [
      student("a", "pending"),
      student("b", "pending"),
      student("c", "not_sent"),
      student("d", "withdrawn"),
      student("e", "confirmed"),
    ];
    expect(awaitingParentReply(rows)).toBe(2);
  });

});

describe("learnersWithOpenFlags", () => {
  it("counts CHILDREN, not flags", () => {
    // Three flags, two children. The row says "students".
    const flags = [flag("1", "s1"), flag("2", "s1"), flag("3", "s2")];
    expect(learnersWithOpenFlags(flags)).toBe(2);
  });

  it("ignores flags already marked as seen", () => {
    const flags = [flag("1", "s1", true), flag("2", "s2")];
    expect(learnersWithOpenFlags(flags)).toBe(1);
  });
});

describe("glanceRows", () => {
  it("omits a row whose read did not answer, rather than reporting zero", () => {
    // THE LOAD-BEARING TEST. null is "we did not find out", and a school must
    // never be told nobody is waiting on consent because a fetch failed.
    expect(glanceRows(null, null)).toEqual([]);
    expect(glanceRows(null, [flag("1", "s1")]).map((r) => r.key)).toEqual([
      "flags",
    ]);
    expect(
      glanceRows([student("a", "pending")], null).map((r) => r.key),
    ).toEqual(["consent"]);
  });

  it("omits a row whose real count is zero", () => {
    // "0 students are waiting" is not worth a glance.
    expect(glanceRows([student("a", "confirmed")], [])).toEqual([]);
  });

  it("keeps D04's order when both are present", () => {
    const rows = glanceRows([student("a", "pending")], [flag("1", "s1")]);
    expect(rows.map((r) => r.key)).toEqual(["consent", "flags"]);
  });

  it("reads naturally at one", () => {
    const rows = glanceRows([student("a", "pending")], [flag("1", "s1")]);
    expect(rows[0].title).toBe("1 student is waiting on parent consent");
    expect(rows[1].title).toBe(
      "1 student has a flag nobody has marked as seen",
    );
  });

  it("never says a waiting child is blocked from lessons", () => {
    // SCRUM-80: the school warrants consent; the learner proceeds.
    const rows = glanceRows([student("a", "pending")], null);
    expect(rows[0].sub).not.toMatch(/can't begin|cannot begin|blocked/i);
    expect(rows[0].sub).toMatch(/learning as normal/i);
  });

  it("names no child and characterises none", () => {
    const rows = glanceRows([student("a", "pending")], [flag("1", "s1")]);
    for (const r of rows) {
      expect(`${r.title} ${r.sub}`).not.toMatch(/Student a|s1/);
      expect(`${r.title} ${r.sub}`).not.toMatch(
        /\b(struggl\w*|at risk|concern\w*|behind|weak)\b/i,
      );
    }
  });
});

/**
 * D04's third row, ruled v1.5 while nothing carried it; `classActivity`
 * (9 Oct) does, and it was taken up on 13 Oct.
 */
const cls = (name: string, lastActivityAt: string | null): ClassActivity => ({
  classId: `c-${name}`,
  className: name,
  lastActivityAt,
});

describe("classes that haven't run a lesson", () => {
  it("are the ones nobody has started a lesson in", () => {
    expect(
      classesWithoutALesson([cls("JSS 1A", "2026-10-01T09:00:00Z"), cls("JSS 1B", null), cls("SS 2 Arts", null)]),
    ).toEqual(["JSS 1B", "SS 2 Arts"]);
  });

  it("are named as D04 names them, and summed past three", () => {
    expect(nameClasses(["JSS 1B"])).toBe("JSS 1B");
    expect(nameClasses(["JSS 1B", "SS 2 Arts"])).toBe("JSS 1B and SS 2 Arts");
    expect(nameClasses(["A", "B", "C"])).toBe("A, B and C");
    expect(nameClasses(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });

  it("come third, in D04's words", () => {
    const rows = glanceRows([student("a", "pending")], [flag("1", "s1")], [cls("JSS 1B", null), cls("SS 2 Arts", null)]);
    expect(rows.map((r) => r.key)).toEqual(["consent", "flags", "classes"]);
    expect(rows[2].title).toBe("2 classes haven't run a lesson yet");
    expect(rows[2].sub).toBe("JSS 1B and SS 2 Arts - might be worth a nudge to their teachers.");
    expect(rows[2].href).toBe("/admin/classes");
  });

  it("read naturally at one", () => {
    expect(glanceRows(null, null, [cls("JSS 1B", null)])[0].title).toBe("1 class hasn't run a lesson yet");
  });

  it("are not drawn when every class has had one, or the read had none to give", () => {
    expect(glanceRows(null, null, [cls("JSS 1A", "2026-10-01T09:00:00Z")])).toEqual([]);
    expect(glanceRows(null, null, null)).toEqual([]);
    expect(glanceRows(null, null, [])).toEqual([]);
  });
});

/**
 * SCRUM-243 (D04, 96cd4b4): children held for a date of birth check get the
 * second row, routed to the checks. Unread holds draw no row - absent is not
 * zero - and none held draws none.
 */
describe("the date of birth hold row", () => {
  const hold = { id: "ac", studentId: "s1", blocksAccess: true } as unknown as import("@/lib/api/ageChecks").AgeCheck;

  it("comes second, after consent, and routes to the checks", () => {
    const rows = glanceRows([student("a", "pending")], [flag("1", "s1")], null, [hold, { ...hold, id: "ac2" }]);
    expect(rows.map((r) => r.key)).toEqual(["consent", "dob", "flags"]);
    const dob = rows[1];
    expect(dob.title).toBe("2 students are on hold for a date of birth check");
    expect(dob.href).toBe("/admin/students/date-of-birth");
    expect(dob.action).toBe("Open date of birth checks");
  });

  it("says 'student is' for one", () => {
    expect(glanceRows(null, null, null, [hold])[0].title).toBe("1 student is on hold for a date of birth check");
  });

  it("draws nothing when none are held or the read failed", () => {
    expect(glanceRows(null, null, null, [])).toEqual([]);
    expect(glanceRows(null, null, null, null)).toEqual([]);
  });
});
