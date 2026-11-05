"use client";

import { useState, type ReactNode } from "react";
import { useConceptNames } from "@/hooks/useConceptNames";
import { cn } from "@/lib/utils";
import type { CheckRow, TransferSet } from "./reviewModel";
import { Answer } from "./StepChecks";

/**
 * C25, Transfer Question Review (1397ec4; Lydia's test 5), as far as the
 * server goes on 5 Nov (backend #8).
 *
 * A transfer set puts one concept in two unlike situations, then asks what
 * the two share. The frame draws the three parts together, because "they
 * only work as a set". The server writes them as checks: each part is a
 * question with its own choices and answer, joined to the end-of-lesson
 * questions, and signed by the checks step's ONE press with every other
 * check. So:
 *  - each part shows its question, with the answer one tap away;
 *  - the fourth item the server writes, \`diagnosis\`, has no place in the
 *    frame and is shown as an ordinary check under the set (Hub, 5 Nov);
 *  - "These work as a set" and "Change one" are HELD (rule 10): no route
 *    approves a set apart from the other checks, and none changes a part.
 *    The frame's line that the parts "stand or change together" is held
 *    with them - nothing here changes.
 */

const PART =
  "rounded-[10px] bg-nevo-cream px-[18px] py-4";
const PART_TAG =
  "inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[0.05em] uppercase";

export function TransferSets({
  sets,
  renderOthers,
}: {
  sets: TransferSet[];
  renderOthers: (rows: CheckRow[]) => ReactNode;
}) {
  const names = useConceptNames(sets.map((s) => s.conceptId));
  return (
    <div className="mt-6 flex flex-col gap-8">
      {sets.map((set) => {
        // The concept's own name, or the section the set came from - never
        // an id, and nothing at all when neither is to hand.
        const name = (set.conceptId && names[set.conceptId]) || set.label;
        return (
          <section key={set.key} aria-label={name ? `${name} · transfer question` : "Transfer question"}>
            <span className="text-[13.5px] text-nevo-near-black/55">
              {name ? `${name} · transfer question` : "Transfer question"}
            </span>
            <h3 className="mt-1.5 text-[19px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[21px]">
              One idea, two unlike situations
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-nevo-near-black/64 xl:text-[14.5px]">
              Read all three together. The two situations should feel different on the surface but
              need the same idea; the question should point at that idea.
            </p>
            <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated px-5 py-5 shadow-elevation-1 xl:px-6">
              {(set.one || set.two) && (
                <div className="grid grid-cols-2 gap-3.5">
                  {set.one && <Situation n={1} label="Situation one" row={set.one} />}
                  {set.two && <Situation n={2} label="Situation two" row={set.two} />}
                </div>
              )}
              {set.question && (
                <div className={cn("rounded-[10px] bg-nevo-violet/16 px-[18px] py-4", (set.one || set.two) && "mt-3.5")}>
                  <span className={cn(PART_TAG, "text-nevo-navy")}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 7h8M8 12h8M8 17h5" />
                    </svg>
                    The question
                  </span>
                  <p className="mt-2.5 text-[15px] leading-[1.5] font-semibold text-nevo-near-black">
                    {set.question.prompt}
                  </p>
                  <ShowAnswer row={set.question} />
                </div>
              )}
            </div>
            {set.others.length > 0 && renderOthers(set.others)}
          </section>
        );
      })}
    </div>
  );
}

function Situation({ n, label, row }: { n: number; label: string; row: CheckRow }) {
  return (
    <div className={PART}>
      <span className={cn(PART_TAG, "text-nevo-violet-text")}>
        <span
          aria-hidden
          className="flex size-[18px] items-center justify-center rounded-full bg-nevo-navy/12 text-[11px] text-nevo-navy"
        >
          {n}
        </span>
        {label}
      </span>
      <p className="mt-2.5 text-[14.5px] leading-[1.55] text-nevo-near-black">{row.prompt}</p>
      <ShowAnswer row={row} />
    </div>
  );
}

/** Each part is a question with an answer it is marked against: one tap away. */
function ShowAnswer({ row }: { row: CheckRow }) {
  const [open, setOpen] = useState(false);
  if (!row.type) return null;
  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-nevo-navy underline-offset-2 hover:underline"
      >
        {open ? "Hide the answer" : "Show the answer"}
      </button>
      {open && (
        <div className="mt-2">
          <Answer type={row.type} options={row.options} answerKey={row.answerKey} compact />
        </div>
      )}
    </div>
  );
}
