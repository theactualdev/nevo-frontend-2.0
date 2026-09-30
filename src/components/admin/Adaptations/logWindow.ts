import type { SchoolTerm } from "@/lib/api/school";

/**
 * D21's "When" filter: This week, This half-term, Custom range…
 *
 * It offered rolling 7, 30 and 120 days, and called the 120 "This term" - a
 * window that was never the school's term, labelled as though it were. The
 * frame's three options replace them, and each resolves to dates the log
 * endpoint takes (`dateFrom`, and for a custom range `dateTo`, which this
 * screen had never sent).
 *
 * THE HALF-TERM IS THE SCHOOL'S, OR IT IS NOTHING. It comes from the terms a
 * school set in Settings - "Your terms decide what 'this half-term' means
 * everywhere in Nevo" - and a term with no half-term dates has no half-term
 * this screen can name. Then the choice says so and points at Settings,
 * rather than splitting the term in two and calling that the school's.
 */

export type RangeChoice =
  | { kind: "week" }
  | { kind: "half-term" }
  /** Both `yyyy-mm-dd`, as a date input gives them. */
  | { kind: "custom"; from: string; to: string };

/**
 * The half-term today falls in, as the day it began (`yyyy-mm-dd`) - or why
 * there is none: today is outside every term, or this term has no half-term
 * dates recorded.
 */
export type HalfTerm = { from: string } | { missing: "term" | "half-term" };

/** Local midnight of a `yyyy-mm-dd` - what a school means by that day. */
export function startOfDay(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.slice(0, 10));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(ymd: string): Date | null {
  const d = startOfDay(ymd);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/** `yyyy-mm-dd` for a local date - what a date input reads and writes. */
export function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Which half of which term `now` is in.
 *
 * Before the break, the first half, from the term's start. After it, the
 * second half, from the break's last day. DURING the break, the first half
 * still - it is the half-term that has just run, and the break itself holds
 * no lessons to show. Outside every term, or in a term with no half-term
 * dates, there is no half-term to name, and it says which.
 */
export function currentHalfTerm(terms: SchoolTerm[], now: number): HalfTerm {
  for (const term of terms) {
    const start = startOfDay(term.start);
    const end = endOfDay(term.end);
    if (!start || !end || now < start.getTime() || now > end.getTime()) continue;
    const breakStart = term.halfTermStart ? startOfDay(term.halfTermStart) : null;
    const breakEnd = term.halfTermEnd ? endOfDay(term.halfTermEnd) : null;
    if (!breakStart || !breakEnd) return { missing: "half-term" };
    return now > breakEnd.getTime()
      ? { from: term.halfTermEnd!.slice(0, 10) }
      : { from: term.start.slice(0, 10) };
  }
  return { missing: "term" };
}

/** Why a custom range cannot be sent, or null when it can. */
export function customProblem(from: string, to: string): string | null {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (!a || !b) return "Choose both dates.";
  if (a.getTime() > b.getTime()) return "The start date is after the end date.";
  return null;
}

/**
 * The query window for a choice, or null when there is nothing honest to ask
 * for - a half-term the school has not set, a range with a problem.
 */
export function windowFor(
  choice: RangeChoice,
  now: number,
  halfTerm: HalfTerm | null,
): { dateFrom: string; dateTo?: string } | null {
  if (choice.kind === "week") {
    return { dateFrom: new Date(now - 7 * 864e5).toISOString() };
  }
  if (choice.kind === "half-term") {
    const from = halfTerm && "from" in halfTerm ? startOfDay(halfTerm.from) : null;
    return from ? { dateFrom: from.toISOString() } : null;
  }
  if (customProblem(choice.from, choice.to)) return null;
  return {
    dateFrom: startOfDay(choice.from)!.toISOString(),
    dateTo: endOfDay(choice.to)!.toISOString(),
  };
}

function short(ymd: string, withYear: boolean): string {
  const d = startOfDay(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** The words the count line and the empty state use for the window. */
export function rangeWords(choice: RangeChoice): string {
  if (choice.kind === "week") return "in the last 7 days";
  if (choice.kind === "half-term") return "this half-term";
  const sameYear = choice.from.slice(0, 4) === choice.to.slice(0, 4);
  return choice.from === choice.to
    ? `on ${short(choice.from, true)}`
    : `between ${short(choice.from, !sameYear)} and ${short(choice.to, true)}`;
}
