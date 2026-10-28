"use client";

import Link from "next/link";
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
 * ONE NUMBERING NOW (9 Oct). Rows rejected by OUR parser carry their file
 * line. The SERVER's `row` counts into the rows we SENT - only the valid ones
 * - from `rowNumberBase` (1), and it carries the value it refused. So a
 * server rejection is mapped back to the sent row, and from there to the line
 * in the admin's own file. This was held while the base was undocumented:
 * pairing on a guess would have put the wrong name beside a real reason.
 * Where a row cannot be mapped (an older response with no base), it says so
 * rather than pointing at a line.
 */

export interface ServerRejection {
  row: number;
  reason: string;
  value?: string | null;
}

/** The file line a server rejection came from, when it can be known. */
export function sentLine(
  r: ServerRejection,
  submitted: ParsedRow[],
  rowNumberBase: number | undefined,
): ParsedRow | null {
  if (rowNumberBase === undefined) return null;
  return submitted[r.row - rowNumberBase] ?? null;
}

/** What an admin needs to find and fix one row in their own spreadsheet. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function RejectedRows({
  broken,
  rejected,
  submitted,
  rowNumberBase,
  filename,
}: {
  /** Rows our own parser refused. Full data, so re-uploadable after a fix. */
  broken: ParsedRow[];
  /** Rows the server refused: a position in `submitted`, a reason, a value. */
  rejected: ServerRejection[];
  /** The rows that were sent, in order - what the server's `row` counts into. */
  submitted: ParsedRow[];
  /** Where the server's `row` counts from. Undefined: it cannot be mapped. */
  rowNumberBase?: number;
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
    const header = "row,reason,name,email,class";
    /*
     * The same columns, in the same order, as the header. This row used to
     * put class before email under a header that says the opposite - a
     * leftover of the student variant, whose template ran name, class, email.
     */
    const ours = broken.map((r) =>
      [r.line, r.error ?? "", r.name, r.email, r.className]
        .map((v) => csvEscape(String(v ?? "")))
        .join(","),
    );
    const theirs = rejected.map((r) => {
      const src = sentLine(r, submitted, rowNumberBase);
      // The same columns, in the same order, as the header and our own rows.
      const name = src?.name ?? r.value ?? "";
      return [src?.line ?? "", r.reason, name, src?.email ?? "", src?.className ?? ""]
        .map((v) => csvEscape(String(v)))
        .join(",");
    });
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
        {rejected.map((r) => {
          const src = sentLine(r, submitted, rowNumberBase);
          // The value the server refused, else the name on the sent row.
          const value = r.value?.trim() || src?.name || null;
          return (
            <li
              key={`theirs-${r.row}-${r.reason}`}
              className="flex gap-3 border-b border-nevo-near-black/[0.07] px-3.5 py-2.5 text-[13.5px] leading-[1.5] last:border-b-0"
            >
              <span className="w-[54px] shrink-0 font-semibold tabular-nums text-nevo-near-black/55">
                {src ? `Row ${src.line}` : "Sent"}
              </span>
              <span className="min-w-0 flex-1 text-nevo-near-black/78">
                {value ? (
                  <span className="font-semibold text-nevo-near-black">{value}</span>
                ) : null}
                {value ? " — " : null}
                {r.reason}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/55">
        Fix these rows in your file and upload it again. Everything else was
        imported and will not be duplicated.
      </p>
      {/* CL-07: a row naming a class the school doesn't have is cured by
          creating the class, so the way there sits beside the reason. */}
      {broken.some((r) => r.unknownClass) && (
        <Link href="/admin/classes" className={`mt-2 inline-block ${TEXT_ACTION}`}>
          Create your classes
        </Link>
      )}
    </div>
  );
}
