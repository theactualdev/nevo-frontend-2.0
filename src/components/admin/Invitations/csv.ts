import type { AdminClass } from "@/lib/api/classes";
import type { InviteDraft } from "@/lib/api/invites";

/**
 * CSV parsing and validation for D19's bulk import - of teachers, the only
 * people a school invites (L2, 14 Oct; SCRUM-215).
 *
 * Validation happens HERE, before anything is sent, because D19's step 2 is a
 * preview: "Checking each row against your classes." An admin sees every
 * parsed row with its problem named before a single invite goes out. The
 * backend also rejects rows (and returns `{row, reason}` for each), but a
 * server rejection arrives after the commit - too late to be a preview.
 *
 * The two validators disagree on purpose about STRICTNESS: ours is the looser
 * of the two, checking only what a school can fix from the file itself. Any
 * row the backend still refuses shows up in the confirmation count, which is
 * why that count reads from the response rather than from our own tally.
 */

export const MAX_ROWS = 500;

export interface ParsedRow {
  /** 1-based, matching what a spreadsheet shows the person fixing the file. */
  line: number;
  /** What the preview shows: the two name columns joined, or the one. */
  name: string;
  /**
   * The file's own first and last name, when it has those columns (D19, and
   * the server's teacher template). Sent as they are - never re-split.
   */
  firstName?: string;
  lastName?: string;
  email: string;
  className: string;
  /**
   * The file's subject, as typed (D19: "One row for each subject a teacher
   * takes in each class"). Empty when the row has none.
   */
  subject: string;
  /** Null when the row is fine. */
  error: string | null;
  /** D19's drawn "Left out" row: no email, so no way to know the teacher. */
  noEmail?: boolean;
  /** Resolved from `className`; null when unmatched or absent. */
  classId: string | null;
  /**
   * The row names a class the school doesn't have. CL-07: the cure is to
   * create the classes first, so the rejected list offers the way there.
   */
  unknownClass?: boolean;
}

/**
 * The downloadable template: D19 step 1's own columns and example rows.
 *
 * There was a student template too, with a parent contact column (SCRUM-162).
 * It went with the student invite itself (L2, 14 Oct): a school adds its
 * children on Students, which has its own roster import.
 */
export const TEMPLATE_ROWS = [
  ["first_name", "last_name", "email", "subject", "class"],
  ["Kunle", "Bello", "k.bello@school.edu.ng", "Mathematics", "JSS 2A"],
  ["Kunle", "Bello", "k.bello@school.edu.ng", "Further Mathematics", "SSS 1 Sciences"],
  ["Nnamdi", "Obi", "n.obi@school.edu.ng", "Biology", "SSS 1 Sciences"],
] as const;

export const TEMPLATE = `${TEMPLATE_ROWS.map((r) => r.join(",")).join("\n")}\n`;

/** D19's sentence for a row with no email, which it draws as "Left out". */
export const NO_EMAIL =
  "This row has no email address, and email is how Nevo knows each teacher, so it can't be imported.";

/**
 * A small RFC-4180 reader: quoted fields, escaped quotes, and CRLF.
 *
 * Deliberately not a dependency. A roster CSV exported from Excel is the whole
 * input domain here, and the failure mode of a half-correct parser is a
 * mangled name on someone's record.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Swallow the LF of a CRLF pair.
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** Tolerant header matching - "Name", "Full Name" and "full_name" all land. */
function headerIndex(header: string[], ...names: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  for (const n of names) {
    const i = norm.indexOf(n.replace(/[\s_-]+/g, ""));
    if (i !== -1) return i;
  }
  return -1;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParseOutcome {
  rows: ParsedRow[];
  /** Set when the FILE is unusable, as opposed to some rows being wrong. */
  fatal: string | null;
}

export function parseInviteCsv(
  text: string,
  classes: AdminClass[],
): ParseOutcome {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], fatal: "That file is empty." };
  }

  const header = table[0];
  const body = table.slice(1);

  if (body.length === 0) {
    return { rows: [], fatal: "That file has a header row and nothing else." };
  }
  if (body.length > MAX_ROWS) {
    return {
      rows: [],
      fatal: `That file has ${body.length} rows. The most we can take at once is ${MAX_ROWS}.`,
    };
  }

  /*
   * THE NAME COLUMNS D19 DRAWS, AND THE SERVER'S TEACHER TEMPLATE USES:
   * first_name and last_name (backlog 18). Only a single "name" column was
   * read, so the frame's file and the server's own template were refused
   * outright. Both are read now; a file with one "name" column still works.
   */
  const iFirst = headerIndex(header, "firstname", "first");
  const iLast = headerIndex(header, "lastname", "surname", "last");
  const iName = headerIndex(header, "name", "fullname");
  const iEmail = headerIndex(header, "email");
  const iClass = headerIndex(header, "class", "classname");
  const iSubject = headerIndex(header, "subject", "subjectname");
  const split = iFirst !== -1;

  if (!split && iName === -1) {
    return {
      rows: [],
      fatal:
        "We couldn't find a 'first_name' column. Download the template to see the columns we expect.",
    };
  }

  // Class names are the school's own free text, matched case-insensitively so
  // "jss 2a" finds "JSS 2A". Never an archived class: an invitation can't
  // carry one (T15's `class_not_found`).
  const byName = new Map(
    classes.filter((c) => !c.archivedAt).map((c) => [c.name.trim().toLowerCase(), c]),
  );

  const rows = body.map((cells, i): ParsedRow => {
    const at = (idx: number) => (idx === -1 ? "" : (cells[idx] ?? "").trim());
    const first = split ? at(iFirst) : "";
    const last = split ? at(iLast) : "";
    const name = split ? [first, last].filter(Boolean).join(" ") : at(iName);
    const email = at(iEmail);
    const className = at(iClass);
    const subject = at(iSubject);

    const matched = className ? byName.get(className.toLowerCase()) : undefined;

    /*
     * A REPEATED EMAIL IS NO LONGER AN ERROR (backlog 19, D19 step 2). One
     * row is one subject in one class, so a teacher with three appears three
     * times, and "Rows join into one teacher by email, never by name" -
     * `groupTeachers` joins them. The old rule refused every row after the
     * first, which refused the frame's own file.
     */
    let error: string | null = null;
    let unknownClass = false;
    let noEmail = false;
    if (!name) {
      error = "No name in this row.";
    } else if (!email) {
      error = NO_EMAIL;
      noEmail = true;
    } else if (!EMAIL.test(email)) {
      error = "That email doesn't look right.";
    } else if (className && !matched) {
      // CL-07 (SCRUM-149): say what to do, not only what is wrong. The row
      // number sits beside this in the list, so the sentence doesn't repeat it.
      error = `Names ${className}, which is not a class in this school. Create your classes first, then import your staff.`;
      unknownClass = true;
    } else if (subject && !className) {
      // A subject is taught TO a class (T15 pairs them), so alone it says
      // nothing an invitation can carry - and dropping it quietly would be
      // the row half-imported.
      error = "This row names a subject but no class.";
    }

    return {
      line: i + 2, // +1 for the header, +1 because spreadsheets count from one.
      name,
      ...(split ? { firstName: first, lastName: last } : {}),
      email,
      className,
      subject,
      classId: matched?.id ?? null,
      error,
      ...(unknownClass ? { unknownClass } : {}),
      ...(noEmail ? { noEmail } : {}),
    };
  });

  return { rows, fatal: null };
}

/** Split a display name the way the invite body wants it. */
export function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: name.trim(), lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** One thing a teacher teaches, from one row: a class, and the file's subject. */
export interface Teaching {
  line: number;
  classId: string;
  className: string;
  /** As the file typed it. Empty when the row named a class and no subject. */
  subject: string;
}

/** The rows that share an email, joined into the one teacher they describe. */
export interface ImportTeacher {
  /** The folded email: how rows join (never the name). */
  key: string;
  /** Every file line that went into this teacher, in file order. */
  lines: number[];
  /** The first row's - the file's own spelling, never re-split. */
  row: ParsedRow;
  teaches: Teaching[];
}

/**
 * D19 step 2: "Rows join into one teacher by email, never by name." Two
 * teachers both called Mrs Bello with two addresses stay two (the frame draws
 * exactly that), and one address on two rows is one teacher holding both.
 * Rows our own parser refused are not joined: they are left out.
 */
export function groupTeachers(rows: ParsedRow[]): ImportTeacher[] {
  const byEmail = new Map<string, ImportTeacher>();
  for (const r of rows) {
    if (r.error) continue;
    const key = r.email.trim().toLowerCase();
    let t = byEmail.get(key);
    if (!t) {
      t = { key, lines: [], row: r, teaches: [] };
      byEmail.set(key, t);
    }
    t.lines.push(r.line);
    if (r.classId) {
      t.teaches.push({ line: r.line, classId: r.classId, className: r.className, subject: r.subject });
    }
  }
  return [...byEmail.values()];
}

export function toDraft(
  row: ParsedRow,
  classes?: InviteDraft["classes"],
): InviteDraft {
  // The file's own columns when it has them; a one-column name is split.
  const { firstName, lastName } =
    row.firstName !== undefined
      ? { firstName: row.firstName, lastName: row.lastName || null }
      : splitName(row.name);
  /*
   * T15: the classes and subjects, never the legacy single classId - which
   * since T15 is recorded and, for a teacher, not applied.
   */
  return {
    role: "teacher",
    firstName,
    lastName,
    email: row.email || null,
    ...(classes && classes.length > 0 ? { classes } : {}),
  };
}
