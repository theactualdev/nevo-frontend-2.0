"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgeBand } from "@/lib/profiling/bands";
import type { BaselineCapture } from "@/lib/profiling/capture";
import { AvatarBubble, ProfilingShell } from "./ProfilingShell";
import { SettleBadge } from "./GridSpanModule";
import { useTrialRunner } from "./useTrialRunner";

/**
 * Module 2 - Pattern Match + Arrow Flanker (BP-M2: processing speed and
 * attention). 2A: two icons, tap Same or Different as fast as feels right.
 * 2B: tap the direction of the CENTRE arrow, ignoring the flankers. No timer,
 * no score, no right/wrong - a tapped control presses soft-violet and the next
 * trial loads. Icons are navy shapes only (the four-colour system forbids other
 * hues; pairs differ by shape, never colour); the SS band's flankers go violet
 * to sharpen the interference.
 */

/** Band icon pairs for 2A (frame's sets, navy with cream detail). */
const PAIR_ICONS: Record<AgeBand, [string, string]> = {
  p13: [
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 21.4l1.5-6.8L2.2 9l6.9-.7z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 12c4-6 12-6 16 0-4 6-12 6-16 0z"/><path d="M18 12l4-3v6z"/><circle cx="7" cy="11" r="1.3" fill="#f7f1e6"/></svg>',
  ],
  p46: [
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 16H3z"/></svg>',
  ],
  jss: [
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 12l6-6M8 16l8-8M12 18l6-6" stroke="currentColor" stroke-width="1.2"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M12 3l9 16H3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="14.5" r="1" fill="currentColor"/><circle cx="14" cy="14.5" r="1" fill="currentColor"/></svg>',
  ],
  ss: [
    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 12h8M13 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 12H8M11 9l-3 3 3 3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="7" r="1.2" fill="currentColor"/></svg>',
  ],
};

/** 2A trial script (same/different), 2B trial script (flanker congruency). */
const PATTERN_TRIALS: { same: boolean }[] = [
  { same: false },
  { same: true },
  { same: false },
];

/**
 * 2B trials, each carrying the direction the CENTRE arrow points.
 *
 * It used to carry only congruency, and the centre arrow was a plain
 * `<ArrowRight>` that nothing ever rotated - so "Right" was the answer on every
 * trial of every run. A child who noticed that could stop looking after the
 * first one and tap Right twice more, which is precisely the attention the task
 * exists to measure. A flanker task with a fixed target measures nothing.
 *
 * PER BAND, because the frame draws four different tasks. It was one list for
 * everyone, so JSS and SS never saw the neutral trial their frame draws, and
 * P1-3 - shown the centre arrow alone - had "incongruent" written against
 * trials that had no flankers to be incongruent with. Sources:
 *  - P1-3: `09b` BP-P13-M2B "single central arrow, no flankers". There is no
 *    congruency, so none is recorded (`null`); three trials, the count every
 *    band runs (11:175).
 *  - P4-6: the prototype's own list, 11:180 - congruent, incongruent,
 *    incongruent - matching `09b`'s congruent / incongruent states.
 *  - JSS, SS: `09b`'s `flAdv` states, in its order - congruent, incongruent,
 *    neutral ("flankers add up/down directional interference").
 * The target sequence (right, left, right) is the one already shipped; no
 * frame states one, and the frames' arrows only ever point right.
 */
export type FlankerTrial = {
  congruency: "congruent" | "incongruent" | "neutral" | null;
  target: "left" | "right";
};
const FLANKER_TRIALS: Record<AgeBand, FlankerTrial[]> = {
  p13: [
    { congruency: null, target: "right" },
    { congruency: null, target: "left" },
    { congruency: null, target: "right" },
  ],
  p46: [
    { congruency: "congruent", target: "right" },
    { congruency: "incongruent", target: "left" },
    { congruency: "incongruent", target: "right" },
  ],
  jss: [
    { congruency: "congruent", target: "right" },
    { congruency: "incongruent", target: "left" },
    { congruency: "neutral", target: "right" },
  ],
  ss: [
    { congruency: "congruent", target: "right" },
    { congruency: "incongruent", target: "left" },
    { congruency: "neutral", target: "right" },
  ],
};

/**
 * Per-band sizes, which were 180px cards, 56px buttons and a 50px arrow for
 * every band. Tablet-up values are the frames', exact; the phone values are
 * derived the way the frames derive them.
 *
 *  - 2A, `Nevo Pattern Match Frame` `sets()`: card 200 / 180 / 160 / 140,
 *    icon 120 / 100 / 84 / 82, button height 64 / 56 / 56 / 56, buttons as
 *    wide as the card. On a phone every card is 300x150 with 300-wide
 *    buttons, and the icon is 72% of the band's.
 *  - 2B, `Nevo Flanker Frame` `renderVals()`: centre arrow 64 for P1-3 and 50
 *    otherwise, flankers 34, Left/Right 160x80 for P1-3 and 150x68 otherwise,
 *    their icon 38. On a phone all of it is x0.82 (the frame's `scale`) and
 *    the buttons are 300 wide.
 */
const SIZE: Record<
  AgeBand,
  { card: string; icon: string; button: string; arrow: string; arrowButton: string }
> = {
  p13: {
    card: "sm:size-[200px]",
    icon: "size-[86px] sm:size-[120px]",
    button: "h-16 sm:w-[200px] sm:text-lg",
    arrow: "size-[52px] sm:size-[64px]",
    arrowButton: "h-[66px] sm:h-20 sm:w-[160px]",
  },
  p46: {
    card: "sm:size-[180px]",
    icon: "size-[72px] sm:size-[100px]",
    button: "h-14 sm:w-[180px] sm:text-lg",
    arrow: "size-[41px] sm:size-[50px]",
    arrowButton: "h-14 sm:h-[68px] sm:w-[150px]",
  },
  jss: {
    card: "sm:size-[160px]",
    icon: "size-[60px] sm:size-[84px]",
    button: "h-14 sm:w-[160px] sm:text-lg",
    arrow: "size-[41px] sm:size-[50px]",
    arrowButton: "h-14 sm:h-[68px] sm:w-[150px]",
  },
  ss: {
    card: "sm:size-[140px]",
    icon: "size-[59px] sm:size-[82px]",
    button: "h-14 sm:w-[140px] sm:text-lg",
    arrow: "size-[41px] sm:size-[50px]",
    arrowButton: "h-14 sm:h-[68px] sm:w-[150px]",
  },
};

/**
 * How a band's flanker is drawn (`09b`): P1-3's centre arrow stands alone
 * ("single central arrow, no flankers"), and SS's flankers are violet
 * ("colour interference · violet flankers (Stroop-like)").
 */
function flankerLook(band: AgeBand): { alone: boolean; violet: boolean } {
  return { alone: band === "p13", violet: band === "ss" };
}

/**
 * Which way each arrow of a trial turns, in degrees from pointing right.
 * Congruent flankers point with the target, incongruent against it - which is
 * only meaningful now that the target itself moves. Neutral sits across both.
 */
export function flankerTurns(trial: FlankerTrial): {
  target: number;
  flank: number;
} {
  const target = trial.target === "left" ? 180 : 0;
  const flank =
    trial.congruency === "neutral"
      ? -90
      : trial.congruency === "incongruent"
        ? (target + 180) % 360
        : target;
  return { target, flank };
}

/**
 * The daily warm-up's pattern round for a band (D81, 6 Oct): this module's
 * first 2A trial, a different pair, in the band's own icons. The warm-up drew
 * one circle-and-square pair for every child, where 2A runs object icons for
 * P1-3 up to complex symbols for SS.
 */
export function warmUpPattern(band: AgeBand): {
  icons: [string, string];
  same: boolean;
} {
  return { icons: PAIR_ICONS[band] ?? PAIR_ICONS.p46, same: PATTERN_TRIALS[0].same };
}

/**
 * The daily warm-up's flanker round for a band (D81, 6 Oct), drawn the way
 * this module draws that band's: P1-3's arrow alone, SS's flankers violet, and
 * the band's own centre-arrow size.
 *
 * The trial is the warm-up frame's one - centre pointing right, flankers
 * against it - which is an incongruent trial every band with flankers runs
 * here. P1-3 has no flankers, so its trial carries no congruency, as its own
 * trials here do not.
 */
export function warmUpFlanker(band: AgeBand): {
  trial: FlankerTrial;
  alone: boolean;
  violet: boolean;
  arrow: string;
} {
  const look = flankerLook(band);
  return {
    trial: {
      congruency: look.alone ? null : "incongruent",
      target: "right",
    },
    ...look,
    arrow: (SIZE[band] ?? SIZE.p46).arrow,
  };
}

export function PatternFlankerModule({
  band,
  capture,
  onComplete,
}: {
  band: AgeBand;
  capture?: BaselineCapture;
  onComplete: () => void;
}) {
  const flankerTrials = FLANKER_TRIALS[band] ?? FLANKER_TRIALS.p46;
  const size = SIZE[band] ?? SIZE.p46;
  const { act, trial, picked, settling, pick } = useTrialRunner({
    module: "pattern_flanker",
    counts: [
      ["pattern", PATTERN_TRIALS.length],
      ["flanker", flankerTrials.length],
    ],
    capture,
    onComplete,
  });

  const icons = PAIR_ICONS[band] ?? PAIR_ICONS.p46;
  const patternTrial =
    PATTERN_TRIALS[Math.min(trial, PATTERN_TRIALS.length - 1)];
  const flankerTrial =
    flankerTrials[Math.min(trial, flankerTrials.length - 1)];
  const { target: targetRotate, flank: flankRotate } =
    flankerTurns(flankerTrial);
  // A P1-3 trial has no flankers, so it has no congruency to record.
  const congruency = flankerTrial.congruency
    ? { congruency: flankerTrial.congruency }
    : {};
  const { violet: flankViolet, alone: singleArrow } = flankerLook(band);

  return (
    <ProfilingShell filled={settling ? 2 : 1} active={settling ? -1 : 1}>
      {!settling && (
        <AvatarBubble
          text={
            act === "pattern"
              ? "Same, or different?"
              : "Which way is the middle arrow pointing?"
          }
        />
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8 sm:gap-11">
        {settling ? (
          <SettleBadge />
        ) : act === "pattern" ? (
          <>
            <div className="flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-8">
              {[icons[0], patternTrial.same ? icons[0] : icons[1]].map(
                (svg, i) => (
                  <div
                    key={`${trial}-${i}`}
                    className={cn(
                      "flex h-[150px] w-[300px] items-center justify-center rounded-[12px] border-2 border-nevo-navy bg-nevo-cream",
                      size.card,
                    )}
                  >
                    <div
                      className={cn("text-nevo-navy", size.icon)}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  </div>
                ),
              )}
            </div>
            <div className="flex w-full max-w-[300px] flex-col gap-3.5 sm:w-auto sm:max-w-none sm:flex-row">
              <TrialButton
                label="Same"
                className={size.button}
                pressed={picked === 0}
                onClick={(e) =>
                  pick(
                    0,
                    {
                      pair: patternTrial.same ? "same" : "different",
                      // Derivable here and nowhere downstream: "Same" is right
                      // when the pair IS the same. The reducer had only speed.
                      correct: patternTrial.same === true,
                    },
                    e,
                  )
                }
              />
              <TrialButton
                label="Different"
                className={size.button}
                pressed={picked === 1}
                onClick={(e) =>
                  pick(
                    1,
                    {
                      pair: patternTrial.same ? "same" : "different",
                      correct: patternTrial.same === false,
                    },
                    e,
                  )
                }
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-[13px] sm:gap-4">
              {(singleArrow ? [2] : [0, 1, 2, 3, 4]).map((pos) => {
                const central = pos === 2;
                return (
                  <ArrowRight
                    key={`${trial}-${pos}`}
                    strokeWidth={central ? 3 : 2.6}
                    className={cn(
                      central
                        ? cn("text-nevo-navy", size.arrow)
                        : cn(
                            "size-[28px] sm:size-[34px]",
                            flankViolet
                              ? "text-nevo-violet"
                              : "text-nevo-near-black/40",
                          ),
                    )}
                    style={{
                      transform: `rotate(${central ? targetRotate : flankRotate}deg)`,
                    }}
                  />
                );
              })}
            </div>
            <div className="flex w-full max-w-[300px] flex-col gap-4 sm:w-auto sm:max-w-none sm:flex-row">
              <TrialButton
                icon={
                  <ArrowRight
                    className="size-[31px] rotate-180 text-nevo-navy sm:size-[38px]"
                    strokeWidth={2.6}
                  />
                }
                label="Left"
                iconOnly
                className={size.arrowButton}
                pressed={picked === 0}
                onClick={(e) =>
                  pick(
                    0,
                    {
                      ...congruency,
                      // Known here and nowhere downstream. Without it the
                      // vector said how FAST a child answered an interference
                      // trial and never whether the flankers had captured
                      // them - so a wrong fast tap scored better than a right
                      // considered one, on the one measure where that inverts
                      // the finding.
                      correct: flankerTrial.target === "left",
                    },
                    e,
                  )
                }
              />
              <TrialButton
                icon={
                  <ArrowRight
                    className="size-[31px] text-nevo-navy sm:size-[38px]"
                    strokeWidth={2.6}
                  />
                }
                label="Right"
                iconOnly
                className={size.arrowButton}
                pressed={picked === 1}
                onClick={(e) =>
                  pick(
                    1,
                    {
                      ...congruency,
                      correct: flankerTrial.target === "right",
                    },
                    e,
                  )
                }
              />
            </div>
          </>
        )}
      </div>
    </ProfilingShell>
  );
}

export function TrialButton({
  label,
  icon,
  iconOnly = false,
  pressed,
  onClick,
  soft = false,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  pressed: boolean;
  onClick: (e: React.MouseEvent) => void;
  soft?: boolean;
  /** A per-band size, replacing the default 180x56 where a frame sets one. */
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={iconOnly ? label : undefined}
      onClick={onClick}
      className={cn(
        "flex h-14 min-w-[150px] cursor-pointer items-center justify-center rounded-[10px] border-2 transition-[background-color,transform] active:scale-[0.97] sm:w-[180px]",
        soft ? "text-sm font-medium" : "text-base font-semibold",
        pressed
          ? "border-nevo-violet bg-nevo-violet text-nevo-near-black"
          : soft
            ? "border-nevo-violet bg-nevo-cream text-nevo-violet"
            : "border-nevo-navy bg-nevo-cream text-nevo-navy",
        className,
      )}
    >
      {icon ?? label}
    </button>
  );
}
