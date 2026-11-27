"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Leaf } from "lucide-react";
import { IllustrationWrapper } from "@/components/shared";
import { BREAK_PICTURES } from "@/components/shared/breakPictures";
import { BREAK_TYPES, type BreakType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * A BREAK'S PICTURE THAT WILL NOT LOAD: ASKED FOR AGAIN, THEN THE TILE (Lydia,
 * 4 Nov: "reuse the lesson picture's behaviour, retry and then the tile").
 * It was left out, so the break's words stood alone where its picture had
 * been. Now it is asked for once more - its own address, so nothing to
 * re-issue, just a fresh request - and if that fails too, the lesson
 * picture's quiet tile takes its place (`VisualSegment`): cream-elevated,
 * the leaf, at the picture's own size, so nothing on the screen moves.
 */
function BreakArt({
  className,
  width,
  height,
  ...art
}: Omit<ComponentProps<typeof IllustrationWrapper>, "onError">) {
  const [tries, setTries] = useState(0);
  if (tries > 1) {
    return (
      <div
        data-break-tile
        style={{ aspectRatio: `${width} / ${height}` }}
        className={cn(
          className,
          "flex items-center justify-center rounded-[12px] bg-nevo-cream-elevated",
        )}
      >
        <Leaf
          aria-hidden
          className="size-[46px] text-nevo-violet"
          strokeWidth={1.6}
        />
      </div>
    );
  }
  return (
    <IllustrationWrapper
      key={tries}
      {...art}
      width={width}
      height={height}
      className={className}
      onError={() => setTries((t) => t + 1)}
    />
  );
}

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
  // A picture that will not load - a break taken offline - is left out,
  // never drawn as a broken box with its alt text in it.
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
    <div className="flex min-h-[calc(100dvh/var(--nevo-text-zoom,1))] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
      {type === BREAK_TYPES.MICRO && (
        <>
          <BreakArt
            {...BREAK_PICTURES.micro}
            alt="A figure sitting calmly with eyes closed"
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
          <BreakArt
            {...BREAK_PICTURES.movement}
            alt="A figure stretching arms overhead"
            priority
            className="h-[250px] w-auto sm:h-[300px] md:h-[320px] xl:h-[280px]"
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
          <BreakArt
            {...BREAK_PICTURES.consolidation}
            alt="A figure thinking, hand resting on chin"
            priority
            className="mb-6 h-[150px] w-auto sm:mb-7 sm:h-[190px] md:h-[200px] xl:h-[170px]"
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
          <BreakArt
            {...BREAK_PICTURES.full}
            alt="A figure lying down resting"
            priority
            className="w-[280px] sm:w-[340px] md:w-[360px] xl:w-[330px]"
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

/** The two kinds 18b takes in place; movement and full keep frame 18's screen. */
export function breakTakenInPlace(type: BreakType | null | undefined): boolean {
  return type === BREAK_TYPES.MICRO || type === BREAK_TYPES.CONSOLIDATION;
}

/**
 * THE MICRO AND CONSOLIDATION BREAKS, TAKEN IN PLACE (18b; Lydia, 25 Nov,
 * L12, and 26 Oct: "micro and consolidation in place, movement and full take
 * the screen"). A filled card in the reading column, beneath the segment: the
 * top bar, the progress and the segment stay on screen and the segment is
 * left exactly as it was - not dimmed, not a sheet, not a dialog. The
 * picture, the lines and the chips are the break module's own.
 *
 * - ONE CONTROL ENDS THE REST (18b): "Keep going" for the micro break,
 *   "Continue" for the consolidation one. So the micro break no longer ends
 *   itself after its hold, as the takeover's does: the card is the child's to
 *   close, and nothing on it times the rest.
 * - No countdown, no timer, and nothing said about saving (D208).
 * - The same signal seams as the takeover: its start on mount, its length on
 *   the way out, the feelings on Continue.
 *
 * Focus comes to the card as it opens, which also brings it into view on a
 * long segment: a child who did not see it could not end it.
 */
export function InPlaceBreak({
  type,
  onDone,
  onStart,
  onEnd,
  onFeelings,
}: {
  /** Any kind; only micro and consolidation are drawn (rule 5 for the rest). */
  type: BreakType;
  onDone: () => void;
  onStart?: () => void;
  onEnd?: (durationMs: number) => void;
  onFeelings?: (feelings: string[]) => void;
}) {
  const titleId = useId();
  const card = useRef<HTMLElement>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const startedAt = useRef(0);
  const started = useRef(false);
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard
    started.current = true;
    // Monotonic (rule 4): the break's length is sent to the engine.
    startedAt.current = performance.now();
    onStartRef.current?.();
    card.current?.scrollIntoView?.({ block: "nearest" });
    card.current?.focus({ preventScroll: true });
  }, []);

  const finish = () => {
    if (type === BREAK_TYPES.CONSOLIDATION) onFeelings?.([...chosen]);
    onEnd?.(Math.max(0, Math.round(performance.now() - startedAt.current)));
    onDone();
  };

  if (!breakTakenInPlace(type)) return null;
  const micro = type === BREAK_TYPES.MICRO;
  return (
    <section
      ref={card}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-break-in-place={type}
      className="mt-[22px] flex flex-col items-center rounded-[12px] bg-nevo-cream-elevated px-5 py-6 text-center text-nevo-near-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 md:mt-[26px] md:px-7 md:py-[30px]"
    >
      {micro ? (
        <>
          <BreakArt
            {...BREAK_PICTURES.micro}
            alt="A figure sitting calmly with eyes closed"
            motion="breathe"
            className="w-[132px] md:w-[170px] xl:w-[150px]"
          />
          <h2
            id={titleId}
            className="mt-5 text-[19px] font-medium md:mt-6 md:text-[21px] xl:mt-[22px]"
          >
            Take a breath
          </h2>
        </>
      ) : (
        <>
          <BreakArt
            {...BREAK_PICTURES.consolidation}
            alt="A figure thinking, hand resting on chin"
            className="h-[104px] w-auto md:h-[130px] xl:h-[118px]"
          />
          <h2
            id={titleId}
            className="mt-5 max-w-[320px] text-[19px] leading-[1.4] font-medium md:mt-6 md:text-[21px] xl:mt-[22px]"
          >
            How are you feeling right now?
          </h2>
          <span className="mt-2.5 text-[13px] text-nevo-near-black/55">
            Tap any that fit - there&apos;s no wrong answer.
          </span>
          <div className="mt-4 flex max-w-[300px] flex-wrap justify-center gap-2.5 md:max-w-[420px] xl:max-w-[480px]">
            {FEELINGS.map((f) => {
              const on = chosen.has(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setChosen((prev) => {
                      const next = new Set(prev);
                      if (next.has(f)) next.delete(f);
                      else next.add(f);
                      return next;
                    })
                  }
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center rounded-full border-[1.5px] px-[18px] text-[15px] transition-transform active:scale-[0.98]",
                    on
                      ? "border-nevo-navy bg-nevo-navy font-medium text-nevo-cream"
                      : "border-nevo-near-black/16 bg-nevo-cream font-normal text-nevo-near-black",
                  )}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={finish}
        className="mt-[22px] flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-base font-medium text-nevo-cream transition-transform active:scale-[0.99] md:mt-[26px] md:max-w-[320px] xl:mt-6"
      >
        {micro ? "Keep going" : "Continue"}
      </button>
    </section>
  );
}
