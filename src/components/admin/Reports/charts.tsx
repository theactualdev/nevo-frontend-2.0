"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The two chart forms this console needs, built to one spec.
 *
 * PALETTE, AND WHAT THE VALIDATOR SAID. The series colours are the brand's own
 * navy #3b3f6e and violet #9a9ccb, checked with the dataviz validator against
 * the card surface #ede8dc:
 *
 *   CVD separation      PASS  ΔE 31.9 (protan) · 32.2 (tritan)
 *   Normal-vision floor PASS  ΔE 32.1
 *   Lightness band      FAIL  navy 0.387 sits below the band
 *   Chroma floor        FAIL  0.079 / 0.068 - both read close to gray
 *   Contrast vs surface WARN  violet 2.15:1, under 3:1
 *
 * The two FAILs are properties of the Nevo palette itself: it is deliberately
 * muted and warm, with no red or amber anywhere in the admin set. Fixing them
 * means inventing colours outside the design system, which would be the wrong
 * trade on a screen a proprietor reads beside every other admin screen.
 *
 * The checks that decide whether two series can be TOLD APART both pass
 * comfortably, which is what actually matters. The contrast WARN is not
 * dismissable though, and it carries an obligation: visible labels or a table
 * view. Both ship - every bar is directly labelled AND the dual-track chart
 * has a table view behind a toggle.
 *
 * MARK SPECS, from the same source: bars <=24px with a 4px rounded data-end
 * square at the baseline; lines 2px with round caps; end markers >=8px with a
 * 2px surface ring; area fill ~10%; gridlines hairline, solid, recessive; a
 * 2px surface gap between adjacent bars. Text never wears the series colour -
 * identity comes from the swatch beside it.
 *
 * One axis, always. Completion rate and adaptations-per-session are two
 * separate charts rather than one dual-axis chart.
 *
 * TEXT LIVES IN HTML, NOT IN THE SVG. A responsive `viewBox` scales everything
 * inside it including type: measured in place, a 640x180 viewBox rendered at
 * 976px, so 13px labels came out at ~20px - and at a different size again on
 * the narrower real card. Labels are therefore positioned over the plot as
 * ordinary HTML, so they wear the console's type scale at any width, stay
 * selectable, and land in the accessibility tree as text.
 */

export const SERIES = {
  navy: "#3b3f6e",
  violet: "#9a9ccb",
} as const;

const SURFACE = "#ede8dc";
const GRID = "rgba(43,43,47,0.12)";

/* ------------------------------------------------------------------ TREND */

export interface TrendPoint {
  label: string;
  value: number;
  /** Pre-formatted for the tooltip and the end label. */
  display: string;
}

/**
 * A single-series trend. No legend box: with one colour, the title already
 * says what is plotted, and a one-swatch legend just restates it.
 *
 * The end value is the only direct label - a number on every point is chaos
 * and goes unread. The rest live in the tooltip.
 */
export function TrendLine({
  points,
  max,
  ariaLabel,
}: {
  points: TrendPoint[];
  /** Domain top. Passed in so sibling charts can share a scale when it helps. */
  max: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const W = 640;
  const H = 156;
  // Right padding still reserves room for the end label, which now overlays in
  // HTML; bottom padding is small because the axis row sits below the SVG.
  const PAD = { top: 14, right: 64, bottom: 10, left: 8 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  if (points.length === 0) return null;

  const top = max > 0 ? max : 1;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / top) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;
  const last = points[points.length - 1];
  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Hairline, solid, recessive - never dashed. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={PAD.top + plotH * t}
            y2={PAD.top + plotH * t}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}

        <path d={area} fill={SERIES.navy} opacity={0.1} clipPath={`url(#${clipId})`} />
        <path
          d={line}
          fill="none"
          stroke={SERIES.navy}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End marker: >=8px, with a 2px surface ring so it stays legible. */}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r={5}
          fill={SERIES.navy}
          stroke={SURFACE}
          strokeWidth={2}
        />
        {/* Crosshair on hover. */}
        {hover !== null ? (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={GRID}
              strokeWidth={1}
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].value)}
              r={5}
              fill={SERIES.navy}
              stroke={SURFACE}
              strokeWidth={2}
            />
          </>
        ) : null}

        {/* Hit targets, bigger than the marks. */}
        {points.map((p, i) => (
          <rect
            key={p.label}
            x={x(i) - plotW / Math.max(points.length, 1) / 2}
            y={PAD.top}
            width={plotW / Math.max(points.length, 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

      </svg>

      {/* End value, placed over the plot in HTML so it never scales. */}
      <span
        className="pointer-events-none absolute text-[13px] font-semibold text-nevo-near-black/78"
        style={{
          left: `${((x(points.length - 1) + 10) / W) * 100}%`,
          top: `${(y(last.value) / H) * 100}%`,
          transform: "translateY(-50%)",
        }}
      >
        {last.display}
      </span>

      {/* First and last only - a tick per point is unreadable at this width. */}
      <div className="mt-1 flex justify-between text-[11.5px] text-nevo-near-black/50">
        <span>{points[0].label}</span>
        {points.length > 1 ? <span>{last.label}</span> : null}
      </div>

      {active ? (
        <div className="pointer-events-none absolute left-0 top-0 rounded-lg bg-nevo-near-black px-3 py-2 text-[12.5px] text-nevo-cream shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
          <span className="font-semibold">{active.display}</span>
          <span className="ml-2 opacity-70">{active.label}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- DUAL TRACK */

export interface DualTrackRow {
  key: string;
  label: string;
  /** 0..1 */
  concept: number;
  /** 0..1 */
  reading: number;
  meta?: string;
}

/**
 * Two series per row, so a legend is mandatory - and both are directly
 * labelled as well, which is also how the contrast WARN on violet is
 * discharged. A table view sits behind a toggle for the same reason.
 *
 * Values are shown as percentages here and NOT on the learner profile. The
 * distinction is deliberate: a figure against a cohort is a statistic, and a
 * figure against one child is a confidence score about that child, which D8b
 * forbids.
 */
export function DualTrackBars({ rows }: { rows: DualTrackRow[] }) {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Legend: always present at two or more series. */}
        <div className="flex items-center gap-4">
          {[
            ["Understands the idea", SERIES.navy],
            ["Handles the reading", SERIES.violet],
          ].map(([label, colour]) => (
            <span key={label} className="flex items-center gap-2 text-[12.5px] text-nevo-near-black/70">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ background: colour }}
              />
              {label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
        >
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50">
                <th className="py-2 pr-4">Concept</th>
                <th className="py-2 pr-4">Learners</th>
                <th className="py-2 pr-4">Understands the idea</th>
                <th className="py-2">Handles the reading</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-nevo-near-black/[0.07]">
                  <td className="py-2.5 pr-4 text-nevo-near-black">{r.label}</td>
                  <td className="py-2.5 pr-4 text-nevo-near-black/70">{r.meta ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nevo-near-black/70">{pct(r.concept)}</td>
                  <td className="py-2.5 text-nevo-near-black/70">{pct(r.reading)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {rows.map((r) => {
            /*
             * No "Reading is the barrier" label. It was drawn whenever the
             * concept track led the reading track by more than 0.15 - a
             * threshold this chart invented (architecture rule 3), turned
             * into a diagnosis the data never made.
             */
            return (
              <div
                key={r.key}
                onMouseEnter={() => setHover(r.key)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold text-nevo-near-black">
                    {r.label}
                  </span>
                  {hover === r.key && r.meta ? (
                    <span className="flex-none text-[12.5px] text-nevo-near-black/60">
                      {r.meta}
                    </span>
                  ) : null}
                </div>

                {/* 2px surface gap between the two adjacent bars, and the value
                    directly labelled at each tip. */}
                <div className="mt-2 flex flex-col gap-[2px]">
                  <Bar value={r.concept} colour={SERIES.navy} display={pct(r.concept)} />
                  <Bar value={r.reading} colour={SERIES.violet} display={pct(r.reading)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One bar: <=24px thick, 4px rounded data-end, square at the baseline. */
function Bar({
  value,
  colour,
  display,
}: {
  value: number;
  colour: string;
  display: string;
}) {
  const width = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-[2px] bg-nevo-near-black/[0.06]">
        <div
          className="h-full rounded-r-[4px]"
          style={{ width: `${width}%`, background: colour }}
        />
      </div>
      <span className={cn("w-10 flex-none text-right text-[12.5px] tabular-nums text-nevo-near-black/70")}>
        {display}
      </span>
    </div>
  );
}
