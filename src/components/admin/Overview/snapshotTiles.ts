import type { Invitation } from "@/lib/api/invites";
import type { SchoolRosterCounts } from "@/lib/api/school";
import { longDate } from "@/lib/dates";
import { normaliseStatus } from "../Invitations/inviteStatus";

/**
 * D04's activity snapshot, derived rather than asserted.
 *
 * Pure and separate from the screen for the same reason `overviewGlance.ts` and
 * `itHomeRows.ts` are: every tile here is a claim about a school, and the rules
 * that decide what a tile may say are far easier to test than to eyeball.
 *
 * THREE RULES, EACH OF WHICH THE SCREEN GOT WRONG ONCE:
 *
 *  - A MISSING COUNT IS NOT ZERO. Every field on `SchoolRosterCounts` is
 *    optional and every read behind one can fail. A tile with nothing behind it
 *    is absent; it never renders as 0, which would tell a school of 300 that it
 *    has no students.
 *  - MUTING IS AN EARLY-LIFE TREATMENT ONLY. SCRUM-39 is explicit that a zero
 *    reads as early rather than broken - and equally explicit that the
 *    COMPLIANCE zero must stay at full weight navy for ever, because that one
 *    is the intended reading and must never look like missing data. That card
 *    is not built from this file, and must not be.
 *
 * NO DENOMINATORS (Lydia, 7 Oct). "Students enrolled" used to read "of 250",
 * from the band's seat ceiling. Pricing is flat and billed on the roster count,
 * so there is no allowance to count against: the roster is the number.
 *
 * "ADAPTATIONS MADE" IS THIS TERM'S, AND SAYS WHICH (Lydia, 7 Oct). A total
 * since setup is meaningless by the second year. The caller reads the term
 * the school set in Settings and passes the count and its name; with no term
 * to name, the live tile is absent rather than an all-time figure.
 *
 * WHAT THE PERIOD WORDS COST. The frame heads this section "Activity this week"
 * and describes the adaptation figure as "across all students this half-term".
 * Both come from SCRUM-39's data line, which asks for a period-scoped
 * `GET overview { period, classes_active/total, ... }`. No such endpoint is
 * deployed: `studentsProfiled` and every `SchoolRosterCounts` field are
 * all-time or point-in-time. Only the adaptation count can be asked for by date
 * (the log's `dateFrom`), so only that tile names a period, in its own line. A
 * period word in the heading would be a false statement about the other
 * figures, and the headings stay period-neutral. See the TODO(api) on
 * `OverviewView`.
 */

/** Populated. Deliberately not "this week" - see the note above. */
export const SNAPSHOT_HEADING = "Activity so far";

/** Early life. The frame's own wording, and already period-neutral. */
export const SNAPSHOT_HEADING_EARLY = "Where things stand";

export interface SnapshotTile {
  key: string;
  value: number;
  label: string;
  desc: string;
  /** D04's early-life zero treatment. Never true outside the early variant. */
  muted: boolean;
  /** Present only on the tile the frame draws a drill-down on. */
  href?: string;
  cta?: string;
}

export interface SnapshotInput {
  /** `audit.studentsProfiled`, or null when the audit could not be read. */
  studentsProfiled: number | null;
  /**
   * The adaptation figure, or null when we have not got one: the all-time
   * total in the early state (it is zero there), this term's count otherwise.
   */
  adaptations: number | null;
  /**
   * The period a live school's count covers - "in First term", "since 8
   * September". Null when the school has no term to name, and then the live
   * tile is absent: an unnamed total is the "since setup" figure ruled out.
   */
  adaptationPeriod?: string | null;
  counts: SchoolRosterCounts | null;
  /** The early-life variant, decided by the caller from the adaptation log. */
  early: boolean;
  /**
   * Teacher invitations still open - see `pendingTeacherInvites`. Null or
   * absent when the invitations could not be read; then the tile says nothing
   * about invitations rather than implying there are none.
   */
  pendingTeacherInvites?: number | null;
}

/**
 * How the adaptations tile names its period: the school's own term name, or
 * the day the term began when the row has no name.
 */
export function termPeriod(term: { name: string; from: string }): string {
  return term.name ? `in ${term.name}` : `since ${longDate(term.from) ?? term.from}`;
}

/**
 * D04's "2 invitations pending" under the teachers figure.
 *
 * `SchoolRosterCounts` carries `invitedStudents` and nothing for teachers, so
 * this is read from the invitations themselves: teacher invitations that are
 * still live, judged the way D19 judges them - a pending invitation past its
 * date is expired, whatever the row says.
 */
export function pendingTeacherInvites(invites: readonly Invitation[], now: number): number {
  return invites.filter(
    (i) =>
      (i.role ?? "").toLowerCase() === "teacher" &&
      normaliseStatus(i.status, i.expiresAt, now) === "pending",
  ).length;
}

export function snapshotTiles({
  studentsProfiled,
  adaptations,
  adaptationPeriod = null,
  counts,
  early,
  pendingTeacherInvites: pendingTeachers = null,
}: SnapshotInput): SnapshotTile[] {
  const tiles: SnapshotTile[] = [];
  const mute = (n: number) => early && n === 0;

  if (typeof studentsProfiled === "number") {
    tiles.push({
      key: "profiled",
      value: studentsProfiled,
      label: "Students learning",
      desc: "have a live learning profile",
      muted: mute(studentsProfiled),
    });
  }

  if (typeof adaptations === "number" && (early || adaptationPeriod)) {
    tiles.push({
      key: "adaptations",
      value: adaptations,
      label: "Adaptations made",
      // The frame's early descriptor. A school that has not begun is told when
      // the figure will start moving; a live one is told which term it covers.
      desc: early ? "once lessons begin" : `across all students ${adaptationPeriod}`,
      muted: mute(adaptations),
      href: "/admin/adaptations",
      cta: "See the log",
    });
  }

  if (typeof counts?.classes === "number") {
    tiles.push({
      key: "classes",
      value: counts.classes,
      label: "Classes",
      desc: "on your roster",
      muted: mute(counts.classes),
    });
  }

  if (typeof counts?.teachers === "number") {
    tiles.push({
      key: "teachers",
      value: counts.teachers,
      label: "Teachers",
      /*
       * "N invitations pending", the frame's words - NOT "N more invited".
       * An invited teacher may already be a user in the headcount above, so
       * "more" could count one person twice. This says only that invitations
       * are open, which the invitations themselves establish.
       */
      desc:
        typeof pendingTeachers === "number" && pendingTeachers > 0
          ? `${pendingTeachers} ${pendingTeachers === 1 ? "invitation" : "invitations"} pending`
          : "with a Nevo account",
      muted: mute(counts.teachers),
    });
  }

  if (typeof counts?.activeStudents === "number") {
    tiles.push({
      key: "enrolled",
      value: counts.activeStudents,
      label: "Students enrolled",
      desc:
        typeof counts.invitedStudents === "number" && counts.invitedStudents > 0
          ? `${counts.invitedStudents} more invited, not yet joined`
          : "active on your roster",
      muted: mute(counts.activeStudents),
    });
  }

  return tiles;
}

/**
 * The desktop column count, as a class the compiler can actually see.
 *
 * The frame lays the tiles out as one flex row of `flex:1 1 0` children, so
 * however many there are they form a single row at 1440 - and this screen
 * renders between two and five of them depending on which reads returned.
 * Tailwind cannot generate `xl:grid-cols-${n}`, so the handful of real answers
 * are written out and picked between.
 *
 * `xl`, not `lg`: 1280 is this console's own desktop boundary (the sidebar
 * rail's `(min-width: 1280px)`), so 1024x768 keeps the 2 x 2 the spec asks for.
 */
export function snapshotColumns(count: number): string {
  if (count >= 5) return "xl:grid-cols-5";
  if (count === 4) return "xl:grid-cols-4";
  if (count === 3) return "xl:grid-cols-3";
  return "";
}
