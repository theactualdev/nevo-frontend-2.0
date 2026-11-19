"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CohortTransformation } from "@/lib/api/analytics";
import { comparisonLine, figure } from "../Reports/transformationLines";

/**
 * D04's quiet way into D26 (backlog 48): "School transformation · {one
 * figure} · View the metrics". Until this, School transformation could only
 * be reached through Reports and then its second tab.
 *
 * ONE SERVER FIGURE, UNDER ITS HONEST NAME (Lydia, 7 Oct). D04 draws
 * "Self-Regulation Index 66, up 3 this month" - a construct name D26 no
 * longer uses, and a "+3" that would be our own subtraction. So the line
 * carries what D26 itself shows: "Lessons seen through", the server's figure,
 * and the server's own comparison in the words D26 already says it in.
 *
 * Below the reporting floor the server withholds the figures and says why;
 * that sentence stands in for the figure, never a zero. A read that failed
 * keeps the way in and claims nothing. Without Reports, there is no line: it
 * would lead to a page this admin cannot open.
 */

export type TransformationRead =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "failed" }
  | { kind: "ready"; data: CohortTransformation };

/** "Better than..." mid-sentence, after the figure. */
const midSentence = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What the line says, or nothing when the server gave it nothing to say. */
export function transformationSentence(data: CohortTransformation): ReactNode {
  if (data.suppressed) {
    return (
      data.message?.trim() ||
      "There aren’t enough students here yet for school-wide figures, so Nevo doesn’t show any."
    );
  }
  const seen = data.selfRegulation;
  if (!seen) return null;
  const compared = comparisonLine(seen, "%");
  return (
    <>
      Lessons seen through{" "}
      <strong className="font-bold text-nevo-navy">{`${figure(seen.value)}%`}</strong>
      {compared ? `, ${midSentence(compared)}` : ""}.
    </>
  );
}

export function TransformationLine({
  read,
  canOpen,
}: {
  read: TransformationRead;
  /** Whether this admin can open Reports - see `useCanOpen`. */
  canOpen: boolean;
}) {
  if (!canOpen || read.kind === "loading" || read.kind === "denied") return null;
  const said = read.kind === "ready" ? transformationSentence(read.data) : null;
  return (
    <Link
      href="/admin/reports/transformation"
      data-transformation-line
      className="mt-[18px] flex flex-wrap items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-[filter] hover:brightness-[0.985] xl:mt-6 xl:gap-3.5 xl:px-5 xl:py-4"
    >
      <span className="flex-none text-[11px] font-semibold tracking-[0.05em] text-nevo-violet-text uppercase xl:text-[11.5px]">
        School transformation
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] text-nevo-near-black/72 xl:text-[14.5px]">
        {said}
      </span>
      {/* D04's own words at each width: "View" on a tablet, "View the
          metrics" from 1280. */}
      <span className="flex-none text-[13px] font-semibold whitespace-nowrap text-nevo-navy xl:text-[13.5px]">
        <span className="xl:hidden">View</span>
        <span className="hidden xl:inline">View the metrics</span> &rarr;
      </span>
    </Link>
  );
}
