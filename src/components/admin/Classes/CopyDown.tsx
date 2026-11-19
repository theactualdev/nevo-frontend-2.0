"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * D27 "Nevo Admin Copy Down" (SCRUM-194): sits at the end of a row in D05's
 * Add several grid and copies that row's subjects to rows beneath it. It ONLY
 * EVER ADDS - the menu says so - and the host grid shows one confirmation line
 * with Undo afterwards.
 *
 * The four drawn states:
 *  - Idle, first row: a navy copy glyph.
 *  - Idle, other rows: the same glyph, quiet.
 *  - Open: navy, with the menu - "Copy {class}'s N subjects to", Every row
 *    below / Rows in the same year only, each with its count, and "Adds to
 *    anything already on those rows. Nothing is removed."
 *  - Copied: a tick on violet.
 *
 * BUILT REDUCED: the frame's third choice, "Choose rows…", is left out. No
 * frame draws what it opens (which rows, how they are ticked, what confirms),
 * so building it would mean inventing that screen - raised to design.
 */

export type CopyTarget = "below" | "sameYear";

export function CopyDown({
  from,
  count,
  below,
  sameYear,
  quiet,
  copied,
  onCopy,
}: {
  /** The row's class name - "Copy JSS 1A's 9 subjects to". */
  from: string;
  /** How many subjects the row holds. Nothing to copy at 0. */
  count: number;
  /** Rows beneath this one that could take the copy. */
  below: number;
  /** Of those, the ones in this row's year group. */
  sameYear: number;
  /** Every row but the first is drawn quiet. */
  quiet: boolean;
  /** This row was the last one copied from. */
  copied: boolean;
  onCopy: (target: CopyTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const usable = count > 0 && below > 0;

  // Closes on a press outside, or Escape, as a menu does.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (target: CopyTarget) => {
    setOpen(false);
    onCopy(target);
  };
  const rows = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Copy ${from}'s subjects down`}
        title="Copy these subjects down"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={!usable}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-9 flex-none cursor-pointer items-center justify-center rounded-[10px] transition-colors disabled:cursor-default disabled:opacity-35",
          open
            ? "bg-nevo-navy text-nevo-cream"
            : copied
              ? "bg-nevo-violet/24 text-nevo-navy"
              : quiet
                ? "text-nevo-near-black/35 hover:bg-nevo-navy/10"
                : "text-nevo-navy hover:bg-nevo-navy/10",
        )}
      >
        {copied && !open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="8" y="3" width="12" height="12" rx="2.5" />
            <path d="M4 9v10a2 2 0 0 0 2 2h8" />
            <path d="M14 18v4M12 20l2 2 2-2" />
          </svg>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`Copy ${from}'s subjects to`}
          className="absolute top-[42px] right-0 z-30 w-[290px] overflow-hidden rounded-xl bg-nevo-cream shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
        >
          <p className="m-0 px-4 pt-[13px] pb-[7px] text-[13px] leading-[1.45] text-nevo-near-black/66">
            {`Copy ${from}’s `}
            <strong className="font-semibold text-nevo-near-black">
              {`${count} ${count === 1 ? "subject" : "subjects"}`}
            </strong>
            {" to"}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick("below")}
            className="flex w-full cursor-pointer justify-between gap-2.5 bg-nevo-navy/8 px-4 py-2.5 text-left text-[14px] font-semibold text-nevo-near-black"
          >
            <span>Every row below</span>
            <span className="text-[12px] font-medium text-nevo-near-black/55">{rows(below)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={sameYear === 0}
            onClick={() => pick("sameYear")}
            className="flex w-full cursor-pointer justify-between gap-2.5 px-4 py-2.5 text-left text-[14px] font-medium text-nevo-near-black hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
          >
            <span>Rows in the same year only</span>
            <span className="text-[12px] text-nevo-near-black/55">{rows(sameYear)}</span>
          </button>
          <p className="m-0 border-t border-nevo-near-black/8 px-4 pt-2.5 pb-[13px] text-[12.5px] leading-[1.45] text-nevo-near-black/58">
            Adds to anything already on those rows. Nothing is removed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
