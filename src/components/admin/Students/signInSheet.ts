import type { StudentSignInDetail } from "@/lib/api/students";

/**
 * The sign-in details as a file a school can print or mail-merge: one row per
 * active child, with the two things a child types at sign-in besides their
 * own PIN - the school code and their Student ID.
 *
 * A FILE, NOT A PRINTED SHEET. D24's OB-05 names the thing - "Student sign-in
 * details ready · Download or print them to hand out" - and no frame draws the
 * sheet itself: no layout, no per-class slip. A spreadsheet needs no layout
 * to be right, so it ships now and the slips wait on a frame. Raised with
 * design.
 *
 * Nothing in it signs anyone in. The PIN is the child's own and is not on any
 * read, so the code and the ID alone open nothing.
 */

// "Student ID / Admission Number": SCRUM-208's one label, used identically
// everywhere - a school may know the number by either name.
const HEADER = ["First name", "Last name", "Class", "Student ID / Admission Number", "School code"];

/**
 * One cell, quoted when it must be. A cell that opens with = + - @ is
 * prefixed with an apostrophe, so a spreadsheet shows a name rather than
 * running it as a formula.
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const byClassThenName = (a: StudentSignInDetail, b: StudentSignInDetail) =>
  (a.className ?? "").localeCompare(b.className ?? "") ||
  (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
  (a.firstName ?? "").localeCompare(b.firstName ?? "");

/** Sorted by class, then surname, so a class's rows print together. */
export function signInCsv(rows: StudentSignInDetail[]): string {
  const lines = [HEADER, ...[...rows].sort(byClassThenName).map((r) => [
    r.firstName,
    r.lastName,
    r.className,
    r.admissionNumber,
    r.schoolCode,
  ])];
  // CRLF, and a byte-order mark, so Excel opens it as UTF-8 and keeps names
  // like "Adébáyọ̀" intact.
  return `﻿${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
