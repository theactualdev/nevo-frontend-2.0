"use client";

import { useState } from "react";
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
 *  - the fourth part is the JUDGEMENT question (Lydia, SCRUM-295, 7 Nov):
 *    find the fault in working, or choose the better approach and say why.
 *    It was "diagnosis" until 2dfddfe, and held while nobody could say what
 *    it was for; now it is drawn with the other three, because it is
 *    accepted and served with them, and a teacher never accepts a question
 *    they were not shown (her 2 Nov rule). Any further item is drawn too;
 *  - no "These work as a set": a set signs off with the checks (Lydia,
 *    5 Nov). Replacing one part is ruled in and waits on Teslim's route, so
 *    "Change one" and the line that the parts "stand or change together"
 *    are not drawn yet.
 */

const PART =
  "rounded-[10px] bg-nevo-cream px-[18px] py-4";
const PART_TAG =
  "inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[0.05em] uppercase";

export function TransferSets({ sets }: { sets: TransferSet[] }) {
  const names = useConceptNames(sets.map((s) => s.conceptId));
  return (
    <div className="mt-6 flex flex-col gap-8">
      {sets.map((set) => {
        // The concept's own name - as the review sends it, else as read -
        // or the section the set came from. Never an id.
        const name = set.conceptName || (set.conceptId && names[set.conceptId]) || set.label;
        const parts = [set.one, set.two, set.question, set.judgement, ...set.others].filter(Boolean).length;
        return (
          <section key={set.key} aria-label={name ? `${name} · transfer question` : "Transfer question"}>
            <span className="text-[13.5px] text-nevo-near-black/55">
              {name ? `${name} · transfer question` : "Transfer question"}
            </span>
            <h3 className="mt-1.5 text-[19px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[21px]">
              One idea, two unlike situations
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-nevo-near-black/64 xl:text-[14.5px]">
              {/* The frame says "Read all three together"; a set is four
                  parts since SCRUM-295, so the count is the set's own. */}
              {`Read all ${parts === 4 ? "four" : parts === 3 ? "three" : "of them"} together. `}
              The two situations should feel different on the surface but need the same idea; the
              question should point at that idea.
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
              {/* SCRUM-295's fourth part. No frame draws it: drawn as a part
                  like the others, under Lydia's own name for it. */}
              {[set.judgement, ...set.others].filter((r): r is CheckRow => r !== null).map((row) => (
                <div key={row.key} className={cn(PART, "mt-3.5")}>
                  <span className={cn(PART_TAG, "text-nevo-violet-text")}>
                    {row === set.judgement ? "The judgement question" : "Also in this set"}
                  </span>
                  <p className="mt-2.5 text-[14.5px] leading-[1.55] text-nevo-near-black">{row.prompt}</p>
                  <ShowAnswer row={row} />
                </div>
              ))}
            </div>
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
