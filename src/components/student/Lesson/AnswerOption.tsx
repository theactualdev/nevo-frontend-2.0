"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { READING_BODY, READING_INK } from "./readingSupport";

/**
 * Visual state of an answer card (Lesson Check frame). Resolution follows the
 * DS philosophy: navy border marks the confirmed/right pick, violet marks a
 * miss softly — never red, never an alarm — and the rest quiet down to muted.
 */
export type AnswerTone = "idle" | "navy" | "violet" | "muted";

/** One answer card, shared by the Quick Check and the after-lesson assessment. */
export function AnswerOption({
  label,
  tone,
  trailing,
  onSelect,
  reading = false,
  className,
}: {
  label: string;
  tone: AnswerTone;
  /** Right-edge marker (check badge, violet dot, radio) — supplied by the parent. */
  trailing?: React.ReactNode;
  /** Tap handler; the card is only tappable while `tone` is "idle". */
  onSelect?: () => void;
  /**
   * The reading accommodation's typographic half (D30) - see
   * `readingSupport`. A muted answer keeps its quieter ink.
   */
  reading?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={tone !== "idle"}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-[12px] border-2 px-[18px] py-[15px] text-left text-base sm:text-[17px]",
        tone === "idle" &&
          "cursor-pointer border-transparent bg-nevo-cream-elevated font-medium text-nevo-near-black shadow-elevation-1 transition-transform active:scale-[0.98]",
        tone === "navy" &&
          "border-nevo-navy bg-nevo-cream-elevated font-semibold text-nevo-near-black shadow-elevation-1",
        tone === "violet" &&
          "border-nevo-violet bg-nevo-cream-elevated font-semibold text-nevo-near-black shadow-elevation-1",
        tone === "muted" &&
          "border-transparent bg-nevo-cream-elevated font-medium text-nevo-near-black/50",
        className,
      )}
    >
      <span
        className={cn(
          reading && READING_BODY,
          reading && tone !== "muted" && READING_INK,
        )}
      >
        {label}
      </span>
      {trailing}
    </button>
  );
}

/** Navy check badge — marks the right answer once confirmed. */
export function AnswerCheck() {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-nevo-navy">
      <Check className="size-[13px] text-nevo-cream" strokeWidth={2.8} />
    </span>
  );
}

/** Small violet dot — marks the picked answer on a miss, without alarm. */
export function AnswerDot() {
  return <span className="size-2 shrink-0 rounded-full bg-nevo-violet" />;
}

/** Radio marker for the assessment's select-then-confirm flow. */
export function AnswerRadio({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-nevo-navy">
      <span className="size-2.5 rounded-full bg-nevo-navy" />
    </span>
  ) : (
    <span className="size-5 shrink-0 rounded-full border-2 border-nevo-near-black/25" />
  );
}
