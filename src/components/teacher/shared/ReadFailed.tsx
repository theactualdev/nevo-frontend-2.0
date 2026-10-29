"use client";

import { cn } from "@/lib/utils";

/**
 * A READ THAT FAILED, said as one (Lydia, SCRUM-200, 28 Oct).
 *
 * Signed in, a failed read used to put the walkthrough's sample data on
 * screen with a line saying so - "that is invented data presented as real".
 * It is an empty state now: what could not be loaded, and a way to try
 * again. The signed-out walkthrough keeps its samples.
 *
 * TRY AGAIN RELOADS, as the lesson, class and student pages already did. A
 * re-read that fails again changes nothing on screen (`useLiveQuery`), so a
 * button that only re-read would look as if it did nothing at all.
 */
export function ReadFailed({
  title,
  body = "It hasn’t gone anywhere. Try again in a moment.",
  as: Heading = "h3",
  className,
}: {
  title: string;
  body?: string;
  /** The heading level where it sits: a page names itself, a section doesn't. */
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1",
        className,
      )}
    >
      <Heading className="text-[17px] font-semibold text-nevo-near-black">
        {title}
      </Heading>
      <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">{body}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
      >
        Try again
      </button>
    </div>
  );
}
