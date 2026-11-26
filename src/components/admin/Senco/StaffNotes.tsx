"use client";

import { useCallback, useEffect, useState } from "react";
import { exportApi, STAFF_NOTE_MAX, type StaffNote } from "@/lib/api/export";
import { useMountedRef } from "@/hooks/useMountedRef";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { CARD, PRIMARY_BTN } from "../Roster/primitives";
import { ReadFailed } from "../ReadFailed";
import { WriteFailed } from "../WriteFailed";

/**
 * D08b SC-03's staff notes, on the report they belong to (backlog 43).
 *
 * "Everything above is what Nevo recorded. Add your own judgement below" -
 * each note is a member of staff's, printed with their name and the day,
 * which the SERVER stamps: a note on a child's record that says whatever the
 * caller claimed about who wrote it is not a record of anything.
 *
 * BUILT REDUCED, and why each part is missing:
 * - "it prints as yours" - there is no print or PDF route for a report, and a
 *   guardian's read of a shared report carries Nevo's text only; the notes
 *   are read through the staff-only composition. So the notes say what is
 *   true of them: kept with the report, not part of what a parent reads -
 *   the same sentence the reviewer's private note already uses. Raised.
 * - "Edit notes" - the contract has no edit or delete for a note; once added
 *   it stands. Adding is the only action, and only while the report is a
 *   draft (a final one answers 409 `export_already_final`).
 */

function noteDate(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function StaffNotes({
  exportId,
  firstName,
  editable,
  className,
}: {
  exportId: string;
  firstName: string;
  /** A draft takes new notes; a final report shows its notes and no form. */
  editable: boolean;
  className?: string;
}) {
  const [notes, setNotes] = useState<StaffNote[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [addFailed, setAddFailed] = useState<{ message: string | null } | null>(null);
  const mounted = useMountedRef(); // A read that answers after this has gone sets nothing (check 21).

  const read = useCallback(() => {
    exportApi
      .composition(exportId)
      .then((c) => {
        if (!mounted.current) return;
        setNotes(c.annotations);
        setReadFailed(false);
      })
      .catch(() => {
        if (mounted.current) setReadFailed(true);
      });
  }, [exportId, mounted]);

  useEffect(() => {
    read();
  }, [read]);

  const add = () => {
    const text = body.trim();
    if (!text || adding) return;
    setAdding(true);
    setAddFailed(null);
    exportApi
      .annotate(exportId, text)
      .then((n) => {
        setNotes((prev) => [...(prev ?? []), n]);
        setBody("");
      })
      // A refusal written for the reader (the report went final) is said in
      // the server's words; anything else is our plain "couldn't".
      .catch((err: unknown) =>
        setAddFailed({ message: err instanceof ApiError ? apiErrorMessage(err.detail) : null }),
      )
      .finally(() => setAdding(false));
  };

  // Nothing to show and nothing to add: a final report with no notes says nothing.
  if (!editable && notes && notes.length === 0) return null;

  return (
    <div data-staff-notes className={cn(CARD, "px-6 py-[26px]", className)}>
      <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">Staff notes</h3>
      <p className="m-0 mt-1.5 max-w-[62ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
        {editable
          ? "Everything above is what Nevo recorded. Add your own judgement below."
          : "Everything above is what Nevo recorded."}{" "}
        Notes are kept with the report and are not part of what a parent reads.
      </p>

      {readFailed ? (
        <ReadFailed className="mt-4" what={`the staff notes on ${firstName}’s report`} onRetry={read} />
      ) : notes && notes.length > 0 ? (
        <ul className="m-0 mt-4 list-none space-y-3 p-0">
          {notes.map((n) => (
            <li key={n.id} className="rounded-[10px] bg-nevo-navy/[0.04] px-4 py-3.5">
              <p className="m-0 text-[12.5px] font-semibold text-nevo-navy">
                {`${n.authorName.trim() || "A member of staff"}’s note · added by staff`}
              </p>
              <p className="m-0 mt-1.5 whitespace-pre-wrap text-[14.5px] leading-[1.6] text-nevo-near-black/85">
                {n.body}
              </p>
              {noteDate(n.createdAt) ? (
                <p className="m-0 mt-1.5 text-[12.5px] text-nevo-near-black/50">{noteDate(n.createdAt)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editable && !readFailed ? (
        <div className="mt-4">
          <label htmlFor={`staff-note-${exportId}`} className="block text-[13px] font-semibold text-nevo-near-black">
            Your note
          </label>
          <textarea
            id={`staff-note-${exportId}`}
            value={body}
            maxLength={STAFF_NOTE_MAX}
            onChange={(e) => setBody(e.target.value)}
            disabled={adding}
            rows={4}
            className="mt-2 w-full resize-y rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream p-3 text-[14px] leading-[1.6] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={add} disabled={!body.trim() || adding} className={PRIMARY_BTN}>
              {adding ? "Adding…" : "Add note"}
            </button>
            <span className="text-[12.5px] text-nevo-near-black/55">
              Your name and today&rsquo;s date go with it, and it can&rsquo;t be changed once added.
            </span>
          </div>
          {addFailed ? (
            <WriteFailed className="mt-3" what="add your note" message={addFailed.message} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
