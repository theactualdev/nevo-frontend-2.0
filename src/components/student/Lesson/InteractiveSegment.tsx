"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InteractiveContent } from "@/lib/types";

/**
 * Interactive modality (Lesson Player frame 17) — work through it: a "YOU'LL
 * NEED" strip, tickable STEP cards with square checkboxes, and the activity's
 * own line of what to watch for. No score, no right/wrong — just doing.
 *
 * NO INTRO PARAGRAPH (frame d6b9fbc): the frame removed it, and trimmed the
 * spacing round the strip and the steps, so the in-progress line fits on a
 * phone. `content.intro` is kept, and not drawn.
 *
 * MEASURED IN THE FRAME'S SOURCE (22 Oct on-screen check, d6b9fbc). Its
 * heading and its "STEP n" label set no line-height, so both take `normal`:
 * on 10px type that is a 12px line, not the 15px the inherited 1.5 gave, and
 * each step card is 3px shorter for it. Its checkbox is a 24px box with a 2px
 * border outside it - the frame does not set border-box - so it is 28px
 * square, and the step text starts 56px into the card.
 */
export function InteractiveSegment({
  content,
}: {
  content: InteractiveContent;
}) {
  const [done, setDone] = useState<boolean[]>(() =>
    content.steps.map(() => false),
  );
  const allDone = done.every(Boolean);

  const toggle = (i: number) =>
    setDone((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  /*
   * THE LINE FOR THIS MOMENT (SCRUM-273, frame d6b9fbc): the activity's
   * in-progress line while the child works, its outcome once every step is
   * ticked - each authored per activity, and only when sent. Where the line
   * for the moment is absent there is no box: no reserved height, no
   * placeholder, no skeleton and no fallback. So an activity with the
   * in-progress line alone shows nothing new at the end, and one with the
   * outcome alone shows the steps alone until they are done.
   *
   * No "WHAT YOU SHOULD SEE" label and no tick, and the two lines share one
   * tone: the completion line reads as information, never as a reward.
   */
  const line = allDone ? content.outcome?.done : content.outcome?.pending;

  return (
    <article>
      <h2 className="text-[22px] font-semibold leading-[normal] tracking-[-0.01em] text-nevo-near-black sm:text-[26px] lg:text-[28px]">
        {content.heading}
      </h2>

      {content.needs && content.needs.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-[12px] bg-nevo-violet/8 px-4 py-[11px]">
          <span className="mt-0.5 shrink-0 font-mono text-[10px] tracking-[0.06em] text-nevo-navy uppercase">
            You&apos;ll&nbsp;need
          </span>
          <span className="text-sm leading-[1.5] text-nevo-near-black/82">
            {content.needs.join(" · ")}
          </span>
        </div>
      )}

      <ol className="mt-3.5 flex flex-col gap-2">
        {content.steps.map((step, i) => (
          <li key={i}>
            <button
              type="button"
              // Named on the button itself, as the visible card reads: its
              // text sits only in nested spans, the pattern the 20 Oct
              // production run's accessibility read found unnamed.
              aria-label={`Step ${i + 1}: ${step}`}
              aria-pressed={done[i]}
              onClick={() => toggle(i)}
              className={cn(
                "flex w-full cursor-pointer items-start gap-3 rounded-[12px] px-4 py-[11px] text-left shadow-elevation-1 transition-colors duration-150",
                done[i] ? "bg-nevo-violet/14" : "bg-nevo-cream-elevated",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-7 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors duration-150",
                  done[i]
                    ? "border-nevo-navy bg-nevo-navy"
                    : "border-nevo-near-black/25 bg-transparent",
                )}
              >
                {done[i] && (
                  <Check
                    className="size-[13px] text-nevo-cream"
                    strokeWidth={2.8}
                  />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] leading-[normal] tracking-[0.06em] text-nevo-near-black/50 uppercase">
                  Step {i + 1}
                </span>
                <span className="text-base leading-[1.5] text-nevo-near-black sm:text-[18px] lg:text-[19px]">
                  {step}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {line && (
        <div className="mt-3.5 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1">
          <p className="text-base leading-[1.65] text-nevo-near-black sm:text-[18px] lg:text-[19px]">
            {line}
          </p>
        </div>
      )}
    </article>
  );
}
