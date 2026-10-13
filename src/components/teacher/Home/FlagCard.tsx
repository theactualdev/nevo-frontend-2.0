import Link from "next/link";
import type { EvidenceBar, HomeFlag } from "@/lib/mocks/teacherHome";
import { cn } from "@/lib/utils";

/**
 * One "Worth your attention" card (C03 / `Nevo Teacher Home` frame). A sudden
 * change carries the navy drop glyph and navy accent; pattern flags carry the
 * violet accent. Desktop sets the evidence in a row under the note - the bars
 * and their caption side by side - then the actions; tablet inlines smaller
 * bars beside the primary action. Evidence is never dropped, only compressed.
 *
 * THE 184px PANEL IS GONE (design, 12 Oct). `Nevo Teacher Home` used to pair
 * the note with an evidence panel on the right; the updated frame moves the
 * bars under the note at 34px high and caps the note at 640.
 */

function barColor(mark: EvidenceBar[1]): string {
  if (mark === "accent") return "bg-nevo-navy";
  if (mark === "soft") return "bg-nevo-violet";
  return "bg-nevo-navy/22";
}

function Bars({ bars, small }: { bars: readonly EvidenceBar[]; small: boolean }) {
  return (
    <div
      className={cn(
        "flex items-end",
        small ? "h-7 gap-1" : "h-[34px] gap-[5px]",
      )}
    >
      {bars.map(([height, mark], i) => (
        <span
          key={i}
          style={{ height: `${height}%` }}
          className={cn(
            "block rounded-[3px]",
            small ? "w-1.5" : "w-[7px]",
            barColor(mark),
          )}
        />
      ))}
    </div>
  );
}

const DROP_GLYPH = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 5v9" />
    <path d="M8 11l4 4 4-4" />
  </svg>
);

export function FlagCard({ flag }: { flag: HomeFlag }) {
  return (
    <div className="relative flex gap-3.5 rounded-[12px] bg-nevo-cream-elevated py-4 pr-[18px] pl-[22px] shadow-elevation-1 xl:gap-[18px] xl:py-[22px] xl:pr-6 xl:pl-7">
      {/* Accent - navy for a sudden change, violet for a pattern */}
      <span
        className={cn(
          "absolute inset-y-4 left-0 w-[3px] rounded-full",
          flag.isSudden ? "bg-nevo-navy" : "bg-nevo-violet",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 xl:gap-[9px]">
          {flag.isSudden && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream xl:size-[22px]">
              {DROP_GLYPH}
            </span>
          )}
          <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[16.5px]">
            {flag.name}
          </span>
          <span className="text-[12.5px] text-nevo-near-black/50 xl:text-[13px]">
            {flag.context}
          </span>
        </div>
        <p className="mt-[7px] text-[14.5px] leading-[1.5] text-nevo-near-black/82 xl:mt-[9px] xl:max-w-[640px] xl:text-[15.5px] xl:leading-[1.55]">
          {flag.note}
        </p>

        {/* Desktop: the evidence row, under the note. */}
        <div className="mt-3.5 hidden items-end gap-3.5 xl:flex">
          <Bars bars={flag.evidence} small={false} />
          <span className="pb-0.5 text-[12px] text-nevo-near-black/50">
            {flag.evidenceLabel}
          </span>
        </div>

        {/* Tablet: inline bars + primary action; desktop: action row only */}
        <div className="mt-3 flex items-center justify-between gap-3 xl:hidden">
          <Bars bars={flag.evidence} small />
          <Link
            href={flag.actionHref}
            className="shrink-0 text-[13.5px] font-semibold whitespace-nowrap text-nevo-navy"
          >
            {flag.actionLabel} →
          </Link>
        </div>
        <div className="mt-4 hidden items-center gap-[18px] xl:flex">
          <Link
            href={flag.actionHref}
            className="text-[14.5px] font-semibold text-nevo-navy transition-transform active:scale-[0.985]"
          >
            {flag.actionLabel}
            <span className="ml-1.5">→</span>
          </Link>
          <Link
            href={flag.secondaryHref}
            className="text-sm text-nevo-near-black/55 transition-transform active:scale-[0.985]"
          >
            {flag.secondaryLabel}
          </Link>
        </div>
      </div>

    </div>
  );
}
