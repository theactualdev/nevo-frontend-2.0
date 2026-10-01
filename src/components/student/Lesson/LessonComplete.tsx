"use client";

import { Button, SettlingCharacter } from "@/components/shared";

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
 * swapped ("You strengthened this concept") — hence the copy overrides.
 */
export function LessonComplete({
  onDone,
  onSeeSummary,
  heading = "That's the lesson done. Nicely paced.",
  note,
  doneLabel = "Back to lessons",
}: {
  onDone: () => void;
  onSeeSummary?: () => void;
  heading?: string;
  note?: string;
  doneLabel?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-6 text-center text-nevo-near-black">
      <div className="flex w-full max-w-[300px] flex-col items-center sm:max-w-[430px]">
        <SettlingCharacter
          priority
          className="w-[200px] sm:w-[280px] lg:w-[300px]"
        />

        <h2 className="mt-7 text-[23px] font-semibold leading-[1.35] tracking-[-0.01em] sm:text-[26px]">
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
