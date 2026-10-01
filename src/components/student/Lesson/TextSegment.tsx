"use client";

import { useEffect, useState } from "react";
import { DENSITY, type Density } from "@/lib/constants";
import { chunkBody } from "@/lib/lessons/chunk";
import type { TextContent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Attention pause: the continue control surfaces after this hold - no countdown. */
const PAUSE_REVEAL_MS = 4_000;

/**
 * Text modality (Lesson Player frame 17). One heading + a body that reshapes
 * with the active reading density — the SAME segment, not new content. Simplify
 * strips to the fewest words (+ "IN SHORT" callout); Expand adds depth, key-term
 * chips and the "WORD EQUATION" callout; Slower breaks the idea into small
 * numbered step cards under a lead line.
 *
 * UDL accommodations (37c) adjust delivery, never diagnose:
 * - `reading`: the body sits on a softer card, larger and airier (18px,
 *   line-height 2, +0.02em letter-spacing, 95% opacity).
 * - `attention`: multi-sentence bodies become short tap-to-continue parts with
 *   a calm breathing pause between them - no timer pressure anywhere.
 *
 * SLOWER REACHES THAT SAME FLOW WHEN NOTHING IS AUTHORED (17 Sep). Design:
 * "Slower is about how much arrives at once, which is segmentation and pacing
 * rather than wording." A parsed lesson has one body and no `slowerSteps`, so
 * the control used to be absent on every live lesson - the child had no way to
 * ask for less at a time. Chunking regroups sentences the lesson already has,
 * so it needs no authored content and invents none.
 *
 * TWO THINGS THIS IS NOT. It is not the `attention` accommodation: that is
 * engine-owned, applied before the first screen, and never written from here.
 * And it is not the engine's own `slower`, which arrives as the system's
 * density. This is the child asking, which is the whole point of the control - the one place a learner
 * has any agency in a system that deliberately tells them nothing about what
 * it is doing, and asking is not a disclosure about themselves.
 */
export function TextSegment({
  content,
  density,
  reading = false,
  attention = false,
  onReadProgress,
}: {
  content: TextContent;
  density: Density | null;
  reading?: boolean;
  attention?: boolean;
  /**
   * How much of the body the child has actually been shown, 0-100.
   *
   * Only the chunked flow reports: it is the one mode where the body is
   * DELIBERATELY not all on screen, so the player's own "it all fits, so they
   * saw it" measurement would be a lie. Every other mode leaves the player to
   * measure the layout as it always has.
   */
  onReadProgress?: (pct: number) => void;
}) {
  const body = (density && content.body[density]) ?? content.body.default;
  const callout = content.callouts?.[density ?? "default"];
  const steps = density === DENSITY.SLOWER ? content.slowerSteps : undefined;
  const keyTerms = density === DENSITY.EXPAND ? content.keyTerms : undefined;
  /*
   * The authored numbered cards are the richer Slower and win where they
   * exist; chunking is the form that needs no content. Never both, or the
   * child reads the same idea twice and the second time in pieces.
   */
  const chunkedForSlower = density === DENSITY.SLOWER && !steps;

  const bodyType = cn(
    reading
      ? "text-[18px] leading-[2] tracking-[0.02em] text-nevo-near-black/95"
      : "text-base leading-[1.75] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]",
  );

  const bodyBlock = attention || chunkedForSlower ? (
    <ChunkedBody
      key={body}
      body={body}
      className={bodyType}
      reading={reading}
      onReadProgress={onReadProgress}
    />
  ) : (
    <p
      className={cn(
        "mt-4",
        bodyType,
        reading && "rounded-[12px] bg-[#e5dfd3] px-5 py-4",
      )}
    >
      {body}
    </p>
  );

  return (
    <article>
      <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black sm:text-[26px] lg:text-[28px]">
        {content.heading}
      </h2>

      {bodyBlock}

      {steps && steps.length > 0 && (
        <div className="mt-5 flex flex-col gap-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-3.5 rounded-[12px] bg-nevo-cream-elevated px-4.5 py-4 shadow-elevation-1"
            >
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-sm font-semibold text-nevo-cream">
                {i + 1}
              </span>
              <p className="text-base leading-[1.6] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]">
                {step}
              </p>
            </div>
          ))}
        </div>
      )}

      {keyTerms && keyTerms.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {keyTerms.map((term) => (
            <span
              key={term}
              className="rounded-full bg-nevo-violet/18 px-3 py-1.5 text-[13px] font-medium text-nevo-navy"
            >
              {term}
            </span>
          ))}
        </div>
      )}

      {callout && (
        <div className="mt-[22px] rounded-[12px] bg-nevo-violet/8 p-5">
          <p className="font-mono text-[11px] tracking-[0.06em] text-nevo-navy uppercase">
            {callout.label}
          </p>
          <p className="mt-2.5 text-base leading-[1.7] font-medium text-nevo-near-black sm:text-[18px] lg:text-[19px]">
            {callout.text}
          </p>
          {callout.sub && (
            <p className="mt-1.5 text-[13px] leading-[1.6] text-nevo-near-black/60">
              {callout.sub}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * The chunked reading flow: one short part at a time behind a "Tap to
 * continue", with the calm 4-second breathing pause between parts. The
 * continue control simply surfaces when the pause is over - never a countdown,
 * never pressure.
 *
 * TWO CALLERS, so it is not named for either: the `attention` accommodation
 * (37c), which the engine owns, and the child picking Slower, which the child
 * owns. The flow on screen is the same; what differs is who asked.
 */
function ChunkedBody({
  body,
  className,
  reading,
  onReadProgress,
}: {
  body: string;
  className: string;
  reading: boolean;
  onReadProgress?: (pct: number) => void;
}) {
  const parts = chunkBody(body);
  const [part, setPart] = useState(0);
  const [pausing, setPausing] = useState(false);
  const [pauseReady, setPauseReady] = useState(false);

  /*
   * TELL THE PLAYER HOW MUCH OF THE BODY THE CHILD HAS ACTUALLY SEEN.
   *
   * Without this the attention accommodation fabricates a reading signal. The
   * player decides a segment was fully read when its column has no room to
   * scroll - correct for an ordinary segment, and exactly wrong here, because
   * a chunk is a third of the body and so always fits. A child who stopped at
   * Part 1 of 3 was reported to the adaptation engine as having read all of
   * it, and the engine learns from that.
   *
   * Worse, it would have been wrong for precisely the children this
   * accommodation exists to help: only a child WITH the attention
   * accommodation is ever chunked, so only their signal would be corrupted.
   *
   * Reported on mount as well as on change, because Part 1 of 3 is already a
   * claim - "a third", not "all of it".
   */
  const total = parts.length;
  useEffect(() => {
    onReadProgress?.(Math.round(((part + 1) / total) * 100));
  }, [part, total, onReadProgress]);

  useEffect(() => {
    if (!pausing) return;
    const t = setTimeout(() => setPauseReady(true), PAUSE_REVEAL_MS);
    return () => clearTimeout(t);
  }, [pausing]);

  if (parts.length === 1) {
    return (
      <p
        className={cn(
          "mt-4",
          className,
          reading && "rounded-[12px] bg-[#e5dfd3] px-5 py-4",
        )}
      >
        {body}
      </p>
    );
  }

  if (pausing) {
    return (
      <div className="mt-6 flex flex-col items-center py-10 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
        <p className="text-[17px] text-nevo-near-black/82">
          Take a breath. Ready when you are.
        </p>
        {/*
         * Inert until it has surfaced, not merely invisible. `opacity-0` with
         * `pointer-events-none` stops a mouse and stops nothing else: the
         * button stayed in the tab order and a screen reader announced a live
         * "Continue" the moment the pause began. A child using a keyboard or
         * switch access could skip the breathing pause without knowing it was
         * there, and a child using a reader was told about a control they
         * could not see. `disabled` closes both while leaving the fade alone.
         */}
        <button
          type="button"
          disabled={!pauseReady}
          onClick={() => {
            setPausing(false);
            setPauseReady(false);
            setPart((p) => p + 1);
          }}
          className={cn(
            "mt-7 flex h-12 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-8 text-[15px] font-medium text-nevo-cream transition-opacity duration-500",
            pauseReady ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          Continue
        </button>
      </div>
    );
  }

  const last = part === parts.length - 1;
  return (
    <div className="mt-4">
      <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-nevo-near-black/40 uppercase">
        Part {part + 1} of {parts.length}
      </span>
      <p
        key={part}
        className={cn(
          "mt-2",
          className,
          reading && "rounded-[12px] bg-[#e5dfd3] px-5 py-4",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
        )}
      >
        {parts[part]}
      </p>
      {!last && (
        <button
          type="button"
          onClick={() => setPausing(true)}
          className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy/8 px-5 text-[14px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/12 active:scale-[0.99]"
        >
          Tap to continue
        </button>
      )}
    </div>
  );
}
