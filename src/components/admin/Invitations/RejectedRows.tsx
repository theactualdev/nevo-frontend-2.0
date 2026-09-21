"use client";

import type { ParsedRow } from "./csv";
import { TEXT_ACTION } from "../Roster/primitives";

/**
 * CL-06's rejected list — *"the most important frame, and missing from every
 * import in the product today."*
 *
 * THE DETAIL WAS ALWAYS ON THE WIRE. `BulkInvitationResponse.rejected` is
 * `RejectedInvitationResponse[]` with `{row, reason}`, both REQUIRED, and the
 * client's own parser produces `{line, error}` per row. The result screen
 * added the two lengths together and rendered one sentence — "4 rows were
 * skipped due to errors" — so an admin importing thirty classes was told a
 * number and left to find the four themselves. Per SCRUM-149 a rejected row
 * carries its row number, the offending value and a plain reason.
 *
 * TWO SOURCES, DELIBERATELY NOT MERGED INTO ONE NUMBERING.
 *
 * Rows rejected by OUR parser carry the full row, so their offending value is
 * shown. Rows rejected by the SERVER carry `{row, reason}` and nothing else.
 * It is tempting to look up the server's `row` in the parsed rows and show the
 * value from there — and that is exactly what this does not do. Our `line` is
 * `index + 2` (header, plus spreadsheets counting from one); the contract
 * documents no base for `row` at all. Pairing them on an assumption would put
 * the wrong name beside a real reason, which is worse than showing no name.
 *
 * TODO(api): document the base of `RejectedInvitationResponse.row`, or add the
 * offending value to it. Either closes the gap; guessing does not.
 */

export interface ServerRejection {
  row: number;
  reason: string;
}

/** What an admin needs to find and fix one row in their own spreadsheet. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function RejectedRows({
  broken,
  rejected,
  isStudent,
  filename,
}: {
  /** Rows our own parser refused. Full data, so re-uploadable after a fix. */
  broken: ParsedRow[];
  /** Rows the server refused. Row number and reason only. */
  rejected: ServerRejection[];
  isStudent: boolean;
  filename: string;
}) {
  const total = broken.length + rejected.length;
  if (total === 0) return null;

  /*
   * A file the admin can fix and re-upload. Our own rejects go in with their
   * original columns; the server's go in with the row number and reason so
   * they can be found in the source file. Both carry `reason`, because a list
   * of rows with no reason is the same dead end as a count.
   */
  const download = () => {
    const header = isStudent
      ? "row,reason,name,class,student_email,parentContact"
      : "row,reason,name,email,class";
    const ours = broken.map((r) =>
      [
        r.line,
        r.error ?? "",
        r.name,
        r.className,
        isStudent ? r.email : r.email,
        ...(isStudent ? [r.parentContact] : []),
      ]
        .map((v) => csvEscape(String(v ?? "")))
        .join(","),
    );
    const theirs = rejected.map((r) =>
      [r.row, r.reason].map((v) => csvEscape(String(v))).join(","),
    );
    const blob = new Blob([[header, ...ours, ...theirs].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-nevo-near-black/60">
          {total} {total === 1 ? "row was" : "rows were"} not imported
        </span>
        <button type="button" onClick={download} className={TEXT_ACTION}>
          Download these rows
        </button>
      </div>

      <ul className="mt-2 max-h-[34vh] list-none space-y-0 overflow-auto rounded-[10px] border border-nevo-near-black/10 p-0">
        {broken.map((r) => (
          <li
            key={`ours-${r.line}`}
            className="flex gap-3 border-b border-nevo-near-black/[0.07] px-3.5 py-2.5 text-[13.5px] leading-[1.5] last:border-b-0"
          >
            <span className="w-[54px] shrink-0 font-semibold tabular-nums text-nevo-near-black/55">
              Row {r.line}
            </span>
            <span className="min-w-0 flex-1 text-nevo-near-black/78">
              {/* The offending value, which is what makes the row findable. */}
              {r.name ? (
                <span className="font-semibold text-nevo-near-black">
                  {r.name}
                </span>
              ) : null}
              {r.name ? " — " : null}
              {r.error}
            </span>
          </li>
        ))}
        {rejected.map((r) => (
          <li
            key={`theirs-${r.row}-${r.reason}`}
            className="flex gap-3 border-b border-nevo-near-black/[0.07] px-3.5 py-2.5 text-[13.5px] leading-[1.5] last:border-b-0"
          >
            <span className="w-[54px] shrink-0 font-semibold tabular-nums text-nevo-near-black/55">
              Row {r.row}
            </span>
            <span className="min-w-0 flex-1 text-nevo-near-black/78">
              {r.reason}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/55">
        Fix these rows in your file and upload it again. Everything else was
        imported and will not be duplicated.
      </p>
    </div>
  );
}
