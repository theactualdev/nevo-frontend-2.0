import {
  SCAFFOLD_FILLED,
  SCAFFOLD_LEVELS,
  type ScaffoldLevel,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Global scaffold indicator (37a, Intelligence Layer). Sits top-right of the
 * lesson player, opposite the exit: four small circles showing how much
 * support the system is quietly giving. It is a signal the system generates,
 * not a difficulty the student picks - no numbers, no percentages, no learner
 * "type".
 *
 * THE DOTS AND NOTHING ELSE, since design's 1 Oct ruling (D27): "The
 * architecture wins. No label, no pulse, no tooltip, no tap popover." It used
 * to carry the word "Support", a tap popover explaining what the dots mean,
 * and a glow when the step-up arrived - copied from the frames, which change
 * too. Frontend §4: "No animation on change. No sound. No tooltip. No label",
 * and "there is no interaction on this component", so it is not a button
 * either. Nothing anywhere points the child back to it; the dots change
 * quietly and that is all they do.
 *
 * HIDDEN FROM ASSISTIVE TECH, for the same reason and the older Zero-Tag one.
 * It carried `aria-label={`Support level: ${level}`}` once, which announced an
 * engine parameter as a label about a child; after that its name was the word
 * "Support". A screen reader reading out the dots, in any words, is copy
 * pointing the child back to them, so there is no name to read. Raised with
 * design against WCAG 1.1.1, since a sighted child can see what a screen
 * reader user is not told.
 *
 * NULL IS THE NOTHING-STATE (rule 5). With no level there is no indicator; it
 * appears when the engine says something. The engine's own `none` is not
 * null: it is a level, drawn with no circle filled.
 */
export function ScaffoldIndicator({ level }: { level: ScaffoldLevel | null }) {
  if (level === null || level === SCAFFOLD_LEVELS.OFF) return null;
  const filled = SCAFFOLD_FILLED[level];

  return (
    <span
      aria-hidden="true"
      data-scaffold-indicator=""
      className="flex h-[26px] shrink-0 items-center gap-[5px] rounded-2xl bg-nevo-near-black/6 px-[11px]"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-[7px] rounded-full",
            i < filled ? "bg-nevo-navy" : "border-[1.5px] border-nevo-navy/30",
          )}
        />
      ))}
    </span>
  );
}
