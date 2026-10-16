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
  name: string;
  email: string;
  className: string;
  /** Null when the row is fine. */
  error: string | null;
  /** Resolved from `className`; null when unmatched or absent. */
  classId: string | null;
}

/**
 * The downloadable template.
 *
 * There was a student template too, with a parent contact column (SCRUM-162).
 * It went with the student invite itself (L2, 14 Oct): a school adds its
 * children on Students, which has its own roster import.
 */
export const TEMPLATE =
  "name,email,class\nFolake Adeyemi,adeyemi.f@school.edu.ng,JSS 2A\n";

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

  const iName = headerIndex(header, "name", "fullname");
  const iEmail = headerIndex(header, "email");
  const iClass = headerIndex(header, "class", "classname");

  if (iName === -1) {
    return {
      rows: [],
      fatal:
        "We couldn't find a 'name' column. Download the template to see the columns we expect.",
    };
  }

  // Class names are the school's own free text, matched case-insensitively so
  // "jss 2a" finds "JSS 2A".
  const byName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));

  const seen = new Set<string>();

  const rows = body.map((cells, i): ParsedRow => {
    const at = (idx: number) => (idx === -1 ? "" : (cells[idx] ?? "").trim());
    const name = at(iName);
    const email = at(iEmail);
    const className = at(iClass);

    const matched = className ? byName.get(className.toLowerCase()) : undefined;

    let error: string | null = null;
    if (!name) {
      error = "No name in this row.";
    } else if (email && !EMAIL.test(email)) {
      error = "That email doesn't look right.";
    } else if (className && !matched) {
      error = `No class called "${className}".`;
    } else if (!email) {
      error = "A teacher needs an email to be invited.";
    } else {
      // A file that invites the same person twice would send them two links.
      const key = email.toLowerCase();
      if (seen.has(key)) {
        error = "This row repeats one above it.";
      } else {
        seen.add(key);
      }
    }

    return {
      line: i + 2, // +1 for the header, +1 because spreadsheets count from one.
      name,
      email,
      className,
      classId: matched?.id ?? null,
      error,
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

export function toDraft(row: ParsedRow): InviteDraft {
  const { firstName, lastName } = splitName(row.name);
  return {
    role: "teacher",
    firstName,
    lastName,
    email: row.email || null,
    classId: row.classId,
  };
}
