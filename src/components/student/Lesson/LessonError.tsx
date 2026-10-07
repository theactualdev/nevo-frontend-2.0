"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/shared";

/**
 * Lesson error state (Lesson Player frame) — a failed load, handled in the house
 * style: never red, never an alarm icon. The system owns the failure ("We're on
 * it"), explicitly absolves the learner ("Nothing you did caused it"), and
 * always offers a forward path.
 *
 * NO "AND YOUR PROGRESS IS SAVED" (design D89, 6 Oct): "Only where it is
 * actually saved. If the player cannot confirm the save, the line comes out."
 * A screen for a load that failed has no write to confirm.
 */
export function LessonError({
  onRetry,
  onGoBack,
}: {
  onRetry: () => void;
  onGoBack: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-6 text-center text-nevo-near-black">
      <span className="flex size-20 items-center justify-center rounded-full bg-nevo-violet/20">
        <RotateCcw className="size-9 text-nevo-navy" strokeWidth={2} />
      </span>

      <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px] lg:text-[28px]">
        Something went wrong. We&apos;re on it.
      </h2>
      <p className="mt-3 max-w-[320px] text-base leading-[1.6] text-nevo-near-black/72 sm:text-[18px] lg:text-[19px]">
        This one didn&apos;t load. Nothing you did caused it.
      </p>

      <Button className="mt-7 w-full max-w-[300px]" onClick={onRetry}>
        Try again
      </Button>
      <Button
        variant="ghost"
        className="mt-2 h-[46px] w-full max-w-[300px] text-[15px]"
        onClick={onGoBack}
      >
        Go back
      </Button>
    </div>
  );
}
