import type { OnboardingState, RejectedRow } from "@/lib/api/onboarding";

/**
 * The pure half of D24's OB-01/OB-02 - what the upload screens claim, separate
 * from how they draw it.
 *
 * Separate because every sentence on OB-02 is a claim about a school's own
 * file, and the frame is explicit about the tone those claims take: *"Nothing
 * here is red or urgent - the number states the position and leaves it."*
 * That is easier to test than to eyeball.
 */

/** Whether anything has been staged at all - OB-01 has nothing to move on to. */
export function hasStaged(state: OnboardingState | null): boolean {
  if (!state) return false;
  return (
    state.studentCount > 0 ||
    state.teacherCount > 0 ||
    state.classes.length > 0 ||
    state.rejected.length > 0
  );
}

/**
 * The four numbers across the top of OB-02.
 *
 * READ, NEVER DERIVED. `studentCount` is the server's count of rows that read
 * cleanly, not `total - rejected.length`: a rejected row is not necessarily a
 * student, and subtracting one from the other would invent a number nobody
 * sent. Backend's own note on `stage` makes the same point about inferring
 * from arrays.
 */
export interface FoundCounts {
  classes: number;
  teachers: number;
  students: number;
  toFix: number;
}

export function foundCounts(state: OnboardingState): FoundCounts {
  return {
    classes: state.classes.length,
    teachers: state.teacherCount,
    students: state.studentCount,
    toFix: state.rejected.length,
  };
}

/**
 * "4 rows to fix" / "1 row to fix" - and nothing at all when there are none.
 *
 * Null rather than "0 rows to fix", because a clean file has no position to
 * state. The frame's fourth tile simply is not there when the number is zero.
 */
export function toFixLabel(n: number): string | null {
  if (n <= 0) return null;
  return `${n} row${n === 1 ? "" : "s"} to fix`;
}

/**
 * The rejected rows as a CSV a school can open in the spreadsheet it came from.
 *
 * OB-01's whole argument is that the format is strict, so the fix happens in
 * Excel rather than here - the frame offers "Download the 4 rows" and no inline
 * editor. This is that file.
 *
 * QUOTED AND ESCAPED, because `reason` and `value` are free text from the
 * server and a comma in either would silently shift every later column. A
 * school opening a corrupted correction file would fix the wrong cells.
 */
export function rejectedCsv(rows: RejectedRow[]): string {
  const cell = (v: string | number) => `"${String(v).split('"').join('""')}"`;
  const head = ["Row", "Column", "Value", "What to fix"].map(cell).join(",");
  const body = rows.map((r) =>
    [r.rowNumber, r.field, r.value, r.reason].map(cell).join(","),
  );
  return [head, ...body].join("\r\n");
}

/**
 * Whether "Confirm N students" may be pressed.
 *
 * `canConfirm` IS THE SERVER'S ANSWER and is read rather than recomputed -
 * not `students > 0 && rejected.length === 0`. The frame is explicit that
 * rejected rows do NOT block a confirm: *"The 4 rows can be fixed now or left
 * for later - they simply won't join until they're sorted."* A console that
 * derived this would have got that exactly backwards.
 */
export function mayConfirm(state: OnboardingState | null): boolean {
  return state?.canConfirm === true;
}

/**
 * The column headings out of a template the server made - its first row.
 *
 * Read, not known: the server generates that row from the parser's own
 * columns, so this is the one list of them that cannot drift. Split as CSV
 * because a heading may be quoted; the BOM it carries for Excel goes with the
 * trim, which counts it as whitespace. Null when there is nothing to show,
 * which renders as no list rather than an empty one.
 */
export function templateColumns(text: string): string[] | null {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < first.length; i++) {
    const ch = first[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (first[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  const columns = cells.map((c) => c.trim()).filter(Boolean);
  return columns.length ? columns : null;
}
