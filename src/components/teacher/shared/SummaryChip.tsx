import { cn } from "@/lib/utils";

/**
 * C08's summary chips and C05's header counts, drawn once. See
 * `summaryState.ts` for what each state means and where it is read from.
 *
 * Fills carry the weight, so the states someone is waiting on read first;
 * Worth a glance, the lowest priority, is the quietest - an outline. Design
 * says never invert this.
 */

export type ChipState = "glance" | "flagged" | "sudden" | "cantSignIn";

const LABEL: Record<ChipState, string> = {
  glance: "Worth a glance",
  flagged: "Flagged",
  sudden: "Sudden change",
  cantSignIn: "Can't sign in",
};

/** The chip board's arrow: small and non-alarming, not a warning sign. */
function SuddenGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v9" />
      <path d="M8 11l4 4 4-4" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function SummaryChip({
  state,
  className,
}: {
  state: ChipState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 text-[12.5px] font-semibold whitespace-nowrap",
        state === "glance" &&
          "border-[1.5px] border-nevo-violet bg-transparent px-[11px] text-nevo-navy",
        state === "flagged" && "bg-nevo-navy px-[11px] text-nevo-cream",
        state === "sudden" && "bg-nevo-navy pr-[11px] pl-2.5 text-nevo-cream",
        state === "cantSignIn" &&
          "bg-nevo-navy/10 pr-[11px] pl-[9px] text-nevo-near-black/72",
        className,
      )}
    >
      {state === "sudden" && <SuddenGlyph />}
      {state === "cantSignIn" && <LockGlyph />}
      {LABEL[state]}
    </span>
  );
}

/** C05's header count: a dot in the state's own treatment, and the number. */
export function SummaryCount({
  state,
  count,
}: {
  state: "glance" | "flagged" | "cantSignIn";
  count: number;
}) {
  const words =
    state === "glance"
      ? "worth a glance"
      : state === "flagged"
        ? "flagged"
        : "can’t sign in";
  return (
    <span className="flex items-center gap-[7px]">
      <span
        aria-hidden
        className={cn(
          "size-[9px] shrink-0 rounded-full",
          state === "glance" && "border-2 border-nevo-violet bg-transparent",
          state === "flagged" && "bg-nevo-navy",
          state === "cantSignIn" && "bg-nevo-near-black/28",
        )}
      />
      <span
        className={cn(
          "text-[13.5px]",
          state === "cantSignIn"
            ? "font-medium text-nevo-near-black/60"
            : "text-nevo-near-black/65",
        )}
      >
        {`${count} ${words}`}
      </span>
    </span>
  );
}
