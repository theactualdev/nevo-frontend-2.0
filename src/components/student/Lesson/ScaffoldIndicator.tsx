"use client";

import { useState } from "react";
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
 * "type". Level changes cross-fade in 400ms; the circles just update, the
 * label never animates.
 *
 * Tapping it opens a small reassurance popover (player frame copy) - the one
 * interaction it has, and it changes nothing.
 *
 * ZERO-TAG APPLIES TO THE ACCESSIBLE NAME TOO. This carried
 * `aria-label={`Support level: ${level}`}`, where `level` is the raw value off
 * the adaptation plan - so a screen reader announced "Support level: full"
 * while the visual deliberately says nothing but the word "Support". That is
 * an engine parameter rendered as a label about a child, to exactly the users
 * the SEND framing exists to protect, and a Zero-Tag review that reads only
 * rendered text walks straight past it. The button's name is now its visible
 * text, and the dots are `aria-hidden` because the dots ARE the level.
 *
 * NULL IS THE NOTHING-STATE (rule 5). The player passed "light" when the
 * engine had sent no level, so a child was shown two filled circles and told
 * "Nevo sets it for you" about support nothing had set. With no level there is
 * no indicator; it appears when the engine says something.
 */
export function ScaffoldIndicator({
  level,
  pulse = false,
}: {
  level: ScaffoldLevel | null;
  /** One glow cycle on mount (37b: boredom pulses the indicator once). */
  pulse?: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  if (level === null || level === SCAFFOLD_LEVELS.OFF) return null;
  const filled = SCAFFOLD_FILLED[level];

  return (
    <div className="relative shrink-0">
      {/* 44px to touch around the frame's 26px pill: the button is the hit
          area, the inner span is what is drawn. */}
      <button
        type="button"
        aria-expanded={infoOpen}
        onClick={() => setInfoOpen((o) => !o)}
        className="group flex h-11 cursor-pointer items-center"
      >
        <span
          className={cn(
            "flex h-[26px] items-center gap-2 rounded-2xl bg-nevo-near-black/6 px-[11px] transition-transform group-active:scale-[0.98]",
            pulse && "motion-safe:animate-nevo-glow",
          )}
        >
          {/* Decorative: the dots ARE the level, and the level is an engine
              parameter. Hidden from assistive tech so the accessible name is the
              visible word "Support" and nothing more. */}
          <span aria-hidden="true" className="flex gap-[5px]">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-[7px] rounded-full transition-colors duration-[400ms]",
                  i < filled
                    ? "bg-nevo-navy"
                    : "border-[1.5px] border-nevo-navy/30",
                )}
              />
            ))}
          </span>
          <span className="text-[11px] whitespace-nowrap text-nevo-near-black/55">
            Support
          </span>
        </span>
      </button>
      {infoOpen && (
        <div
          role="note"
          // The frame's 10px under the pill: 9px of hit area above it, 26px
          // of pill, then the gap.
          className="absolute top-[45px] right-0 z-20 w-[232px] rounded-[10px] bg-nevo-cream-elevated px-3.5 py-3 text-left text-[12.5px] leading-[1.5] text-nevo-near-black shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
        >
          Support shows how much help this lesson is giving you right now. Nevo
          sets it for you - it&apos;s nothing you need to change.
        </div>
      )}
    </div>
  );
}
