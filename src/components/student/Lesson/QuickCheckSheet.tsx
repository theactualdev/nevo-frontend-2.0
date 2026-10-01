"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/shared";
import type { QuickCheck } from "@/lib/types";
import { AnswerCheck, AnswerDot, AnswerOption } from "./AnswerOption";

/** Whole milliseconds since a monotonic reading, or null without one. */
function msSince(start: number | null): number | null {
  return start === null
    ? null
    : Math.max(0, Math.round(performance.now() - start));
}

/**
 * Inline comprehension check (Lesson Check frame) — a bottom sheet on mobile,
 * a centred card on tablet/desktop, over the dimmed player. Feedback is warm
 * and system-owned: a correct pick is affirmed plainly (navy) and "Keep going"
 * advances; a miss is marked softly in violet — never red — and offers "Try
 * again" plus "See it explained" (back to the segment). The check is only
 * spent by a correct answer.
 *
 * Mount keyed on the segment id so the chosen answer resets per segment.
 */
export function QuickCheckSheet({
  check,
  open,
  onOpenChange,
  onAnswered,
  onContinue,
}: {
  check: QuickCheck;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fired per attempt, the moment an option is picked - with what was picked
   * and how long the question had been in front of the child (rule 4).
   */
  onAnswered: (
    correct: boolean,
    answered: { selectedId: string; responseTimeMs?: number },
  ) => void;
  /** "Keep going" after a correct answer — close the sheet and advance. */
  onContinue: () => void;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const resolved = chosenId !== null;
  const correct = chosenId === check.correctId;

  // When the question was last put in front of the child: on opening, and
  // again on "Try again".
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    if (open && chosenId === null) askedAt.current = performance.now();
  }, [open, chosenId]);

  const choose = (id: string) => {
    if (resolved) return;
    setChosenId(id);
    const responseTimeMs = msSince(askedAt.current);
    onAnswered(id === check.correctId, {
      selectedId: id,
      ...(responseTimeMs === null ? {} : { responseTimeMs }),
    });
  };

  const tone = (id: string) => {
    if (!resolved) return "idle";
    if (id !== chosenId) return "muted";
    return correct ? "navy" : "violet";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        // The `!` marks out-shout the stock data-[side=bottom] variants (class +
        // attribute selectors), which otherwise beat these breakpoint overrides
        // and leave the panel pinned to the bottom-left while the centering
        // translate still applies.
        className="gap-0 rounded-t-[20px] border-0! bg-nevo-cream px-6 pt-3 pb-7 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[560px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:px-8 sm:py-7 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)] lg:w-[600px] lg:px-10"
      >
        {/* Drag handle — sheet form only */}
        <div className="mx-auto mb-[18px] h-1 w-8 rounded-full bg-nevo-near-black/30 sm:hidden" />

        <p className="font-mono text-[11px] tracking-[0.08em] text-nevo-navy uppercase">
          Quick check
        </p>
        <SheetTitle className="mt-3 text-[19px] leading-[1.35] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[21px]">
          {check.question}
        </SheetTitle>

        <div className="mt-[18px] flex flex-col gap-2.5">
          {check.options.map((option) => (
            <AnswerOption
              key={option.id}
              label={option.label}
              tone={tone(option.id)}
              trailing={
                resolved && option.id === chosenId ? (
                  correct ? (
                    <AnswerCheck />
                  ) : (
                    <AnswerDot />
                  )
                ) : undefined
              }
              onSelect={() => choose(option.id)}
            />
          ))}
        </div>

        {/* Result note — plain text, lands instantly (results never animate) */}
        {resolved && (
          <p
            role="status"
            className={
              correct
                ? "mt-4 text-[15px] leading-[1.5] font-medium text-nevo-navy"
                : // The note after a WRONG answer. Violet at 2.34:1 made the
                  // one sentence a struggling child most needs the hardest to
                  // read; the correct note beside it is navy at 8.8:1.
                  "mt-4 text-[15px] leading-[1.5] font-medium text-nevo-violet-text"
            }
          >
            {correct ? check.correctNote : check.recoveryNote}
          </p>
        )}

        {resolved &&
          (correct ? (
            <Button className="mt-5 w-full" onClick={onContinue}>
              Keep going
            </Button>
          ) : (
            <>
              <Button className="mt-5 w-full" onClick={() => setChosenId(null)}>
                Try again
              </Button>
              <Button
                variant="ghost"
                className="mt-2 h-[46px] w-full text-[15px]"
                onClick={() => onOpenChange(false)}
              >
                See it explained
              </Button>
            </>
          ))}
      </SheetContent>
    </Sheet>
  );
}
