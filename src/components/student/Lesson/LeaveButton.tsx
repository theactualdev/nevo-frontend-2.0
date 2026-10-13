"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The way out of the after-lesson check and the review entry (D36, 1 Oct).
 *
 * Neither had one: once a check or a review began, finishing it was the only
 * door. Design's ruling is that a child may leave, that leaving is never
 * framed as quitting, and that there is no warning before it - so this is the
 * player's own exit control, in the player's own place, and it leaves at once.
 *
 * Named with the leave dialog's "Leave for now", the frame's words for going,
 * rather than anything that sounds like giving up.
 */
export function LeaveButton({
  onLeave,
  className,
}: {
  onLeave: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Leave for now"
      onClick={onLeave}
      className={cn(
        "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]",
        className,
      )}
    >
      <X className="size-5" strokeWidth={2} />
    </button>
  );
}
