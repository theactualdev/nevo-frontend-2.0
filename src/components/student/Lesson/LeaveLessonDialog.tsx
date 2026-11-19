"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/shared";
import { cn } from "@/lib/utils";

/**
 * Leave Lesson dialog (Lesson Check frame) — the gentle interruption when a
 * student exits mid-lesson. It never scolds or warns about "losing" work, and
 * offers an easy way back in. Built on Radix Dialog (focus trap + Esc + scrim)
 * as a centered modal over the Lesson Check frame's scrim: near-black at 55%,
 * `rgba(43,43,47,0.55)` (SCRUM-94), the check sheet's own dim - never pure
 * black. It was /30, which left the lesson behind it reading as live.
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
 * so there the dialog says nothing about a saved place.
 *
 * LEAVING, REFRAMED (17d S7; the Lesson Check Frame's leave screen, 7 Nov):
 * "Leaving for now?", leaving as an ordinary, fine thing, and "Take a break"
 * beside "Leave for now" as a peer route - a break is reachable at any point,
 * offered or not. The frame's first sentence, "You can pick up right where
 * you are whenever you come back", is the claim D88 ruled out, so D88's
 * sentence stands in its place (the hub, 19 Nov; Lydia 4 Nov: an untrue state
 * is worse than a missing feature). Its second sentence is the frame's.
 */
/** D88's sentence (6 Oct): what stays true whatever has landed. */
export const LAST_SAVED = "You'll pick up from the last point that was saved.";

export function LeaveLessonDialog({
  open,
  onOpenChange,
  resumable,
  onLeave,
  onTakeBreak,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** This lesson writes the child's place down, so leaving can resume it. */
  resumable: boolean;
  /** Confirm leaving — exit the player. */
  onLeave: () => void;
  /** The child's own break, taken instead of leaving (17d S7). */
  onTakeBreak?: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-nevo-near-black/55 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          data-nevo-console="student"
          className="fixed top-1/2 left-1/2 z-50 w-[320px] max-w-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-nevo-cream p-8 text-center text-nevo-near-black shadow-[0_4px_16px_rgba(0,0,0,0.10)] duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:w-[380px] xl:w-[400px]"
        >
          {resumable && (
            <span className="mx-auto mb-[18px] flex size-16 items-center justify-center rounded-full bg-nevo-violet/20">
              <Bookmark className="size-[30px] text-nevo-navy" strokeWidth={2} />
            </span>
          )}

          <DialogPrimitive.Title className="text-lg font-semibold text-pretty text-nevo-near-black">
            Leaving for now?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-normal text-pretty text-nevo-near-black/60">
            {resumable && <>{LAST_SAVED} </>}
            Stepping away and coming back later is a good thing to do.
          </DialogPrimitive.Description>

          <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>
            Keep learning
          </Button>
          {onTakeBreak && (
            <Button
              variant="ghost"
              className="mt-2 h-12 w-full text-[15px]"
              onClick={onTakeBreak}
            >
              Take a break
            </Button>
          )}
          <Button
            variant="ghost"
            className={cn("h-12 w-full text-[15px]", onTakeBreak ? "mt-1" : "mt-2")}
            onClick={onLeave}
          >
            Leave for now
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
