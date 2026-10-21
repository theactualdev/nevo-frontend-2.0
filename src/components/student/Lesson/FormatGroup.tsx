"use client";

import { MODALITY, type Modality } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * What a child calls each format (frame 17 C2b, 21 Oct). The canonical
 * values stay text, audio, visual and interactive; "UI labels can say
 * Picture and Activity" (Teslim's handoff §5).
 */
export const FORMAT_LABEL: Record<Modality, string> = {
  [MODALITY.TEXT]: "Text",
  [MODALITY.AUDIO]: "Audio",
  [MODALITY.VISUAL]: "Picture",
  [MODALITY.INTERACTIVE]: "Activity",
};

/**
 * The format group (Nevo Lesson Player Frame, 51b9e2a; SCRUM-272): the
 * section's formats as one pill row, above Simplify / Expand / Slower in the
 * same control column, because that is already where a child goes to change
 * how something reaches them.
 *
 * ONLY WHAT THE SERVER SAYS IS THERE, in its order ("authored opening order
 * is preserved among available formats"), and never a greyed-out pill: a
 * format a section does not have is simply not in `formats`. The caller
 * draws no group at all for fewer than two.
 *
 * THE CURRENT FORMAT IS THE NAVY PILL, and is never announced in words.
 *
 * THE RECOMMENDED FORMAT CARRIES A QUIET MARKER, AND ONLY WHERE IT DIFFERS
 * FROM THE CURRENT ONE (Lydia, SCRUM-271 amended, 21 Oct - her second
 * message wins): a soft-violet pill with the spark after its label. It is
 * not a second filled state. When the recommendation is the current format
 * the navy pill is both, with no second emphasis; with no recommendation
 * there is no marker anywhere. It follows `recommended` and nothing else -
 * not whether the child took it - so a child who picks against it sees both
 * stay where they are, and neither reads as a correction.
 *
 * THE MARKER NEVER EXPLAINS ITSELF: no tooltip, no visible words, and no
 * accessible text either - the spark is decorative and hidden, and each
 * button is named by its format alone. Nor does it animate, pulse or
 * escalate. It is a glyph inside a pill under the title, unlike the support
 * dots in every way the frame draws them - shape, colour and place - so the
 * two never read as one kind of thing (Lydia's second check).
 *
 * The pills are the depth chips' own (`AdaptiveToggleBar`): 44px tall, 16px
 * either side, 13px medium text, 8px apart on the same quiet track.
 */
export function FormatGroup({
  formats,
  current,
  recommended,
  onPick,
  busy = false,
}: {
  formats: readonly Modality[];
  /** The pill that reads selected: the format on screen, or the one being switched to. */
  current: Modality;
  /** The server's `recommendedFormat` for this section, or null for none. */
  recommended: Modality | null;
  onPick: (format: Modality) => void;
  /** A switch is on its way (the frame's "One moment"). */
  busy?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Lesson format"
      aria-busy={busy || undefined}
      className="inline-flex flex-wrap items-center justify-end gap-2 rounded-full bg-nevo-near-black/6 p-1"
    >
      {formats.map((format) => {
        const isCurrent = format === current;
        const marked = recommended !== null && format === recommended && !isCurrent;
        return (
          <button
            key={format}
            type="button"
            // Named on the button itself, as #837 named the probe's options:
            // the spark beside the label is never part of the name.
            aria-label={FORMAT_LABEL[format]}
            aria-pressed={isCurrent}
            data-recommended={marked || undefined}
            onClick={() => onPick(format)}
            // NO TRANSITION (the 21 Oct brief: the marker "never animates"). A
            // colour fade moved the lavender fill over 150ms whenever the
            // recommendation or the current pill changed - the on-screen
            // check of 21 Oct caught it. Changes land at once.
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center rounded-full px-4 text-[13px] font-medium whitespace-nowrap",
              isCurrent && "bg-nevo-navy text-nevo-cream",
              marked && "bg-nevo-violet/50 text-nevo-near-black",
              !isCurrent &&
                !marked &&
                "bg-transparent text-nevo-near-black hover:bg-nevo-navy/6",
            )}
          >
            {FORMAT_LABEL[format]}
            {marked && <Spark />}
          </button>
        );
      })}
    </div>
  );
}

/** The frame's 14px spark, navy, after the label. Decorative. */
function Spark() {
  return (
    <span aria-hidden="true" className="ml-[7px] inline-flex shrink-0">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        className="fill-nevo-navy"
        focusable="false"
      >
        <path d="M12 1.5l1.7 6.8L20.5 10l-6.8 1.7L12 18.5l-1.7-6.8L3.5 10l6.8-1.7z" />
      </svg>
    </span>
  );
}
