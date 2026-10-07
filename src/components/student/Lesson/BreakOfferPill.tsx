"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Opens a beat after the segment settles, like the modality suggestion. */
const OPEN_DELAY_MS = 1500;

/**
 * THE DRAWN WORDS, AND ONLY THEM. Frame 38 §3 (6 Oct) asks "Want a break?" and
 * carries nothing else. Design dropped "This one's been tricky" - untrue of a
 * break the engine offers on time alone, and a verdict on the child either
 * way - along with "Try something different", which nothing stood behind, and
 * "Your progress is saved". "Let's take a short break" was the heading of the
 * full-screen card this pill replaced.
 */
const COPY = "Want a break?";

/**
 * The system's break OFFER (B.7 / §4) - the plan naming a break to offer, or
 * the engine suggesting one mid-lesson - as frame 38 §3 draws it: a quiet pill
 * at the foot of the lesson. Round-ended, cream, a violet edge; "Not now" as
 * text, then "Take a break" filled navy. It only asks: it never blames, and it
 * never ends the lesson.
 *
 * Same contract as the modality suggestion pill (SCRUM-94.5): two discrete
 * 44px peer buttons, the pill itself inert, and **no auto-dismiss** - a
 * self-dismissing offer is indistinguishable from a declined one in the signal
 * record. Declining spends it; the break itself is never forced.
 *
 * STICKY, NOT FIXED. It sits in the player's flow just above the chevrons, so
 * on a short segment it is the foot of the lesson, and on a long one it rides
 * the bottom of the screen over the text, as drawn, until the child reaches
 * the end and it settles above the chevrons. Fixed to the floor it would sit
 * on top of them, and moving on without answering is the child's to do.
 *
 * THE FRAME DRAWS A PHONE ONLY, gutter to gutter at 375. From `sm:` the pill
 * hugs its contents and centres rather than stretching across a tablet or a
 * desktop. And at 375 the drawn paddings need about 378px for one line - the
 * frame's own markup wraps all three labels - so the buttons keep their labels
 * whole and "Want a break?" is what wraps. Both raised with design.
 */
export function BreakOfferPill({
  onAccept,
  onDismiss,
  onShown,
}: {
  onAccept: () => void;
  onDismiss: () => void;
  /** The pill has actually appeared, after its beat. */
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
    "flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[14.5px] whitespace-nowrap transition-[filter] duration-200 active:scale-[0.98]";

  return (
    <div className="pointer-events-none sticky bottom-0 z-10 flex shrink-0 justify-center px-4 pb-5">
      <div
        role="status"
        className="pointer-events-auto flex w-full flex-wrap items-center gap-2.5 rounded-full border-[1.5px] border-nevo-violet/50 bg-nevo-cream py-2 pr-2 pl-[22px] shadow-[0_4px_16px_rgba(0,0,0,0.1)] sm:w-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-[10px] motion-safe:duration-[460ms] motion-safe:ease-nevo-slide"
      >
        {/* Never narrower than its longest word: below that - a small phone,
            or a larger text size zooming the player - the two buttons wrap
            together under the question rather than crushing it. */}
        <span className="flex-1 text-[15px] leading-tight font-medium text-nevo-near-black">
          {COPY}
        </span>
        <div className="ml-auto flex gap-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              buttonBase,
              "bg-transparent px-[18px] font-medium text-nevo-navy",
            )}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onAccept}
            className={cn(
              buttonBase,
              "bg-nevo-navy px-5 font-semibold text-nevo-cream hover:brightness-106",
            )}
          >
            Take a break
          </button>
        </div>
      </div>
    </div>
  );
}
