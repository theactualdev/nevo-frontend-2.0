import { cn } from "@/lib/utils";
import type { RosterCounts } from "./summaryState";

/**
 * A class card's summary line on Home (C03) and My Classes (C05).
 *
 * One dot, in the strongest state's own treatment from the chip system
 * (`SummaryChip.tsx`): Flagged a navy fill, Worth a glance the violet outline,
 * Can't sign in muted grey, nothing open the quiet navy. Then the counts,
 * each state on its own and never summed (design, 12 Oct).
 */
export type SummaryTone = "flagged" | "glance" | "cantSignIn" | "ok";

export function summaryTone(c: RosterCounts, withSignIn: boolean): SummaryTone {
  if (c.flagged > 0) return "flagged";
  if (c.glance > 0) return "glance";
  if (withSignIn && c.cantSignIn > 0) return "cantSignIn";
  return "ok";
}

export function SummaryDot({ tone }: { tone: SummaryTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-[9px] shrink-0 rounded-full",
        // Worth a glance is an outline (design, 12 Oct).
        tone === "glance" && "border-2 border-nevo-violet",
        tone === "flagged" && "bg-nevo-navy",
        tone === "cantSignIn" && "bg-nevo-near-black/28",
        tone === "ok" && "bg-nevo-navy/30",
      )}
    />
  );
}

function join(parts: (string | false)[], calm: string): string {
  const said = parts.filter((p): p is string => p !== false);
  return said.length > 0 ? said.join(" · ") : calm;
}

/**
 * C03's words: who is worth a look, or "All on track". The frame draws only
 * Worth a glance there; a sudden change is Flagged's variant (C05 counts it as
 * "1 flagged"), and leaving it out would call that class on track.
 */
export function homeSummary(c: RosterCounts, short = false): string {
  return join(
    [
      c.glance > 0 && (short ? `${c.glance} to glance` : `${c.glance} worth a glance`),
      c.flagged > 0 && `${c.flagged} flagged`,
    ],
    short ? "On track" : "All on track",
  );
}

/** C05's words, which add who can't sign in, or "Everyone on track". */
export function listSummary(c: RosterCounts): string {
  return join(
    [
      c.glance > 0 && `${c.glance} worth a glance`,
      c.flagged > 0 && `${c.flagged} flagged`,
      c.cantSignIn > 0 && `${c.cantSignIn} can’t sign in`,
    ],
    "Everyone on track",
  );
}
