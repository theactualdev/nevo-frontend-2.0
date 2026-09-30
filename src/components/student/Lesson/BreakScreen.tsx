"use client";

import { useEffect, useRef, useState } from "react";
import { IllustrationWrapper } from "@/components/shared";
import { BREAK_TYPES, type BreakType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Micro break: a brief button-less pause - two breathe cycles, then back. */
const MICRO_HOLD_MS = 8_000;

/** Consolidation feeling chips - qualitative, multi-select, never scored. */
const FEELINGS = [
  "Focused",
  "Curious",
  "Calm",
  "Tired",
  "A bit lost",
  "Restless",
] as const;

/**
 * Break module (screen 18 - frame `18 Break Module & Completion`). Four break
 * types, no countdowns, all rendered as calm full screens over the lesson:
 *
 * - **micro** - a breathing beat ("Take a breath"), the one button-less screen:
 *   it holds for two breathe cycles and returns on its own.
 * - **movement** - a stretch prompt with a quiet violet ring (no timer) and an
 *   "I'm done" commit.
 * - **consolidation** - the feeling check-in: "How are you feeling right now?"
 *   with multi-select chips and no wrong answer (the touch-first audit retired
 *   the reflection textarea - a non-text choice, so no keyboard involved).
 * - **full** - a proper rest ("We'll be right here when you're ready") ended by
 *   "I'm back".
 *
 * Break decisions are confirmed server-side (FE Architecture §5); this renders
 * whatever type it is handed. `onStart`/`onEnd`/`onFeelings` are the signal
 * seams - a break brackets its own time so stillness inside it is read as break
 * time, never hesitation.
 */
export function BreakScreen({
  type,
  onDone,
  onStart,
  onEnd,
  onFeelings,
}: {
  type: BreakType;
  /** The break is over - resume whatever the player was about to do. */
  onDone: () => void;
  /** Emits `break_start` - fired once on mount. */
  onStart?: () => void;
  /** Emits `break_end` with the time actually taken. */
  onEnd?: (durationMs: number) => void;
  /** Emits `feeling_checkin` (consolidation only, on Continue). */
  onFeelings?: (feelings: string[]) => void;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  // Stamped in the mount effect (render must stay pure).
  const startedAt = useRef(0);
  const started = useRef(false);
  const onStartRef = useRef(onStart);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onStartRef.current = onStart;
    onDoneRef.current = onDone;
  }, [onStart, onDone]);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard
    started.current = true;
    // Monotonic (rule 4): the break's length is sent to the engine.
    startedAt.current = performance.now();
    onStartRef.current?.();
  }, []);

  const finish = () => {
    onEnd?.(Math.max(0, Math.round(performance.now() - startedAt.current)));
    onDone();
  };

  // The micro break is the one screen without a commit tap: a fixed brief
  // pause (no countdown shown) that hands the lesson back by itself.
  useEffect(() => {
    if (type !== BREAK_TYPES.MICRO) return;
    const t = setTimeout(() => {
      onEnd?.(Math.max(0, Math.round(performance.now() - startedAt.current)));
      onDoneRef.current();
    }, MICRO_HOLD_MS);
    return () => clearTimeout(t);
    // Mount-scoped hold; the emit refs stay current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const toggleFeeling = (f: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const actionClass =
    "flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-base font-medium text-nevo-cream transition-[filter,transform] hover:brightness-106 active:scale-[0.98]";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
      {type === BREAK_TYPES.MICRO && (
        <>
          <IllustrationWrapper
            src="/illustrations/break-micro.png"
            alt="A figure sitting calmly with eyes closed"
            width={1254}
            height={1254}
            priority
            motion="breathe"
            className="w-[200px] sm:w-[250px]"
          />
          <h2 className="mt-8 text-xl font-medium sm:mt-9 sm:text-2xl">
            Take a breath
          </h2>
        </>
      )}

      {type === BREAK_TYPES.MOVEMENT && (
        <>
          <IllustrationWrapper
            src="/illustrations/break-movement.png"
            alt="A figure stretching arms overhead"
            width={1024}
            height={1536}
            priority
            className="h-[250px] w-auto sm:h-[300px]"
          />
          <p className="mt-7 max-w-[280px] text-base leading-[1.5] sm:mt-9 sm:max-w-[360px] sm:text-[17px]">
            Stand up and stretch your arms up high, then reach for your toes.
          </p>
          {/* A quiet "take your time" ring - deliberately not a countdown. */}
          <span
            aria-hidden
            className="mt-5 block size-11 rounded-full border-[3px] border-nevo-violet/35 border-t-nevo-violet sm:mt-6 sm:size-12"
          />
          <button
            type="button"
            onClick={finish}
            className={cn(actionClass, "mt-7 max-w-[290px] sm:max-w-[340px]")}
          >
            I&apos;m done
          </button>
        </>
      )}

      {type === BREAK_TYPES.CONSOLIDATION && (
        <>
          <IllustrationWrapper
            src="/illustrations/break-consolidation.png"
            alt="A figure thinking, hand resting on chin"
            width={1024}
            height={1536}
            priority
            className="mb-6 h-[150px] w-auto sm:mb-7 sm:h-[190px]"
          />
          <h2 className="max-w-[300px] text-xl leading-[1.4] font-medium sm:max-w-[440px] sm:text-2xl">
            How are you feeling right now?
          </h2>
          <span className="mt-2.5 text-[13px] text-nevo-near-black/55 sm:text-sm">
            Tap any that fit - there&apos;s no wrong answer.
          </span>
          <div className="mt-4 flex max-w-[300px] flex-wrap justify-center gap-2.5 sm:max-w-[460px] sm:gap-3">
            {FEELINGS.map((f) => {
              const on = chosen.has(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFeeling(f)}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center rounded-full border-[1.5px] px-[18px] text-[15px] transition-colors sm:px-5 sm:text-base",
                    on
                      ? "border-nevo-navy bg-nevo-navy font-medium text-nevo-cream"
                      : "border-nevo-near-black/16 bg-nevo-cream-elevated font-normal text-nevo-near-black hover:border-nevo-near-black/30",
                  )}
                >
                  {f}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onFeelings?.([...chosen]);
              finish();
            }}
            className={cn(actionClass, "mt-6 max-w-[300px] sm:max-w-[440px]")}
          >
            Continue
          </button>
        </>
      )}

      {type === BREAK_TYPES.FULL && (
        <>
          <IllustrationWrapper
            src="/illustrations/break-full.png"
            alt="A figure lying down resting"
            width={1536}
            height={1024}
            priority
            className="w-[280px] sm:w-[340px]"
          />
          <p className="mt-8 max-w-[280px] text-base leading-[1.55] sm:mt-9 sm:max-w-[380px] sm:text-[17px]">
            Go and take a proper rest. Have a drink of water. We&apos;ll be
            right here when you&apos;re ready.
          </p>
          <button
            type="button"
            onClick={finish}
            className={cn(actionClass, "mt-7 max-w-[290px] sm:max-w-[340px]")}
          >
            I&apos;m back
          </button>
        </>
      )}
    </div>
  );
}
