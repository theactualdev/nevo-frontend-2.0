import type { Invitation } from "@/lib/api/invites";
import type { EnrolmentBand, SchoolRosterCounts } from "@/lib/api/school";
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
 *  - A DENOMINATOR COMES FROM THE BAND, NEVER FROM A ROW COUNT. SCRUM-39:
 *    "Denominators come from the band seat ceiling, not from a count of rows."
 *    Counting rows would make "287 of 287" on every screen, which says nothing.
 *
 * WHAT THE PERIOD WORDS COST. The frame heads this section "Activity this week"
 * and describes the adaptation figure as "across all students this half-term".
 * Both come from SCRUM-39's data line, which asks for a period-scoped
 * `GET overview { period, classes_active/total, ... }`. No such endpoint is
 * deployed: `studentsProfiled`, `adaptationEventsLogged` and every
 * `SchoolRosterCounts` field are all-time or point-in-time, with no date filter
 * between them. So a period word in the heading would be a false statement
 * about all five figures beneath it, and the headings here are period-neutral
 * instead. See the TODO(api) on `OverviewView`.
 */

/** Populated. Deliberately not "this week" - see the note above. */
export const SNAPSHOT_HEADING = "Activity so far";

/** Early life. The frame's own wording, and already period-neutral. */
export const SNAPSHOT_HEADING_EARLY = "Where things stand";

export interface SnapshotTile {
  key: string;
  value: number;
  /** "of 250", or null when nothing entitles us to a denominator. */
  of: string | null;
  label: string;
  desc: string;
  /** D04's early-life zero treatment. Never true outside the early variant. */
  muted: boolean;
  /** Present only on the tile the frame draws a drill-down on. */
  href?: string;
  cta?: string;
}

/**
 * Band -> student ceiling, the commercial fact the denominators come from.
 *
 * SCRUM-39, verbatim: "Band -> student cutoff: boutique <=250, mid_market
 * 251-500, premium 501-800, enterprise 801+". Which makes ENTERPRISE UNCAPPED.
 * "801+" is a floor, not a ceiling, and there is no honest number to put after
 * "of" for it - so it gets none, exactly as `adminSeatAllowance` returns null
 * for a band it cannot read rather than guessing.
 *
 * TODO(api): a seat ceiling on the school record. This is the client's second
 * copy of a commercial table it does not own (see `SEATS_BY_BAND` in
 * `Team/adminScopes.ts`), and it is only right for as long as the two agree.
 */
export const STUDENT_CEILING_BY_BAND: Record<EnrolmentBand, number | null> = {
  boutique: 250,
  mid_market: 500,
  premium: 800,
  enterprise: null,
};

/** The school's student ceiling, or null when we cannot say. */
export function studentCeiling(band: EnrolmentBand | undefined): number | null {
  if (!band) return null;
  return STUDENT_CEILING_BY_BAND[band] ?? null;
}

export interface SnapshotInput {
  /** `audit.studentsProfiled`, or null when the audit could not be read. */
  studentsProfiled: number | null;
  /** The adaptation total, or null when we have not got one. */
  adaptations: number | null;
  counts: SchoolRosterCounts | null;
  band: EnrolmentBand | undefined;
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
  counts,
  band,
  early,
  pendingTeacherInvites: pendingTeachers = null,
}: SnapshotInput): SnapshotTile[] {
  const tiles: SnapshotTile[] = [];
  const mute = (n: number) => early && n === 0;

  if (typeof studentsProfiled === "number") {
    tiles.push({
      key: "profiled",
      value: studentsProfiled,
      of: null,
      label: "Students learning",
      desc: "have a live learning profile",
      muted: mute(studentsProfiled),
    });
  }

  if (typeof adaptations === "number") {
    tiles.push({
      key: "adaptations",
      value: adaptations,
      of: null,
      label: "Adaptations made",
      // The frame's early descriptor. A school that has not begun is not told
      // "across all students so far", which reads as a total that should be
      // higher; it is told when the figure will start moving.
      desc: early ? "once lessons begin" : "across all students so far",
      muted: mute(adaptations),
      href: "/admin/adaptations",
      cta: "See the log",
    });
  }

  if (typeof counts?.classes === "number") {
    tiles.push({
      key: "classes",
      value: counts.classes,
      of: null,
      label: "Classes",
      desc: "on your roster",
      muted: mute(counts.classes),
    });
  }

  if (typeof counts?.teachers === "number") {
    tiles.push({
      key: "teachers",
      value: counts.teachers,
      of: null,
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
    const ceiling = studentCeiling(band);
    tiles.push({
      key: "enrolled",
      value: counts.activeStudents,
      /*
       * The only tile with a source for a denominator. Classes and teachers
       * have no band ceiling anywhere in the contract, so the frame's "of 14"
       * and "of 20" stay unbuilt rather than invented.
       *
       * A school OVER its band renders "312 of 250", plainly and in the same
       * treatment as any other. SCRUM-39 leaves "what does the Overview show
       * when active students exceed the band" open; until it is answered, the
       * true numbers with no alarm treatment is the answer that cannot mislead.
       */
      of: ceiling === null ? null : `of ${ceiling}`,
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
