import { holdStage, type AgeCheck } from "@/lib/api/ageChecks";
import type { AttentionFlag } from "@/lib/api/intelligence";
import type { ClassActivity } from "@/lib/api/school";
import type { AdminStudentRow } from "@/lib/api/students";

/**
 * "Worth a glance" — D04's three rows, all this school's now.
 *
 * All three were fixture once, under a note admitting it. The third ("classes
 * that haven't run a lesson") had no source and was ruled v1.5; since 9 Oct
 * `GET /school/overview` carries `classActivity`, each live class with the
 * latest lesson any of its learners started, and Olayinka took it up on 13 Oct
 * ("build all"). A class whose time is null is one where nobody has started a
 * lesson - which is what "hasn't run a lesson yet" says, and no more.
 *
 * EVERY COUNT HERE CAN BE ABSENT, AND ABSENT IS NOT ZERO. A read that failed, or
 * one we could not finish, returns `null` and the row does not render. The
 * alternative — a floor presented as a total — is the defect this screen has
 * already shipped once, when it told a school with no students that six were
 * waiting on parent consent.
 */

export interface GlanceRow {
  key: string;
  title: string;
  sub: string;
  action: string;
  href: string;
}

/**
 * Learners whose parent has been ASKED and has not replied.
 *
 * `pending` only. `not_sent` is a school that has not asked yet, which is not
 * the parent being waited on, and `withdrawn` is a decision rather than a wait.
 * The roster header counts something different on purpose — see
 * `withoutRecordedConsent`, which is every state but `confirmed`.
 *
 * `GET /api/v1/students` declares no `limit` or `offset`, so this is the whole
 * roster and the count is exact.
 */
export function awaitingParentReply(rows: AdminStudentRow[]): number {
  return rows.filter((r) => r.consent?.status === "pending").length;
}

/**
 * Learners carrying at least one flag nobody has marked as seen.
 *
 * DISTINCT LEARNERS, not flags. One child with three flags is one child, and
 * the row says "students" — reporting a flag count under that word would
 * overstate how many children are involved, on the row most likely to prompt a
 * SENCo conversation.
 */
export function learnersWithOpenFlags(flags: AttentionFlag[]): number {
  return new Set(flags.filter((f) => !f.acknowledged).map((f) => f.studentId))
    .size;
}

/**
 * The live rows, in D04's order, omitting any the data does not support.
 *
 * A count of zero omits its row too: "0 students are waiting on parent consent"
 * is not something worth a glance, and D04's list is things needing attention
 * rather than a dashboard of every figure.
 */
/** The classes nobody has started a lesson in, in the server's (name) order. */
export function classesWithoutALesson(activity: ClassActivity[]): string[] {
  return activity.filter((c) => c.lastActivityAt === null).map((c) => c.className);
}

/** How many class names the row spells out before "and N more". */
const NAMED_CLASSES = 3;

const AND = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

/** "JSS 1B and SSS 2 Arts", or "JSS 1A, JSS 1B, JSS 2A and 4 more". */
export function nameClasses(names: string[]): string {
  const rest = names.slice(NAMED_CLASSES);
  return AND.format(
    rest.length ? [...names.slice(0, NAMED_CLASSES), `${rest.length} more`] : names,
  );
}

/** "1 student is on hold for a date of birth check" - one wording, early and live. */
function holdTitle(n: number): string {
  return `${n} ${n === 1 ? "student is" : "students are"} on hold for a date of birth check`;
}

export function glanceRows(
  students: AdminStudentRow[] | null,
  flags: AttentionFlag[] | null,
  activity: ClassActivity[] | null = null,
  /** The checks holding an account (SCRUM-243), on the server's `blocksAccess`. */
  holds: AgeCheck[] | null = null,
): GlanceRow[] {
  const rows: GlanceRow[] = [];

  if (students) {
    const n = awaitingParentReply(students);
    if (n > 0) {
      rows.push({
        key: "consent",
        title: `${n} ${n === 1 ? "student is" : "students are"} waiting on parent consent`,
        // NOT "they can't begin lessons" - SCRUM-80 ruled the school warrants
        // consent through the DSA and the learner proceeds.
        sub: "They're learning as normal; your school's consent record is what's outstanding.",
        action: "Review in Students",
        href: "/admin/students",
      });
    }
  }

  // D04 (96cd4b4), second: children held for a date of birth check. A
  // deletion nobody can see coming is what must not happen, so the school
  // learns of it here as well as on Students.
  if (holds) {
    const n = holds.length;
    if (n > 0) {
      rows.push({
        key: "dob",
        title: holdTitle(n),
        sub: "Their accounts can’t start until the date is confirmed or corrected.",
        action: "Open date of birth checks",
        href: "/admin/students/date-of-birth",
      });
    }
  }

  if (flags) {
    const n = learnersWithOpenFlags(flags);
    if (n > 0) {
      rows.push({
        key: "flags",
        title: `${n} ${n === 1 ? "student has" : "students have"} a flag nobody has marked as seen`,
        // Says what the flag IS - something Nevo noticed that no adult has
        // acknowledged - rather than implying a concern has been raised about
        // the child. Zero-Tag: no characterisation, and no child is named.
        sub: "Learning Support lists them, with what Nevo noticed and when.",
        action: "Open Learning Support",
        href: "/admin/senco",
      });
    }
  }

  if (activity) {
    const quiet = classesWithoutALesson(activity);
    if (quiet.length > 0) {
      const n = quiet.length;
      rows.push({
        key: "classes",
        title: `${n} ${n === 1 ? "class hasn't" : "classes haven't"} run a lesson yet`,
        // D04's sub-line. Names the classes, never a teacher: the nudge is the
        // admin's to give, and nothing here says why a class is quiet.
        sub: `${nameClasses(quiet)} - might be worth a nudge to their teachers.`,
        action: "View Classes",
        href: "/admin/classes",
      });
    }
  }

  return rows;
}

/**
 * Whether a held child is waiting on the SCHOOL: not re-checked yet, or both
 * checks done and the dates still differ, which the school and the parent
 * settle together (D30 S5). A hold waiting only on the parent asks nothing
 * of the school, and "it needs you" would be untrue of it.
 */
export function holdsNeedSchool(holds: AgeCheck[] | null): boolean {
  return !!holds && holds.some((h) => holdStage(h) !== "parent");
}

/**
 * The early Overview's one "Worth a glance" row (D04, cb527bf, 27 Oct). A
 * child held in week one surfaces from day one, not once the school is live:
 * a deletion nobody can see coming is what must not happen. Only this row -
 * the live rows have nothing to say to a school that hasn't started.
 *
 * One child is named, from the roster this page already reads (the server's
 * first name if the roster can't). More than one keep the live row's words;
 * the frame draws only the one.
 */
export function earlyGlanceRows(
  students: AdminStudentRow[] | null,
  holds: AgeCheck[] | null,
): GlanceRow[] {
  if (!holds || holds.length === 0) return [];
  const one = holds.length === 1 ? holds[0] : null;
  const name = one
    ? students?.find((s) => s.id === one.studentId)?.name?.trim() ||
      one.studentFirstName?.trim() ||
      null
    : null;
  return [
    {
      key: "dob",
      title: holdTitle(holds.length),
      sub: name
        ? `${name} can’t start until the date is confirmed or corrected.${
            holdsNeedSchool(holds) ? " It’s waiting on you, even this early." : ""
          }`
        : "Their accounts can’t start until the date is confirmed or corrected.",
      action: "Open date of birth checks",
      href: "/admin/students/date-of-birth",
    },
  ];
}
