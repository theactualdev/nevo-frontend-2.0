"use client";

import { useContext, useEffect } from "react";
import { Button, SettlingCharacter } from "@/components/shared";
import { LessonContext } from "@/context/LessonContext";
import { cn } from "@/lib/utils";

/**
 * Lesson Complete (Lesson Check frame) — the calm close of a lesson. A settling
 * illustration, warm unhurried copy, and the reassurance motif ("Your progress
 * is saved"). The full break + summary flow lives in screen 18 (Break Module &
 * Completion), so "See summary" only renders once that lands — passed in via
 * `onSeeSummary`.
 *
 * NO NOTE BY DEFAULT. "Your progress is saved." was the default, so every
 * caller that passed nothing claimed a save - including while the completion
 * write was still in flight, and for lessons nothing writes at all. The caller
 * knows whether it landed; this screen does not, so it says only what it is
 * handed.
 *
 * "Back to lessons" is the frame's button. It had become "Back to home" with
 * no ruling behind it, on a screen the IA gives no path home from.
 *
 * The review session (37d) reuses this same screen with only the message
 * swapped - hence the copy overrides. What the review may say is D40's, in
 * `lib/lessons/reviewOutcome.ts`.
 *
 * NO "NICELY PACED" (D40, 1 Oct). The frame's heading ends on it, and it is a
 * verdict on the child with nothing behind it: no field says how they paced
 * anything, and praise for pace is not something Nevo offers.
 */
export function LessonComplete({
  onDone,
  onSeeSummary,
  heading = "That's the lesson done.",
  headingHeld = false,
  note,
  doneLabel = "Back to lessons",
}: {
  onDone: () => void;
  onSeeSummary?: () => void;
  heading?: string;
  /**
   * The heading waits on a write that decides it. Its space is kept, so the
   * screen does not move when it lands, and it is hidden from screen readers
   * until then.
   */
  headingHeld?: boolean;
  note?: string;
  doneLabel?: string;
}) {
  /*
   * THE FIRST SCREEN OF A LESSON ASK NEVO MAY SIT OVER. IA 31 keeps it off
   * active lesson content - the segments, a break, a module boundary, the
   * after-lesson check - and puts it on this one. Completion is a phase of the
   * player rather than a route, so this screen says it is up.
   *
   * A tolerant read, like Ask Nevo's own: the player's own tests render this
   * with no provider at all, and there is then no drawer to allow.
   */
  const allowAskNevo = useContext(LessonContext)?.setAskNevoAllowed;
  useEffect(() => {
    if (!allowAskNevo) return;
    allowAskNevo(true);
    return () => allowAskNevo(false);
  }, [allowAskNevo]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-6 text-center text-nevo-near-black">
      <div className="flex w-full max-w-[300px] flex-col items-center sm:max-w-[430px]">
        <SettlingCharacter
          priority
          className="w-[200px] sm:w-[280px] lg:w-[300px]"
        />

        <h2
          aria-hidden={headingHeld || undefined}
          className={cn(
            "mt-7 text-[23px] font-semibold leading-[1.35] tracking-[-0.01em] sm:text-[26px]",
            headingHeld && "invisible",
          )}
        >
          {heading}
        </h2>
        {/* Live and always present, because the save can land a moment after
            the screen does and a screen reader should hear that it did. */}
        <div aria-live="polite">
          {note && (
            <p className="mt-2.5 text-base text-pretty text-nevo-near-black/70 sm:text-[17px]">
              {note}
            </p>
          )}
        </div>

        <Button className="mt-8 w-full max-w-[300px]" onClick={onDone}>
          {doneLabel}
        </Button>
        {onSeeSummary && (
          <Button
            variant="ghost"
            className="mt-2 h-[46px] w-full max-w-[300px] text-[15px]"
            onClick={onSeeSummary}
          >
            See summary
          </Button>
        )}
      </div>
    </div>
  );
}
