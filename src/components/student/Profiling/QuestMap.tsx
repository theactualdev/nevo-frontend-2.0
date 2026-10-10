"use client";

import { createContext } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How many modules the run in progress will present, one segment each. Set by
 * `ProfilingFlow` from its module list; null outside a run, which draws no map.
 */
export const QuestSegments = createContext<number | null>(null);

/**
 * The quest map (`Nevo Quest Map`) - the profiling flow's only progress
 * indicator. Done circles fill navy with a cream check; the active one
 * breathes a soft-violet ring; upcoming stay quiet outlines. The connecting
 * line fills navy up to the last completed circle. No numbers, no labels.
 *
 * ONE SEGMENT PER MODULE THE CHILD WILL ACTUALLY DO (design, 9 Oct). The frame
 * draws four, and it was four here whatever the run held: "The quest map
 * shows the number of modules that child will actually do ... A child who will
 * do three sees three segments." So `segments` is the run's count, never a
 * constant.
 */
export function QuestMap({
  segments,
  filled,
  active,
  className,
}: {
  /** How many modules this run presents. */
  segments: number;
  /** How many of them are complete (0 to `segments`). */
  filled: number;
  /** 0-based index of the segment in progress; -1 for none. */
  active: number;
  className?: string;
}) {
  const done = Math.max(0, Math.min(segments, filled));
  // Circle centres sit evenly across the row; the fill line reaches the last
  // completed centre.
  const fillPct =
    done > 0 && segments > 1 ? ((done - 1) / (segments - 1)) * 100 : 0;

  return (
    <div
      className={cn("relative h-6 w-[300px] sm:h-8 sm:w-[340px]", className)}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={segments}
      aria-label={`Part ${Math.min(segments, done + 1)} of ${segments}`}
    >
      <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-nevo-navy/20 sm:inset-x-4" />
      <div
        className="absolute left-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-nevo-navy transition-[width] duration-300 sm:left-4"
        style={{ width: `calc(${fillPct} * (100% - 1.5rem) / 100)` }}
      />
      <div className="relative flex h-full w-full items-center justify-between">
        {Array.from({ length: segments }, (_, i) => {
          const isDone = i < done;
          const isActive = i === active && !isDone;
          return (
            <span
              key={i}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full sm:size-8",
                isDone && "bg-nevo-navy",
                isActive &&
                  "border-2 border-nevo-violet bg-nevo-cream motion-safe:animate-nevo-quest-pulse",
                !isDone && !isActive && "border-2 border-nevo-navy/20 bg-nevo-cream",
              )}
            >
              {isDone && (
                <Check className="size-[11px] text-nevo-cream sm:size-[13px]" strokeWidth={3} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
