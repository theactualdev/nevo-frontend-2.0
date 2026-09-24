import type { AdminClass } from "@/lib/api/classes";
import { yearGroupLabel, yearGroupOrder } from "@/lib/constants/yearGroups";

/**
 * D05's list, grouped by year group.
 *
 * The 20 September drop restructured this screen: the Year COLUMN is gone and
 * the rows sit under year-group headings instead. That is not decoration - a
 * Nigerian secondary school runs twelve to thirty classes across six years, and
 * a flat list of thirty sorted rows makes "which JSS 2 classes do we have?"
 * a scanning exercise.
 *
 * SORTED BY THE CURRICULUM, NOT THE ALPHABET. `yearGroupOrder` puts JSS 1
 * before JSS 2 before SS 1; `localeCompare` on the labels would put SS before
 * JSS and read as an error to every Nigerian school.
 */

export interface YearGroupSection {
  /** The heading. Null year groups get their own honest label. */
  label: string;
  /** Stable across renders, and distinct from a year group that could be "". */
  key: string;
  classes: AdminClass[];
}

/**
 * An UNGROUPED class is not an error and not a hidden one.
 *
 * `AdminClass.yearGroup` is nullable and a roster import can produce one - a
 * class whose name Nevo read but whose year it could not place. It gets a
 * section of its own at the END rather than being dropped, because a class
 * missing from a list a school is checking against its own records is the
 * worst outcome available here.
 */
const UNGROUPED_KEY = "\u0000ungrouped";
const UNGROUPED_LABEL = "No year group";

export function groupByYear(classes: AdminClass[]): YearGroupSection[] {
  const sections = new Map<string, YearGroupSection>();

  for (const c of classes) {
    const key = c.yearGroup ?? UNGROUPED_KEY;
    const existing = sections.get(key);
    if (existing) {
      existing.classes.push(c);
      continue;
    }
    sections.set(key, {
      key,
      /*
       * `yearGroupLabel` RETURNS THE RAW VALUE FOR A YEAR GROUP IT DOES NOT
       * KNOW, which has already cost this codebase once - `composeClassNames`
       * carries the same warning. Here that behaviour is what we want: a
       * school whose import produced "Grade 7" sees "Grade 7" rather than
       * having its classes swept into "No year group".
       */
      label: c.yearGroup ? (yearGroupLabel(c.yearGroup) ?? c.yearGroup) : UNGROUPED_LABEL,
      classes: [c],
    });
  }

  const ordered = [...sections.values()].sort((a, b) => {
    // Ungrouped last, whatever it would sort as.
    if (a.key === UNGROUPED_KEY) return 1;
    if (b.key === UNGROUPED_KEY) return -1;
    return (
      yearGroupOrder(a.key) - yearGroupOrder(b.key) ||
      a.label.localeCompare(b.label)
    );
  });

  for (const s of ordered) {
    s.classes.sort((a, b) => a.name.localeCompare(b.name));
  }
  return ordered;
}

/**
 * "2026/27 session" for the list header, or null.
 *
 * READ FROM THE CLASSES, NEVER FROM THE CLOCK. The frame prints a session
 * beside "grouped by year group", and the honest source is what the classes
 * themselves carry - `academicSession` landed on `ClassSummaryResponse` and was
 * being discarded until 23 Sep.
 *
 * Null when the school's classes disagree, or when none of them says. A single
 * session stated over a list containing two would be a caption that is wrong
 * about half the rows, and "this year" computed from `new Date()` would be a
 * claim the data never made.
 */
export function sessionLabel(classes: AdminClass[]): string | null {
  const sessions = new Set(
    classes.map((c) => c.academicSession).filter((s): s is string => !!s),
  );
  return sessions.size === 1 ? [...sessions][0] : null;
}
