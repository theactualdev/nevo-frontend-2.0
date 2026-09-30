/**
 * D04's early-life "Set up 3 days ago" and "joined Nevo three days ago".
 *
 * From `onboarding.completedAt`, which the wizard's handover writes the
 * moment a school finishes setting up. CALENDAR DAYS in the school's own
 * time, not rolling hours: a school that finished at 11pm and opens the
 * Overview at 8am was set up yesterday, and `timeAgo`'s "9 hours ago" would
 * not be what D04 says. Null when the date is missing or unreadable - a
 * school that set up before the field existed is told nothing about when,
 * rather than something wrong.
 */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export interface SetUpAgo {
  /** The header's form - "3 days ago". */
  short: string;
  /** The welcome's form, numbers written out to ten - "three days ago". */
  prose: string;
}

export function setUpAgo(iso: string | null | undefined, now: number): SetUpAgo | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(then)) / 864e5);
  // A date in the future is a clock disagreement, not a school from tomorrow.
  if (days < 0) return null;
  if (days === 0) return { short: "today", prose: "today" };
  if (days === 1) return { short: "yesterday", prose: "yesterday" };
  return {
    short: `${days} days ago`,
    prose: `${days <= 10 ? WORDS[days] : days} days ago`,
  };
}
