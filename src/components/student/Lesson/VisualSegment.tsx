"use client";

import { ArrowRight, Leaf } from "lucide-react";
import { IllustrationWrapper } from "@/components/shared";
import type { VisualContent } from "@/lib/types";
import { useMediaSource } from "./useMediaSource";

/**
 * Visual modality (Lesson Player frame 17) — the segment as a picture: finished
 * inline art (or a produced illustration asset) plus the on-brand input→output
 * diagram card. Where no art exists at all, a quiet cream-elevated tile — never
 * a dashed wireframe box on a finished screen (frontend handoff §07).
 *
 * A PICTURE THAT WILL NOT LOAD IS NO PICTURE. It drew the browser's broken
 * image. Now an expired link is re-issued once (`useMediaSource`), and a
 * picture that still fails takes the same quiet tile as a segment with no art -
 * the caption under it carries the description either way.
 */
export function VisualSegment({ content }: { content: VisualContent }) {
  const inlineArt = content.art ? INLINE_ART[content.art.id] : undefined;
  const caption = content.art?.caption ?? content.illustration?.caption;
  const media = useMediaSource(
    content.illustration?.src,
    content.illustration?.storagePath,
  );

  return (
    <article>
      <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black sm:text-[26px] lg:text-[28px]">
        {content.heading}
      </h2>
      {content.intro && (
        <p className="mt-4 text-base leading-[1.6] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]">
          {content.intro}
        </p>
      )}

      <figure className="mt-[22px]">
        {content.art && inlineArt ? (
          <div
            role="img"
            aria-label={content.art.alt}
            className="flex h-[180px] items-center justify-center overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 sm:h-[220px]"
          >
            {inlineArt}
          </div>
        ) : content.illustration && media.src && !media.failed ? (
          <div className="flex justify-center">
            <IllustrationWrapper
              key={media.key}
              src={media.src}
              alt={content.illustration.alt}
              width={content.illustration.width ?? 640}
              height={content.illustration.height ?? 480}
              onError={media.onError}
              className="w-full max-w-[420px]"
            />
          </div>
        ) : (
          // No art at all, or art that would not load — a quiet
          // cream-elevated tile (calm, finished-looking).
          <div className="flex h-[180px] items-center justify-center rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 sm:h-[220px]">
            <Leaf className="size-[46px] text-nevo-violet" strokeWidth={1.6} />
          </div>
        )}
        {caption && (
          <figcaption className="mx-0.5 mt-2.5 text-[13px] leading-[1.5] text-nevo-near-black/60">
            {caption}
          </figcaption>
        )}
      </figure>

      {content.diagram && (
        <div className="mt-4 rounded-[12px] bg-nevo-cream-elevated p-5 shadow-elevation-1">
          <div className="flex items-center gap-3.5">
            <DiagramColumn
              label={content.diagram.inLabel}
              items={content.diagram.inputs}
              tone="in"
            />
            <ArrowRight
              className="size-[26px] shrink-0 text-nevo-violet"
              strokeWidth={2}
            />
            <DiagramColumn
              label={content.diagram.outLabel}
              items={content.diagram.outputs}
              tone="out"
            />
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Named inline artwork shipped with the app (Lesson Player frame) — finished
 * SVG pieces used until produced assets land. Keyed by `VisualContent.art.id`.
 */
const INLINE_ART: Record<string, React.ReactNode> = {
  // The frame's leaf-photosynthesising diagram: sun + arrows in, leaf, arrow out.
  "leaf-photosynthesis": (
    <svg
      viewBox="0 0 320 200"
      className="block h-[82%] w-auto max-w-[94%]"
      aria-hidden
    >
      <defs>
        <marker
          id="nevo-leaf-arrowhead"
          markerWidth="7"
          markerHeight="7"
          refX="5"
          refY="3.5"
          orient="auto"
        >
          <path d="M0 0L7 3.5L0 7z" fill="#3b3f6e" />
        </marker>
      </defs>
      <g stroke="#9a9ccb" strokeWidth="3" strokeLinecap="round">
        <line x1="52" y1="16" x2="52" y2="26" />
        <line x1="52" y1="66" x2="52" y2="76" />
        <line x1="22" y1="46" x2="32" y2="46" />
        <line x1="72" y1="46" x2="82" y2="46" />
        <line x1="31" y1="25" x2="38" y2="32" />
        <line x1="66" y1="60" x2="73" y2="67" />
        <line x1="73" y1="25" x2="66" y2="32" />
        <line x1="38" y1="60" x2="31" y2="67" />
      </g>
      <circle cx="52" cy="46" r="16" fill="#9a9ccb" />
      <path
        d="M186 58 C238 66 252 128 198 166 C150 156 128 96 186 58 Z"
        fill="rgba(154,156,203,0.28)"
        stroke="#3b3f6e"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M188 66 L196 158"
        stroke="#3b3f6e"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M191 96 L168 92 M193 118 L216 108 M194 136 L173 136"
        stroke="#3b3f6e"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="70"
        y1="58"
        x2="150"
        y2="96"
        stroke="#3b3f6e"
        strokeWidth="2.5"
        markerEnd="url(#nevo-leaf-arrowhead)"
      />
      <line
        x1="150"
        y1="196"
        x2="170"
        y2="162"
        stroke="#3b3f6e"
        strokeWidth="2.5"
        markerEnd="url(#nevo-leaf-arrowhead)"
      />
      <line
        x1="212"
        y1="78"
        x2="262"
        y2="42"
        stroke="#3b3f6e"
        strokeWidth="2.5"
        markerEnd="url(#nevo-leaf-arrowhead)"
      />
      <g
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="10"
        fill="rgba(43,43,47,0.55)"
      >
        <text x="84" y="44">
          sunlight
        </text>
        <text x="126" y="196">
          in
        </text>
        <text x="264" y="40">
          out
        </text>
      </g>
    </svg>
  ),
};

function DiagramColumn({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "in" | "out";
}) {
  return (
    <div className="flex flex-1 flex-col items-start gap-1.5">
      <p className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
        {label}
      </p>
      {items.map((item) => (
        <span
          key={item}
          className={
            tone === "in"
              ? "inline-flex items-center rounded-full bg-nevo-violet/18 px-3 py-[7px] text-[13px] font-medium text-nevo-navy"
              : "inline-flex items-center rounded-full bg-nevo-navy px-3 py-[7px] text-[13px] font-medium text-nevo-cream"
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}
