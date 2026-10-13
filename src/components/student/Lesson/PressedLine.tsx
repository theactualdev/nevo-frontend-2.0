import { cn } from "@/lib/utils";
import { READING_BODY, READING_INK } from "./readingSupport";

/**
 * Play or Listen pressed on a recording that did not load (Lydia, D211):
 * the lesson's recording, a spoken question's, a calculation step's.
 */
export const NO_SOUND = "The sound didn't load. Try again in a moment.";

/** Next pressed while a calculation step is still unsolved (Lydia, D211). */
export const ONE_MORE_BIT = "There's one more bit to do first.";

/**
 * PRESSABLE, NOT DISABLED (design's reference; Lydia, D211, 13 Oct). A
 * control that cannot act yet is not greyed out: it stays pressable, and
 * pressing it says why in one line, in place, inside the same card - the
 * reference's violet-tinted panel, `rgba(154,156,203,0.14)` at radius 10
 * with 13-15px of padding. Never a modal. The line is the ruling's own, and
 * the caller's to give.
 */
export function PressedLine({
  children,
  reading = false,
  className,
}: {
  children: string;
  /** The reading accommodation's typographic half (D30). */
  reading?: boolean;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-[10px] bg-nevo-violet/14 px-3.5 py-[13px] text-sm leading-[1.5] text-nevo-near-black",
        reading && [READING_BODY, READING_INK],
        className,
      )}
    >
      {children}
    </p>
  );
}
