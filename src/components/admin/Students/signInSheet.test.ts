import { describe, expect, it } from "vitest";
import type { StudentSignInDetail } from "@/lib/api/students";
import { csvCell, signInCsv } from "./signInSheet";

/**
 * The sign-in details file. What would hurt: a name a spreadsheet runs as a
 * formula, a comma that splits a name across columns, and rows scattered so a
 * class cannot be printed together.
 */

const row = (over: Partial<StudentSignInDetail>): StudentSignInDetail => ({
  studentId: "s",
  firstName: "Amara",
  lastName: "Okafor",
  admissionNumber: "BGA/2026/014",
  schoolCode: "K7DQ",
  classId: "c",
  className: "JSS 2A",
  ...over,
});

describe("signInCsv", () => {
  it("lists each child's class, Student ID and the school code, class by class", () => {
    const csv = signInCsv([
      row({ firstName: "Tunde", lastName: "Bello", className: "JSS 2B", admissionNumber: "BGA/2026/031" }),
      row({}),
      row({ firstName: "Chidi", lastName: "Adeyemi", admissionNumber: "BGA/2026/002" }),
    ]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("First name,Last name,Class,Student ID / Admission Number,School code");
    expect(lines.slice(1)).toEqual([
      "Chidi,Adeyemi,JSS 2A,BGA/2026/002,K7DQ",
      "Amara,Okafor,JSS 2A,BGA/2026/014,K7DQ",
      "Tunde,Bello,JSS 2B,BGA/2026/031,K7DQ",
    ]);
  });

  it("leaves a missing name or class empty rather than writing null", () => {
    const csv = signInCsv([row({ firstName: null, className: null })]);
    expect(csv).toContain("\r\n,Okafor,,BGA/2026/014,K7DQ\r\n");
    expect(csv).not.toMatch(/null|undefined/);
  });

  it("opens as UTF-8 in a spreadsheet, so names keep their accents", () => {
    expect(signInCsv([row({ firstName: "Adébáyọ̀" })]).startsWith("﻿")).toBe(true);
  });
});

describe("csvCell", () => {
  it("quotes a comma or a quote so a name stays in one column", () => {
    expect(csvCell("Okafor, Jr")).toBe('"Okafor, Jr"');
    expect(csvCell('Ngozi "Ada"')).toBe('"Ngozi ""Ada"""');
  });

  it("never lets a cell run as a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+234")).toBe("'+234");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell("-1")).toBe("'-1");
  });
});
