"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { DENSITY, type Density } from "@/lib/constants";
import { chunksForBody } from "@/lib/lessons/chunk";
import { PARAGRAPH_GAP, paragraphsOf } from "@/lib/lessons/paragraphs";
import {
  chunkCrossing,
  sightingOf,
  type ChunkAction,
  type ChunkSighting,
  type ChunkState,
} from "@/lib/lessons/chunkViews";
import type { TextContent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FOCUS_ON_SHAPE } from "./focusOnShape";
import { READING_BODY, READING_INK } from "./readingSupport";

/** A server reading chunk came on screen or was read past (SCRUM-234). */
export type OnChunkSeen = (chunkId: string, action: ChunkAction) => void;

/** Attention pause: the continue control surfaces after this hold - no countdown. */
const PAUSE_REVEAL_MS = 4_000;

/**
 * Text modality (Lesson Player frame 17). One heading + a body that reshapes
 * with the active reading density — the SAME segment, not new content. Simplify
 * strips to the fewest words (+ "IN SHORT" callout); Expand adds depth and its
 * own callout; Slower breaks the idea into small numbered step cards under a
 * lead line. The key-term chips and the equation boxes stay under every one of
 * them: a rewrite loses no content (Lydia, 17 Oct - see `keyTerms` below).
 *
 * UDL accommodations (37c) adjust delivery, never diagnose:
 * - `reading`: the body sits on a softer card, larger and airier (18px,
 *   line-height 2, +0.02em letter-spacing, 95% opacity).
 * - `attention`: a body the server broke into reading chunks becomes short
 *   tap-to-continue parts with a calm breathing pause between them - no timer
 *   pressure anywhere.
 *
 * SLOWER REACHES THAT SAME FLOW WHEN NOTHING IS AUTHORED (17 Sep). Design:
 * "Slower is about how much arrives at once, which is segmentation and pacing
 * rather than wording." A parsed lesson has one body and no `slowerSteps`, so
 * the control used to be absent on every live lesson - the child had no way to
 * ask for less at a time. The server's chunks already break the body, so it
 * needs no authored content and invents none.
 *
 * NOTHING IS SPLIT HERE (B114, 13 Oct): "The client must not split text." The
 * parts are the server's chunks of the text on screen, and a body with fewer
 * than two reads whole in either flow - see `lib/lessons/chunk`.
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
 * above takes its parts from them as well. With none, the body is one block.
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
  const callouts = calloutsFor(content.callouts, density);
  const steps = density === DENSITY.SLOWER ? content.slowerSteps : undefined;
  const expand = density === DENSITY.EXPAND;
  /*
   * WHERE THE PAYLOAD'S BOXES GO (SCRUM-224, D24).
   *
   * KEY TERMS AND EQUATIONS ARE PART OF THE SEGMENT, "rather than a form of
   * support" (design, 9 Oct), so they sit beside the text under EVERY view:
   * the standard text in one block or in parts, Simplify, Expand, Slower's
   * step cards or its parts, and a lower-depth session's simpler text. Drawn
   * once, after the body and any steps, where the standard view and Expand
   * put them - never once per step or part.
   *
   * A REWRITE LOSES NO CONTENT (Lydia, 17 Oct, order of work item 8): "A
   * rewrite must not be able to lose an equation. Simplify loses no content,
   * which is the whole rule." And checklist 15, for Slower: "Failure: Content
   * is cut to make it shorter." That overrules the Lesson Player frame's
   * Simplify and Slower views, which draw neither box, and the reading this
   * once had of them: a reshape, or the simpler text a lower-depth session
   * shows in the standard's place, drew the frame's view and dropped both.
   * For the equations it was never only placement: backend, 9 Oct, an
   * equation callout "is not guaranteed to be repeated in body", so the
   * rewrite took the equation off the screen altogether.
   *
   * Key points are the frame's "IN SHORT", under every view but Expand and
   * Slower. Lydia's checklist 13 calls them "two to four highlights beside
   * the body" that "must never be what Simplify returns": Simplify returns
   * its own rewritten text, and they stay beside it.
   */
  const keyTerms = content.keyTerms;
  const equations = content.equations;
  const keyPoints =
    !expand && density !== DENSITY.SLOWER ? content.keyPoints : undefined;
  /*
   * The server's chunks are of the standard body, so they are asked of the
   * text actually shown. A reshape, or any other text standing in for the
   * standard body, reads whole and reports no chunk it is not showing.
   */
  const chunks = chunksForBody(body, content.readingChunks);
  /*
   * The authored numbered cards are the richer Slower and win where they
   * exist; chunking is the form that needs no content. Never both, or the
   * child reads the same idea twice and the second time in pieces.
   */
  const chunkedForSlower = density === DENSITY.SLOWER && !steps;
  /*
   * A PART AT A TIME ONLY WHERE THERE ARE PARTS. One chunk, or none, is the
   * body whole, drawn as it is for every other child - not the flow with a
   * single part. That flow tells the player its one part is all the body, so
   * a long body arriving whole there was reported read the moment it opened,
   * and the column's own scroll, the true reading, was kept quiet.
   */
  const inParts =
    (attention || chunkedForSlower) && chunks !== undefined && chunks.length > 1;

  /*
   * Reading support is merged over the standard type, never put in its place:
   * it replaced it, and took the desktop body down from 19px to 18 while the
   * boxes beside it stayed at 19. Frame 17 sets the reading body at
   * `Math.max(L.body, 18)` - see READING_BODY.
   */
  const bodyType = cn(
    "text-base leading-[1.75] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]",
    reading && [READING_BODY, READING_INK],
  );

  const bodyBlock = inParts ? (
    <ChunkedBody
      key={body}
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
    <div
      className={cn("mt-4", reading && "rounded-[12px] bg-[#e5dfd3] px-5 py-4")}
    >
      <Paragraphs text={body} className={bodyType} />
    </div>
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
              <p
                className={cn(
                  "text-base leading-[1.6] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]",
                  // Frame 17 sizes a step like the body: the reading size,
                  // never smaller, on the card's own 1.6 line height.
                  reading && [BOX_READING, "leading-[1.6]"],
                )}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      )}

      {keyTerms && keyTerms.length > 0 && (
        <KeyTerms terms={keyTerms} reading={reading} />
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
              <p
                className={cn(
                  "text-base leading-[1.7] font-medium text-nevo-near-black sm:text-[18px] lg:text-[19px]",
                  reading && BOX_READING,
                )}
              >
                {equation}
              </p>
            </div>
          ))}
        </div>
      )}

      {callouts.map((callout, i) => (
        <div key={i} className="mt-[22px] rounded-[12px] bg-nevo-violet/8 p-5">
          <p className="font-mono text-[11px] tracking-[0.06em] text-nevo-navy uppercase">
            {callout.label}
          </p>
          <p
            className={cn(
              "mt-2.5 text-base leading-[1.7] font-medium text-nevo-near-black sm:text-[18px] lg:text-[19px]",
              reading && BOX_READING,
            )}
          >
            {callout.text}
          </p>
          {callout.sub && (
            <p className="mt-1.5 text-[13px] leading-[1.6] text-nevo-near-black/60">
              {callout.sub}
            </p>
          )}
        </div>
      ))}

      {keyPoints && keyPoints.length > 0 && (
        <div className="mt-[22px] rounded-[12px] bg-nevo-violet/8 p-5">
          <p className="font-mono text-[11px] tracking-[0.06em] text-nevo-navy uppercase">
            IN SHORT
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {keyPoints.map((point, i) => (
              <li
                key={i}
                className={cn(
                  "text-base leading-[1.7] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]",
                  reading && BOX_READING,
                )}
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

type Callout = NonNullable<NonNullable<TextContent["callouts"]>["default"]>;

/**
 * The authored callouts a view draws: the standard view's under every view,
 * and the view's own after it where it has one.
 *
 * THE SAME RULE AS THE KEY TERMS AND EQUATIONS (Lydia, 17 Oct: "Simplify
 * loses no content"). A density's callout used to stand in the standard's
 * place, so a reshape took the standard view's callout off the screen with
 * nothing of its own to put there - and a callout can be an equation. A view's
 * own callout is what that view adds, as Simplify's "IN SHORT" and Expand's
 * "WORD EQUATION" are in the authored lessons. One that repeats the standard
 * view's is drawn once.
 */
function calloutsFor(
  all: TextContent["callouts"],
  density: Density | null,
): Callout[] {
  const standard = all?.default;
  const own = density ? all?.[density] : undefined;
  const same =
    own !== undefined &&
    standard !== undefined &&
    own.label === standard.label &&
    own.text === standard.text;
  return [standard, same ? undefined : own].filter(
    (c): c is Callout => c !== undefined,
  );
}

/**
 * A text as the paragraphs it was written in, each its own `<p>` in the given
 * type (see `paragraphsOf`). One paragraph is one `<p>`, as before.
 */
function Paragraphs({ text, className }: { text: string; className: string }) {
  return (
    <>
      {paragraphsOf(text).map((paragraph, i) => (
        <p key={i} className={cn(className, i > 0 && PARAGRAPH_GAP)}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

/*
 * READING SUPPORT IN THE BOXES. Frame 17's "UDL · reading" sets IN SHORT and
 * the equation at the reading body size, under the column's +0.02em, and keeps
 * each box's own 1.7 line height. They had stayed at 16px beside an 18px body.
 * The line height is restated because `cn` drops a line height that comes
 * before a later size.
 */
const BOX_READING = "text-[18px] sm:text-[18px] leading-[1.7] tracking-[0.02em]";

/** The frame's key-term chip: fully round, 13px navy, a 1.5px edge. */
const CHIP =
  "rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-medium";

/**
 * OPEN READS DIFFERENTLY FROM CLOSED (D190, 13 Oct): "navy fill open, outline
 * closed". Both were the same violet fill, so nothing showed which term the
 * definition under the row belonged to.
 */
const CHIP_CLOSED = "border-nevo-violet/60 bg-transparent text-nevo-navy";
const CHIP_OPEN = "border-nevo-navy bg-nevo-navy text-nevo-cream";

/**
 * A term with no definition has nothing to open, so it is not drawn as one
 * that does: no outline, which reads as pressable. The frame draws no such
 * term; this is the chip as it was, at the same size (Q7, design).
 */
const CHIP_PLAIN = "border-transparent bg-nevo-violet/18 text-nevo-navy";

/**
 * The definition's panel, as the frame draws it under the chips: soft violet,
 * 10px corners, 14px on 1.5 in near-black. Under reading support the words
 * take the reading type over it, never smaller (Q8, design).
 */
const DEFINITION =
  "mt-3 rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-sm leading-[1.5] text-nevo-near-black";

/**
 * The segment's key terms as the frame's chips. Design, 9 Oct: "A definition
 * appears in place when the child taps the term. Not a glossary, not a
 * separate screen, and not permanently expanded."
 *
 * So a term with a definition is a button that opens it in the frame's panel
 * right under the chips, and closes it on a second tap. One at a time:
 * opening another closes the first. A term with no definition stays a plain
 * chip with nothing to open.
 *
 * Drawn at the frame's size and touched at 44px: the button is the hit area,
 * the inner span is the chip, and the negative margin keeps the row the
 * frame draws (the affective pill does the same). The focus ring goes on the
 * chip, not the hit area (`FOCUS_ON_SHAPE`).
 */
function KeyTerms({
  terms,
  reading,
}: {
  terms: { term: string; definition?: string }[];
  reading: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const definitionId = useId();
  const definition = open === null ? undefined : terms[open]?.definition;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {terms.map(({ term, definition: has }, i) =>
          has ? (
            <button
              key={i}
              type="button"
              // NAMED ON THE BUTTON ITSELF. The term sits in the inner span,
              // the chip's visible shape inside the 44px hit area, and the
              // 20 Oct production run's accessibility read found these chips
              // with no name at all.
              aria-label={term}
              aria-expanded={open === i}
              aria-controls={open === i ? definitionId : undefined}
              onClick={() => setOpen(open === i ? null : i)}
              className={cn(
                "group -my-[5px] inline-flex h-11 cursor-pointer items-center",
                FOCUS_ON_SHAPE.hit,
              )}
            >
              <span
                className={cn(
                  CHIP,
                  open === i ? CHIP_OPEN : CHIP_CLOSED,
                  FOCUS_ON_SHAPE.shape,
                )}
              >
                {term}
              </span>
            </button>
          ) : (
            <span key={i} className={cn(CHIP, CHIP_PLAIN)}>
              {term}
            </span>
          ),
        )}
      </div>
      {definition && (
        <p
          id={definitionId}
          className={cn(DEFINITION, reading && [READING_BODY, READING_INK])}
        >
          {definition}
        </p>
      )}
    </div>
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
          <div data-chunk-id={chunk.id}>
            <Paragraphs text={chunk.text} className={className} />
          </div>
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
 * THE PARTS ARE THE SERVER'S CHUNKS (SCRUM-234), two or more of them - the
 * segment shows a body with fewer whole, and never splits one itself (B114).
 * Each part reports as its chunk: `entered` as it shows, `passed` when the
 * child taps on from it.
 *
 * NO COUNT OF THE PARTS. It read "Part 1 of 3", and with the server's chunks
 * that counted chunks. Design, 9 Oct: "Drop it... nothing about chunking is
 * ever surfaced to a child." "Tap to continue" alone says there is more,
 * and the last part simply has none.
 */
function ChunkedBody({
  chunks,
  className,
  reading,
  onReadProgress,
  onChunkSeen,
}: {
  chunks: readonly { id: string; text: string }[];
  className: string;
  reading: boolean;
  onReadProgress?: (pct: number) => void;
  onChunkSeen?: OnChunkSeen;
}) {
  const parts = chunks.map((c) => c.text);
  const [part, setPart] = useState(0);
  const [pausing, setPausing] = useState(false);
  const [pauseReady, setPauseReady] = useState(false);
  const shown = useRef<HTMLElement>(null);
  const chunkId = chunks[part]?.id;
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
   * read. A child who stopped at the first of three parts would be reported
   * to the adaptation engine as having read all of it, and the engine learns
   * from that.
   *
   * Worse, it would have been wrong for precisely the children this
   * accommodation exists to help: only a child WITH the attention
   * accommodation is ever chunked, so only their signal would be corrupted.
   *
   * Reported on mount as well as on change, because the first of three parts
   * is already a claim - "a third", not "all of it".
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
      <div
        key={part}
        data-chunk-id={chunkId}
        className={cn(
          reading && "rounded-[12px] bg-[#e5dfd3] px-5 py-4",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
        )}
      >
        <Paragraphs text={parts[part]} className={className} />
      </div>
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
