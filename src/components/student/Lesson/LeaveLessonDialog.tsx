"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/shared";
import { cn } from "@/lib/utils";

/**
 * Leave Lesson dialog (Lesson Check frame) — the gentle interruption when a
 * student exits mid-lesson. It never scolds or warns about "losing" work, and
 * offers an easy way back in. Built on Radix Dialog (focus trap + Esc + scrim)
 * as a centered modal over a near-black/30 scrim (never pure black).
 *
 * IT NEVER SAYS THE LATEST PLACE IS SAVED (design D88, 6 Oct). "The dialog
 * must not claim the latest place is saved. Say what is true: they will pick
 * up from the last point that was saved." The frame's "Your progress is saved"
 * / "You can pick up where you left off" showed once the newest position had
 * landed - a report a child cannot check and the next write can make stale.
 * What stays true whatever the network does is the line below: positions that
 * did not land are held and sent later (`useLessonProgress`), and a child comes
 * back to the last one that did.
 *
 * Only where a place is written down at all. A review session and a finished
 * lesson reopened write none, and the signed-out walkthrough writes nothing,
 * so there the dialog is its two choices and nothing it cannot stand behind.
 */
export function LeaveLessonDialog({
  open,
  onOpenChange,
  resumable,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** This lesson writes the child's place down, so leaving can resume it. */
  resumable: boolean;
  /** Confirm leaving — exit the player. */
  onLeave: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-nevo-near-black/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 w-[320px] max-w-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-nevo-cream p-8 text-center text-nevo-near-black shadow-[0_4px_16px_rgba(0,0,0,0.10)] duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:w-[380px] lg:w-[400px]"
        >
          {resumable && (
            <span className="mx-auto mb-[18px] flex size-16 items-center justify-center rounded-full bg-nevo-violet/20">
              <Bookmark className="size-[30px] text-nevo-navy" strokeWidth={2} />
            </span>
          )}

          {/* Radix needs a title either way. With no place written down, it
              names the choice in the buttons' own words and is read, not
              shown. */}
          <DialogPrimitive.Title
            className={cn(
              "text-lg font-semibold text-pretty text-nevo-near-black",
              !resumable && "sr-only",
            )}
          >
            {resumable
              ? "You'll pick up from the last point that was saved."
              : "Leave for now?"}
          </DialogPrimitive.Title>

          <Button
            className={cn("w-full", resumable && "mt-6")}
            onClick={() => onOpenChange(false)}
          >
            Keep learning
          </Button>
          <Button
            variant="ghost"
            className="mt-2 h-12 w-full text-[15px]"
            onClick={onLeave}
          >
            Leave for now
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
