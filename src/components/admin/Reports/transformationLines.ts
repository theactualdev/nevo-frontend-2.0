import type { CohortIndicator } from "@/lib/api/analytics";

/**
 * The words around D26's school-wide figures - kept pure so what each one may
 * claim is tested rather than eyeballed.
 *
 * NOTHING HERE COMPUTES (architecture rule 3). Every number is the server's,
 * shown as it came; the only decision made is which sentence fits the
 * server's own `trend`. "+3 this month", which D26 draws, would be our own
 * subtraction, so the comparison names the earlier figure instead.
 */

/** A server number as written: no rounding, no padding. */
export function figure(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

/**
 * Where a figure stands against the four weeks before, in the server's terms.
 *
 * `trend` is better-or-behind, not higher-or-lower: for time to finish a
 * lesson, fewer minutes is "up". So this never says "rose" or "fell" - it
 * could not know which without working it out. Null when there is nothing to
 * compare with, which renders as no line at all.
 */
export function comparisonLine(ind: CohortIndicator, unit: string): string | null {
  if (ind.previous === null || ind.trend === "unknown") return null;
  const before = `${figure(ind.previous)}${unit}`;
  if (ind.trend === "up") return `Better than the four weeks before (${before})`;
  if (ind.trend === "down") return `Behind the four weeks before (${before})`;
  return `Much the same as the four weeks before (${before})`;
}

/** "Across 240 students" - a figure whose cohort is unstated cannot be argued with. */
export function acrossLine(learnerCount: number): string {
  return `Across ${figure(learnerCount)} ${learnerCount === 1 ? "student" : "students"}`;
}
