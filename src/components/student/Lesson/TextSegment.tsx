"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { DENSITY, type Density } from "@/lib/constants";
import { bodyParts, chunksForBody } from "@/lib/lessons/chunk";
import {
  chunkCrossing,
  sightingOf,
  type ChunkAction,
  type ChunkSighting,
  type ChunkState,
} from "@/lib/lessons/chunkViews";
import type { TextContent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A server reading chunk came on screen or was read past (SCRUM-234). */
export type OnChunkSeen = (chunkId: string, action: ChunkAction) => void;

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
 *
 * THE SERVER'S READING CHUNKS (SCRUM-234, frame 17c). Where a segment carries
 * them, the standard body is drawn as those chunks with a quiet 1px rule
 * between, and nothing else: "Nothing on screen tells a child the chunking
 * exists - no chunk numbers... no marker that follows where they have read."
 * The rule is decorative to a screen reader too. The tap-to-continue flow
 * above takes its parts from them as well. With none, everything is as it
 * was.
 */
export function TextSegment({
  content,
  density,
  reading = false,
  attention = false,
  onReadProgress,
  onChunkSeen,
}: {
  content: TextContent;
  density: Density | null;
  reading?: boolean;
  attention?: boolean;
  /**
   * How much of the body the child has actually been shown, 0-100.
   *
   * Only the chunked flow reports: it is the one mode where the body is
   * DELIBERATELY not all on screen, so the player's scroll of the column
   * describes one part rather than the segment. The player keeps its scroll
   * marks quiet on a body that reports, and keeps Next back while parts are
   * left (37c).
   */
  onReadProgress?: (pct: number) => void;
  /**
   * For `reading_chunk_viewed`: a server chunk entered view or was passed.
   * Only server chunks report - the on-device split has no ids to name.
   */
  onChunkSeen?: OnChunkSeen;
}) {
  const body = (density && content.body[density]) ?? content.body.default;
  const callout = content.callouts?.[density ?? "default"];
  const steps = density === DENSITY.SLOWER ? content.slowerSteps : undefined;
  const expand = density === DENSITY.EXPAND;
  const keyTerms = expand ? content.keyTerms : undefined;
  /*
   * WHERE THE PAYLOAD'S BOXES GO (SCRUM-224, D24) is where the Lesson Player
   * frame draws them, by density: Expand is "more depth + key terms + equation
   * callout", and every other view but Slower is the body with "IN SHORT"
   * under it - the key points. Slower draws neither.
   *
   * EXCEPT THE EQUATIONS, WHICH ALSO SIT BESIDE THE STANDARD BODY. Backend, 9
   * Oct: an equation callout "is not guaranteed to be repeated in body", so
   * drawn under Expand alone, a child reading the standard text - in one
   * block or in parts - could lose an equation outright. The box is Expand's
   * own. This placement is INTERIM, pending design's answer on whether key
   * terms sit beside the standard text too; a reshape (Simplify) still draws
   * the frame's view, and that is part of the same question.
   */
  const equations =
    expand || body === content.body.default ? content.equations : undefined;
  const keyPoints =
    !expand && density !== DENSITY.SLOWER ? content.keyPoints : undefined;
  /*
   * The server's chunks are of the standard body, so they are asked of the
   * text actually shown. A reshape, or any other text standing in for the
   * standard body, reads as it always has - one block, or the on-device
   * parts - and reports no chunk it is not showing.
   */
  const chunks = chunksForBody(body, content.readingChunks);
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
      chunks={chunks}
      className={bodyType}
      reading={reading}
      onReadProgress={onReadProgress}
      onChunkSeen={onChunkSeen}
    />
  ) : chunks ? (
    <ChunkedPassage
      chunks={chunks}
      className={bodyType}
      reading={reading}
      onChunkSeen={onChunkSeen}
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

      {equations && equations.length > 0 && (
        <div className="mt-5 flex flex-col gap-3">
          {equations.map(({ equation, label }, i) => (
            <div key={i} className="rounded-[12px] bg-nevo-violet/8 p-5">
              {/* No label is no heading: not every equation is a word equation. */}
              {label && (
                <p className="mb-2.5 font-mono text-[11px] tracking-[0.06em] text-nevo-navy uppercase">
                  {label}
                </p>
              )}
              <p className="text-base leading-[1.7] font-medium text-nevo-near-black sm:text-[18px] lg:text-[19px]">
                {equation}
              </p>
            </div>
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

      {keyPoints && keyPoints.length > 0 && (
        <div className="mt-[22px] rounded-[12px] bg-nevo-violet/8 p-5">
          <p className="font-mono text-[11px] tracking-[0.06em] text-nevo-navy uppercase">
            IN SHORT
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {keyPoints.map((point, i) => (
              <li
                key={i}
                className="text-base leading-[1.7] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/**
 * The standard body as the server's chunks, frame 17c: each chunk's text, a
 * quiet 1px rule between two, and nothing more. No animation on the rule and
 * nothing reacts to crossing one - the crossing is reported, never shown.
 *
 * Under typographic support the whole passage sits on the softer card, and
 * the rule darkens and spaces out to still read at the loosest setting.
 */
function ChunkedPassage({
  chunks,
  className,
  reading,
  onChunkSeen,
}: {
  chunks: readonly { id: string; text: string }[];
  className: string;
  reading: boolean;
  onChunkSeen?: OnChunkSeen;
}) {
  const passage = useRef<HTMLDivElement>(null);
  useChunkViews(passage, onChunkSeen, chunks.map((c) => c.id).join(" "));
  return (
    <div
      ref={passage}
      className={cn("mt-4", reading && "rounded-[12px] bg-[#e5dfd3] px-5 py-4")}
    >
      {chunks.map((chunk, i) => (
        <Fragment key={chunk.id}>
          {i > 0 && (
            <div
              aria-hidden="true"
              className={cn(
                "h-px",
                reading
                  ? "my-[30px] bg-nevo-near-black/16"
                  : "my-[26px] bg-nevo-near-black/10",
              )}
            />
          )}
          <p data-chunk-id={chunk.id} className={className}>
            {chunk.text}
          </p>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Watches the server chunks inside `watched` - and `watched` itself, when it
 * is one - and reports each crossing once, as `chunkCrossing` reads it.
 * Returns a way to mark one passed by hand: the tap-to-continue flow moves on
 * from a part without it ever scrolling away.
 *
 * `showing` names what is on screen, so the watch is re-laid when it changes.
 * Nothing is watched where the browser has no IntersectionObserver: no
 * reading is sent rather than a guessed one.
 */
function useChunkViews(
  watched: RefObject<HTMLElement | null>,
  onChunkSeen: OnChunkSeen | undefined,
  showing: string,
): (chunkId: string) => void {
  const states = useRef(new Map<string, ChunkState>());
  const report = useRef(onChunkSeen);
  useEffect(() => {
    report.current = onChunkSeen;
  });
  const note = useCallback((id: string, seen: ChunkSighting) => {
    const next = chunkCrossing(states.current.get(id), seen);
    states.current.set(id, next.state);
    if (next.action) report.current?.(id, next.action);
  }, []);
  useEffect(() => {
    const root = watched.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const targets = [
      root,
      ...root.querySelectorAll<HTMLElement>("[data-chunk-id]"),
    ].filter((el) => el.dataset.chunkId);
    if (targets.length === 0) return;
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.chunkId;
        // A part the flow has already replaced is gone, not read past.
        if (!id || !entry.target.isConnected) continue;
        note(id, sightingOf(entry, window.innerHeight));
      }
    });
    targets.forEach((el) => watcher.observe(el));
    return () => watcher.disconnect();
  }, [watched, note, showing]);
  return useCallback((id: string) => note(id, "above"), [note]);
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
 *
 * THE PARTS ARE THE SERVER'S CHUNKS where the body came with them
 * (SCRUM-234), and B23's on-device split only where it did not. Each part
 * that is a server chunk reports as one: `entered` as it shows, `passed` when
 * the child taps on from it.
 */
function ChunkedBody({
  body,
  chunks,
  className,
  reading,
  onReadProgress,
  onChunkSeen,
}: {
  body: string;
  chunks?: readonly { id: string; text: string }[];
  className: string;
  reading: boolean;
  onReadProgress?: (pct: number) => void;
  onChunkSeen?: OnChunkSeen;
}) {
  const parts = bodyParts(body, chunks);
  const [part, setPart] = useState(0);
  const [pausing, setPausing] = useState(false);
  const [pauseReady, setPauseReady] = useState(false);
  const shown = useRef<HTMLElement>(null);
  const chunkId = chunks?.[part]?.id;
  const markPassed = useChunkViews(
    shown,
    onChunkSeen,
    pausing ? "" : (chunkId ?? ""),
  );

  /*
   * TELL THE PLAYER HOW MUCH OF THE BODY THE CHILD HAS ACTUALLY SEEN.
   *
   * Without this the attention accommodation fabricates a reading signal. A
   * chunk is a third of the body and so always fits: any scroll of the column
   * reads as its bottom, and the player would send that as the whole segment
   * read. A child who stopped at Part 1 of 3 would be reported to the
   * adaptation engine as having read all of it, and the engine learns from
   * that.
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
        ref={shown as RefObject<HTMLParagraphElement | null>}
        data-chunk-id={chunkId}
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
    <div ref={shown as RefObject<HTMLDivElement | null>} className="mt-4">
      <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-nevo-near-black/40 uppercase">
        Part {part + 1} of {parts.length}
      </span>
      <p
        key={part}
        data-chunk-id={chunkId}
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
          onClick={() => {
            if (chunkId) markPassed(chunkId);
            setPausing(true);
          }}
          className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy/8 px-5 text-[14px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/12 active:scale-[0.99]"
        >
          Tap to continue
        </button>
      )}
    </div>
  );
}
