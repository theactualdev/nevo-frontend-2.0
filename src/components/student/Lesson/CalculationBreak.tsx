"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/shared";

/**
 * THE BREAK ON A CALCULATION (Nevo Calculation Solver Frame, `break-mid`).
 *
 * Lydia, 23 Oct: a hold is not live until a break is reachable from it at all
 * times. A calculation holds a child at its step until it is solved, and had
 * no break at all unless the engine happened to offer one - their only way
 * off it was leaving the lesson (audit, 2 Nov, launch-level). The frame: "The
 * break is reachable at all times - never behind a step or a sheet, never
 * unavailable mid-calculation."
 *
 * So "Take a break" sits in the top bar, and taking it puts the frame's card
 * above the calculation, "offered in place, the calculation still visible
 * beneath": the child stays in the work (D6, Lydia 26 Oct). The calculation
 * waits, untouched, until they say they are ready. No timer ends it.
 *
 * The frame's words, verbatim.
 */
export const CALC_BREAK_COPY = {
  take: "Take a break",
  label: "A BREAK, WHENEVER YOU NEED ONE",
  body: "Take a few minutes. This calculation stays right here, just as you left it.",
  ready: "I'm ready to keep going",
} as const;

/**
 * The top bar's pill: 40px, a quiet navy outline on nothing, as the frame
 * draws it beside the title. It stays where it is during the break and does
 * nothing more there - the card is the way back.
 */
export function CalculationBreakPill({
  onBreak,
  onBreakNow,
}: {
  onBreak: () => void;
  /** A break is under way. */
  onBreakNow: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onBreak}
      aria-pressed={onBreakNow}
      className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-full px-[15px] text-[13px] font-medium text-nevo-navy shadow-[inset_0_0_0_1.5px_rgba(59,63,110,0.28)] transition-colors hover:bg-nevo-navy/[0.06] active:bg-nevo-navy/[0.12]"
    >
      {CALC_BREAK_COPY.take}
    </button>
  );
}

/**
 * The card, first in the column above the calculation. Focus goes to its way
 * back as it opens, so a child on a keyboard or a switch is not left on the
 * pill behind it.
 */
export function CalculationBreakCard({ onReady }: { onReady: () => void }) {
  const ready = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ready.current?.focus();
  }, []);
  return (
    <section
      aria-label={CALC_BREAK_COPY.label}
      className="mb-[18px] rounded-xl bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1"
    >
      <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-navy">
        {CALC_BREAK_COPY.label}
      </span>
      <p className="mt-2 text-[15px] leading-[1.55] text-nevo-near-black">
        {CALC_BREAK_COPY.body}
      </p>
      <Button ref={ready} className="mt-3.5 w-full text-base" onClick={onReady}>
        {CALC_BREAK_COPY.ready}
      </Button>
    </section>
  );
}
