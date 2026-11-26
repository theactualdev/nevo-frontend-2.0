"use client";

import { cn } from "@/lib/utils";

/** 17e's position line, over the card at the end of the reading only. */
export const READING_PAUSE_END = "End of the reading";
/** 17e's line for the moment before the questions, said only then. */
export const READING_PAUSE_QUESTIONS =
  "Ready for the questions, or take a break first?";

/**
 * 17e'S PAUSE, AS ITS OWN SCREEN (17e, the kept Candidate B; Lydia, 19 Nov,
 * L7; Hub, 24 Nov). The attention accommodation reads by the server's groups,
 * and a group the server marks `pauseAfter` is followed by this: the card
 * alone in the middle of the screen, nothing of the lesson around it, as
 * 17e's `pp()` draws it - `pauseWrap` fills the frame.
 *
 * THE FRAME'S WORDS, ONLY WHERE THEY ARE TRUE (Hub, 24 Nov; the two cases the
 * frame does not draw are Lydia's L76):
 * - "A good place to pause", Keep going and Take a break: always.
 * - "End of the reading": after the last group only. Between groups it is not.
 * - "Ready for the questions, or take a break first?": at the end, and only
 *   when a check comes next. The frame's first sentence ("You've read how a
 *   leaf makes its food.") is its own example lesson's, and no field carries
 *   one for a real lesson (rule 5).
 *
 * 320 wide with 28 by 24 inside, and 440 with 34 by 32 from 800 - 17e's `big`.
 */
export function ReadingPauseScreen({
  end,
  questionsNext,
  onKeepGoing,
  onTakeBreak,
}: {
  /** After the reading's last group. */
  end: boolean;
  /** A check is what Keep going opens. Read only at the end. */
  questionsNext: boolean;
  onKeepGoing: () => void;
  onTakeBreak: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh/var(--nevo-text-zoom,1))] items-center justify-center bg-nevo-cream px-6 py-[26px] text-nevo-near-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 min-[800px]:p-10">
      <section
        aria-labelledby="reading-pause-heading"
        className="w-full max-w-[320px] rounded-[16px] bg-nevo-cream-elevated px-6 py-7 text-center shadow-[0_8px_32px_rgba(0,0,0,0.16)] min-[800px]:max-w-[440px] min-[800px]:px-8 min-[800px]:py-[34px]"
      >
        {end && (
          <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-nevo-near-black/50 uppercase">
            {READING_PAUSE_END}
          </p>
        )}
        <h2
          id="reading-pause-heading"
          className={cn(
            "text-xl font-semibold tracking-[-0.01em] text-pretty min-[800px]:text-2xl",
            end && "mt-3",
          )}
        >
          A good place to pause
        </h2>
        {end && questionsNext && (
          <p className="mt-2.5 text-[14.5px] leading-[1.6] text-pretty text-nevo-near-black/70 min-[800px]:text-base">
            {READING_PAUSE_QUESTIONS}
          </p>
        )}
        <div className="mt-[22px] flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onKeepGoing}
            className="flex h-12 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-transform active:scale-[0.98]"
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={onTakeBreak}
            className="flex h-12 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/40 text-[15px] font-semibold text-nevo-navy transition-transform active:scale-[0.98]"
          >
            Take a break
          </button>
        </div>
      </section>
    </div>
  );
}
