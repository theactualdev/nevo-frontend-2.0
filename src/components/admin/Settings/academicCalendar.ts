import type { SchoolTerm } from "@/lib/api/school";

/**
 * D12.3's term calendar: what a school may save, and what Nevo is actually
 * told when they do.
 *
 * Pure and separate from the screen because both halves of this had gone
 * wrong quietly.
 *
 * VALIDATION DID NOT EXIST. SCRUM-99: "Overlaps and gaps are surfaced as a
 * plain line under the offending row on blur, in navy not red ... Save stays
 * disabled while any row is unresolved, with a live count beside it." A school
 * could save a second term starting before the first one ended, and every
 * "this half-term" figure in the product resolves through this record.
 *
 * AND THE SAVE WROTE TO A FIELD NOTHING READS. `saveCalendar` sent
 * `yearStart`, `yearEnd` and `terms` - all three of which are OURS, invented
 * client-side and stored in a blob the backend passes through untouched. The
 * one field Nevo actually reads is `termStartDates`, whose own description
 * says: "Term start dates as ISO dates, earliest first ... fewer means Nevo
 * falls back to splitting the contract year evenly."
 *
 * So a school that carefully set three term dates in Settings had told Nevo
 * nothing at all, and every period figure in the product went on splitting
 * their year into equal thirds. `termStartDatesFrom` is what closes that.
 */

/** A term row whose dates we could not read is not evidence of anything. */
function at(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export type TermProblem =
  | { kind: "reversed" }
  | { kind: "overlap"; previous: string }
  | { kind: "half-outside" }
  | { kind: "half-reversed" };

export interface TermIssue {
  /** Index into the terms array, so the line renders under its own row. */
  index: number;
  problem: TermProblem;
  /** The line to show, in the spec's own shape. Navy, never red. */
  message: string;
}

/**
 * Every problem, in row order.
 *
 * A GAP IS NOT A PROBLEM. SCRUM-99 groups "overlaps and gaps" in one phrase,
 * but a Nigerian school year has real gaps in it - the frame's own fixture
 * runs First term to 11 December and Second from 11 January. Flagging the
 * holidays between terms as something to resolve would disable Save on a
 * correctly-configured calendar, which is worse than not checking. Only an
 * ORDER that cannot be true is an issue.
 */
export function termIssues(terms: SchoolTerm[]): TermIssue[] {
  const issues: TermIssue[] = [];

  terms.forEach((term, i) => {
    const start = at(term.start);
    const end = at(term.end);

    if (start !== null && end !== null && end < start) {
      issues.push({
        index: i,
        problem: { kind: "reversed" },
        message: `${term.name} ends before it starts.`,
      });
    }

    const previous = terms[i - 1];
    const previousEnd = at(previous?.end);
    if (start !== null && previousEnd !== null && start < previousEnd) {
      issues.push({
        index: i,
        problem: { kind: "overlap", previous: previous.name },
        // SCRUM-99's copy line: "Second term starts before First term ends."
        message: `${term.name} starts before ${previous.name} ends.`,
      });
    }

    const halfStart = at(term.halfTermStart);
    const halfEnd = at(term.halfTermEnd);
    if (halfStart !== null && halfEnd !== null && halfEnd < halfStart) {
      issues.push({
        index: i,
        problem: { kind: "half-reversed" },
        message: `The half-term break in ${term.name} ends before it starts.`,
      });
    }
    if (
      start !== null &&
      end !== null &&
      ((halfStart !== null && (halfStart < start || halfStart > end)) ||
        (halfEnd !== null && (halfEnd < start || halfEnd > end)))
    ) {
      issues.push({
        index: i,
        problem: { kind: "half-outside" },
        message: `The half-term break falls outside ${term.name}.`,
      });
    }
  });

  return issues;
}

/** The live count SCRUM-99 asks for beside a disabled Save. */
export function unresolvedLine(issues: TermIssue[]): string | null {
  if (issues.length === 0) return null;
  const rows = new Set(issues.map((i) => i.index)).size;
  return `${rows} ${rows === 1 ? "term needs" : "terms need"} a date sorted out.`;
}

/**
 * How many term starts Nevo stores. `AcademicConfig.termStartDates` carries
 * `maxItems: 3` and backend confirmed on 22 Sep that it stays there.
 *
 * It is not an arbitrary validation number and the reason is worth carrying:
 * **billing issues one invoice per term start, so a fourth date is a fourth
 * invoice.** A four-term calendar is a pricing decision before it is a
 * validation one, which is why the cap does not simply move.
 *
 * Exported so the form can stop at three rather than letting somebody enter a
 * fourth and meet a 422 - the schema advertises the limit precisely so the
 * inputs can be capped before anyone submits.
 */
export const TERM_STARTS_STORED = 3;

/**
 * The ISO dates Nevo reads, earliest first.
 *
 * `format: date`, so this emits `2026-09-14` and never a date-time.
 *
 * **IT NO LONGER TRUNCATES, AND THE TRUNCATION WAS OURS.** This used to end
 * `.slice(0, 3)`, under a `TODO(api)` blaming `maxItems: 3` for a four-term
 * school losing its fourth start. The cap was never what dropped it: backend
 * answers 422 for a fourth date and always did, so the request that would have
 * been refused **was never made**. We cut the fourth date off client-side and
 * then reported the save as a success.
 *
 * That is the worse half of the defect we filed against somebody else. A 422
 * is a school being told; a silent slice is a school being told the opposite
 * of what happened, by us, on the record every period figure in the product
 * resolves through.
 *
 * So the extra date now goes to the server and the server refuses it with a
 * message that says why. The form caps at `TERM_STARTS_STORED` so that
 * normally cannot arise; a calendar stored before the cap existed still can,
 * and must fail loudly rather than quietly.
 */
export function termStartDatesFrom(terms: SchoolTerm[]): string[] {
  return terms
    .map((t) => t.start)
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .filter((s) => !Number.isNaN(Date.parse(s)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .map((s) => s.slice(0, 10));
}
