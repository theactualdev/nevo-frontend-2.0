import { cn } from "@/lib/utils";

/**
 * Nevo linear progress line (Design System v2 §6). 3px, violet fill on a faint
 * navy track — used beneath the Lesson Player top bar and in onboarding steps.
 *
 * IT SPEAKS WORDS, NEVER A PERCENTAGE. `aria-valuenow` alone, on a 0-100
 * range, is read aloud as "40 percent" - a number on a child's progress, which
 * rule 9 forbids on screen and is no better in a child's ear. `aria-valuetext`
 * is what a screen reader speaks instead of the number, so the bar says the
 * position it is drawn from ("Segment 3 of 8", "Step 2 of 5"). That is the
 * label every caller already passes, so it is the default.
 *
 * With no words to speak, the value is left off entirely rather than falling
 * back to the number.
 *
 * THE LESSON PLAYER'S OWN TRACK (`lesson`): its frame draws the line on a
 * near-black track at 10%, with square ends on the track and the fill (frame
 * d6b9fbc, measured in its source on the 22 Oct on-screen check). Every other
 * caller keeps the rounded line on a faint navy track, from the onboarding
 * design reference it was set to (16 Jul).
 */
export function ProgressBar({
  value,
  className,
  "aria-label": ariaLabel,
  valueText,
  lesson = false,
}: {
  /** 0–1 fraction complete. */
  value: number;
  className?: string;
  "aria-label"?: string;
  /** What a screen reader says for the value. Defaults to the label. */
  valueText?: string;
  /** The Lesson Player frame's track: near-black at 10%, square ends. */
  lesson?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const spoken = valueText ?? ariaLabel;
  return (
    <div
      className={cn(
        "h-[3px] w-full overflow-hidden",
        lesson ? "bg-nevo-near-black/10" : "rounded-full bg-nevo-navy/12",
        className,
      )}
      role="progressbar"
      aria-label={ariaLabel}
      {...(spoken
        ? {
            "aria-valuetext": spoken,
            "aria-valuenow": Math.round(pct),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
          }
        : {})}
    >
      <div
        className={cn(
          "h-full bg-nevo-violet transition-[width] duration-300 ease-out",
          !lesson && "rounded-full",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
