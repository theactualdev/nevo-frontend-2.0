"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Opens a beat after the segment settles, like the modality suggestion. */
const OPEN_DELAY_MS = 1500;

/**
 * THE DRAWN WORDS, AND ONLY THEM. Frame 38's calm break opens on "Let's take a
 * short break". The two lines this replaced were ours: "That one's been a lot
 * of work" said why, which nothing on the wire tells us, and "You've been at
 * this a while" belonged to a client timer that no longer exists.
 *
 * The frame's next sentence - "This one's been tricky ... or try something
 * different" - is NOT used: the engine also offers breaks on time alone, when
 * nothing was tricky, and "something different" names an option no field
 * carries. Raised with design rather than half-built.
 */
const COPY = "Let's take a short break";

/**
 * The system's break OFFER (B.7 / §4) - the plan naming a break to offer, or
 * the engine suggesting one mid-lesson. One sentence for both; neither claims
 * to know why the engine asked. Same contract as the modality suggestion pill
 * (SCRUM-94.5): two discrete 44px peer buttons, the card itself inert, and
 * **no auto-dismiss** - a self-dismissing offer is indistinguishable from a
 * declined one in the signal record. Declining spends it; the break itself is
 * never forced.
 */
export function BreakOfferPill({
  onAccept,
  onDismiss,
  onShown,
}: {
  onAccept: () => void;
  onDismiss: () => void;
  /** The card has actually appeared, after its beat. */
  onShown?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const onShownRef = useRef(onShown);
  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(true);
      onShownRef.current?.();
    }, OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!open) return null;

  const buttonBase =
    "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3.5 text-sm font-medium whitespace-nowrap transition-[filter] duration-200 active:scale-[0.98]";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-[340px] flex-col items-stretch gap-3.5 rounded-[12px] bg-nevo-cream-elevated p-[18px] pb-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-200 motion-safe:ease-out"
      >
        <span className="text-[15px] leading-[1.45] text-pretty text-nevo-near-black">
          {COPY}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className={cn(
              buttonBase,
              "bg-nevo-navy text-nevo-cream hover:brightness-106",
            )}
          >
            Yes, take a break
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              buttonBase,
              "bg-transparent text-nevo-navy shadow-[inset_0_0_0_1.5px_rgba(59,63,110,0.28)]",
            )}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
