"use client";

import { cn } from "@/lib/utils";
import { WAY_IN_LABEL, type WayIn } from "@/lib/lessons/waysIn";
import { READING_BODY } from "./readingSupport";

/**
 * "LET'S TRY THIS ANOTHER WAY." (17d S1-S2; Nevo Lesson Player Frame
 * `showWaysIn`, design 52e3ae3) - the other ways into a section, in place
 * above its content, after a miss on its check while the gate is on.
 *
 * Only what the section can serve is listed, so the set varies and the card
 * never assumes four (`waysInFor`). The server's suggestion carries the same
 * spark as the format group's, because it means the same thing. Nothing is
 * consumed: a child takes any of them, in any order, as often as they like,
 * and the card stays until the check is passed. No count, no verdict, no
 * error styling - the frame's rules for 17d.
 *
 * Each way presses the section's own control (`onTake`) - the format group
 * or the pace chips - so taking one is exactly the child's own pick there.
 */
export function WaysInCard({
  ways,
  suggested,
  onTake,
  reading = false,
}: {
  ways: readonly WayIn[];
  /** The server's suggestion, when it is one of `ways`. */
  suggested: WayIn | null;
  onTake: (way: WayIn) => void;
  /** The reading accommodation is on - see `readingSupport`. */
  reading?: boolean;
}) {
  if (ways.length === 0) return null;
  return (
    <section
      aria-label="Other ways into this section"
      className="mb-[22px] rounded-[12px] bg-nevo-cream-elevated px-[18px] pt-[18px] pb-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
    >
      <p
        className={cn(
          "text-base font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[18px] lg:text-[19px]",
          reading && READING_BODY,
        )}
      >
        Let&apos;s try this another way.
      </p>
      <p className="mt-1.5 text-sm leading-[1.5] text-nevo-near-black/68">
        Take any of these, in any order, as many times as you like.
      </p>
      <div className="mt-3.5 flex flex-col gap-2">
        {ways.map((way) => (
          <button
            key={way}
            type="button"
            // Named on the button itself; the spark is never part of the name.
            aria-label={WAY_IN_LABEL[way]}
            data-suggested={way === suggested || undefined}
            onClick={() => onTake(way)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] bg-nevo-cream px-4 py-3.5 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06)] outline-none focus-visible:ring-2 focus-visible:ring-nevo-navy motion-safe:transition-transform motion-safe:duration-[120ms] motion-safe:active:scale-[0.98]"
          >
            <span
              className={cn(
                "text-base font-medium text-nevo-near-black sm:text-[18px] lg:text-[19px]",
                reading && READING_BODY,
              )}
            >
              {WAY_IN_LABEL[way]}
            </span>
            {way === suggested && <Spark />}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The frame's 15px spark, navy. Decorative. */
function Spark() {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        className="fill-nevo-navy"
        focusable="false"
      >
        <path d="M12 1.5l1.7 6.8L20.5 10l-6.8 1.7L12 18.5l-1.7-6.8L3.5 10l6.8-1.7z" />
      </svg>
    </span>
  );
}
