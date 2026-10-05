import { describe, expect, it } from "vitest";
import type { OnboardingState } from "@/lib/api/onboarding";
import {
  templateColumns,
  foundCounts,
  hasStaged,
  mayConfirm,
  rejectedCsv,
  toFixLabel,
} from "./rosterImport";

/**
 * D24 OB-02's claims about a school's own file.
 *
 * The frame's tone is a requirement, not a note: *"Nothing here is red or
 * urgent - the number states the position and leaves it."* And *"No error is
 * only a count."*
 */

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  stage: "uploading",
  classes: [],
  teacherCount: 0,
  studentCount: 0,
  rejected: [],
  invoiceId: null,
  amountDue: null,
  currency: null,
  periodLabel: null,
  canConfirm: false,
  canPay: false,
  canActivate: false,
  inOnboarding: false,
  ...over,
});

const cls = (name: string, studentCount: number) => ({
  name,
  normalisedName: name.toLowerCase(),
  yearGroup: null,
  section: null,
  studentCount,
  teacherCount: 1,
});

describe("foundCounts", () => {
  it("reads the students count rather than subtracting rejections", () => {
    /*
     * `total - rejected.length` would invent a number nobody sent: a rejected
     * row is not necessarily a student. 336 read cleanly and 4 to fix is what
     * the server said, and it does not have to add to anything.
     */
    const c = foundCounts(
      state({
        studentCount: 336,
        teacherCount: 18,
        classes: [cls("JSS 1A", 30), cls("JSS 1B", 28)],
        rejected: [
          { rowNumber: 12, field: "class", value: "JS1", reason: "No class called JS1." },
          { rowNumber: 40, field: "dob", value: "31/02/2013", reason: "Not a real date." },
        ],
      }),
    );
    expect(c).toEqual({ classes: 2, teachers: 18, students: 336, toFix: 2 });
  });
});

describe("toFixLabel", () => {
  it("says nothing at all when the file is clean", () => {
    // A clean file has no position to state; the tile is absent, not zero.
    expect(toFixLabel(0)).toBeNull();
  });

  it("counts one row without pluralising it", () => {
    expect(toFixLabel(1)).toBe("1 row to fix");
    expect(toFixLabel(4)).toBe("4 rows to fix");
  });
});

describe("mayConfirm", () => {
  it("does not let rejected rows block a confirm", () => {
    /*
     * THE ONE A DERIVED VERSION WOULD GET BACKWARDS. The frame: "The 4 rows
     * can be fixed now or left for later - they simply won't join until
     * they're sorted." So `canConfirm` is the server's answer, never
     * `students > 0 && rejected.length === 0`.
     */
    expect(
      mayConfirm(
        state({
          studentCount: 336,
          canConfirm: true,
          rejected: [
            { rowNumber: 12, field: "class", value: "JS1", reason: "No class called JS1." },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("refuses when the server has not said yes, and when we have not asked", () => {
    expect(mayConfirm(state({ studentCount: 336, canConfirm: false }))).toBe(false);
    expect(mayConfirm(null)).toBe(false);
  });
});

describe("hasStaged", () => {
  it("counts a file that produced only rejections as staged", () => {
    // Every row wrong is still a file that was read, and the school needs to
    // see why rather than a screen that looks like nothing happened.
    expect(
      hasStaged(
        state({
          rejected: [
            { rowNumber: 2, field: "email", value: "x", reason: "Not an email." },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is false before anything is uploaded", () => {
    expect(hasStaged(state())).toBe(false);
    expect(hasStaged(null)).toBe(false);
  });
});

describe("rejectedCsv", () => {
  it("escapes a comma in the reason instead of shifting every later column", () => {
    /*
     * `reason` and `value` are free text from the server. An unescaped comma
     * would corrupt the correction file a school opens to fix its rows - they
     * would fix the wrong cells.
     */
    const csv = rejectedCsv([
      {
        rowNumber: 12,
        field: "class",
        value: "JS1, JS2",
        reason: 'No class called "JS1, JS2", check the spelling.',
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '"12","class","JS1, JS2","No class called ""JS1, JS2"", check the spelling."',
    );
  });

  it("names the row number, because that is the whole point of the file", () => {
    const csv = rejectedCsv([
      { rowNumber: 40, field: "dob", value: "31/02/2013", reason: "Not a real date." },
    ]);
    expect(csv).toMatch(/"40"/);
    expect(csv).not.toMatch(/undefined/);
  });
});

describe("templateColumns", () => {
  it("reads the first row, without the BOM the server adds for Excel", () => {
    expect(templateColumns("\uFEFFFirst name,Surname,Class\r\nAmara,Okafor,JSS 1A\r\n")).toEqual([
      "First name",
      "Surname",
      "Class",
    ]);
  });

  it("keeps a quoted heading whole, comma and all", () => {
    expect(templateColumns('Name,"Class, or classes",Email\nx,y,z')).toEqual([
      "Name",
      "Class, or classes",
      "Email",
    ]);
    expect(templateColumns('"Say ""hi""",B')).toEqual(['Say "hi"', "B"]);
  });

  it("is null when there is no header to show", () => {
    expect(templateColumns("")).toBeNull();
    expect(templateColumns("\uFEFF\r\nAmara")).toBeNull();
    expect(templateColumns(" , ,")).toBeNull();
  });
});
