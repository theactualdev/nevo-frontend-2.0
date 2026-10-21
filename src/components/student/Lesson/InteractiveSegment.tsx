"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InteractiveContent } from "@/lib/types";

/**
 * Interactive modality (Lesson Player frame 17) — work through it: a "YOU'LL
 * NEED" strip, tickable STEP cards with square checkboxes, and a "WHAT YOU
 * SHOULD SEE" outcome that resolves once every step is done. No score, no
 * right/wrong — just doing.
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

  return (
    <article>
      <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black sm:text-[26px] lg:text-[28px]">
        {content.heading}
      </h2>
      {content.intro && (
        <p className="mt-4 text-base leading-[1.6] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]">
          {content.intro}
        </p>
      )}

      {content.needs && content.needs.length > 0 && (
        <div className="mt-5 flex items-start gap-2.5 rounded-[12px] bg-nevo-violet/8 px-4 py-3.5">
          <span className="mt-0.5 shrink-0 font-mono text-[10px] tracking-[0.06em] text-nevo-navy uppercase">
            You&apos;ll&nbsp;need
          </span>
          <span className="text-sm leading-[1.5] text-nevo-near-black/82">
            {content.needs.join(" · ")}
          </span>
        </div>
      )}

      <ol className="mt-4 flex flex-col gap-2.5">
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
                "flex w-full cursor-pointer items-start gap-3 rounded-[12px] px-4 py-3.5 text-left shadow-elevation-1 transition-colors duration-150",
                done[i] ? "bg-nevo-violet/14" : "bg-nevo-cream-elevated",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors duration-150",
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
                <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
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

      {/* Outcome — resolves once every step is ticked (never a pass/fail flip).
          A live activity's card waits for the last tick: its one outcome is
          the result, and it has no guide line to show before - see
          `InteractiveContent.outcome`. None at all, no card. */}
      {content.outcome && (allDone || content.outcome.pending) && (
        <div className="mt-4 rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1">
          <p className="font-mono text-[11px] tracking-[0.06em] text-nevo-navy uppercase">
            What you should see
          </p>
          <div className="mt-2.5 flex items-start gap-3">
            {allDone && (
              <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                <Check
                  className="size-[13px] text-nevo-cream"
                  strokeWidth={2.8}
                />
              </span>
            )}
            <p
              className={cn(
                "text-base leading-[1.65] sm:text-[18px] lg:text-[19px]",
                allDone ? "text-nevo-near-black" : "text-nevo-near-black/70",
              )}
            >
              {allDone ? content.outcome.done : content.outcome.pending}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
