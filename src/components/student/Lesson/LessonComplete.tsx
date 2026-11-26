"use client";

import { useContext, useEffect, useState } from "react";
import { Button, SettlingCharacter } from "@/components/shared";
import { LessonContext } from "@/context/LessonContext";
import { SAVING_LESSON_LINE } from "@/lib/lessons/verdict";
import { cn } from "@/lib/utils";
import { useMarkWait } from "./MarkWait";

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
  saving = false,
  doneLabel = "Back to lessons",
  askNevo = true,
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
  /**
   * The completion write is still on its way. Past about two seconds, and
   * while no note has been handed in, Lydia's end-of-lesson wait takes the
   * note's place: "Nevo is saving your lesson." (10 and 11 Nov). Never for a
   * lesson that writes nothing - the caller says only what is in flight.
   */
  saving?: boolean;
  doneLabel?: string;
  /**
   * Whether Ask Nevo may sit over this ending. Off for a lesson closed because
   * its copy was withdrawn for safety (L14): see the effect below.
   */
  askNevo?: boolean;
}) {
  const { slow } = useMarkWait(saving && !note ? 0 : null, null);
  const said = note ?? (saving && slow ? SAVING_LESSON_LINE : undefined);
  /*
   * THE FIRST SCREEN OF A LESSON ASK NEVO MAY SIT OVER. IA 31 keeps it off
   * active lesson content - the segments, a break, a module boundary, the
   * after-lesson check - and puts it on this one. Completion is a phase of the
   * player rather than a route, so this screen says it is up.
   *
   * A tolerant read, like Ask Nevo's own: the player's own tests render this
   * with no provider at all, and there is then no drawer to allow.
   */
  /*
   * NOT OVER A LESSON WITHDRAWN FOR SAFETY (Hub, 24 Nov, on-screen QA). L14's
   * close is the lesson stopped, not ended - written `exited` - and Ask
   * Nevo's place after a lesson (Lydia, 17 Oct, item 29) is for one that
   * ended. The drawer here is scoped to this lesson, and the server's lesson
   * overview answers a child with every section's title, held ones included
   * (raised as S11). Her 12 Nov ruling is that held content is revoked before
   * any more of it is read; a launcher over this screen could read it back.
   */
  const allowAskNevo = useContext(LessonContext)?.setAskNevoAllowed;
  useEffect(() => {
    if (!allowAskNevo || !askNevo) return;
    allowAskNevo(true);
    return () => allowAskNevo(false);
  }, [allowAskNevo, askNevo]);

  /*
   * NO BROKEN BOX. The player fetched this picture while it had a connection
   * (`preloadSettlingCharacter`), but a lesson opened offline never could.
   * A picture that will not load is left out, not drawn as its alt text.
   */
  const [pictureFailed, setPictureFailed] = useState(false);

  return (
    <div className="flex min-h-[calc(100dvh/var(--nevo-text-zoom,1))] flex-col items-center justify-center bg-nevo-cream px-6 text-center text-nevo-near-black">
      <div className="flex w-full max-w-[300px] flex-col items-center sm:max-w-[430px] xl:max-w-[460px]">
        {!pictureFailed && (
          <SettlingCharacter
            priority
            className="w-[200px] sm:w-[280px] xl:w-[300px]"
            onError={() => setPictureFailed(true)}
          />
        )}

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
          {said && (
            <p
              data-saving-lesson={said === SAVING_LESSON_LINE || undefined}
              className="mt-2.5 text-base text-pretty text-nevo-near-black/70 sm:text-[17px]"
            >
              {said}
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
