import type { AttentionFlag } from "@/lib/api/intelligence";
import type { AdminStudentRow } from "@/lib/api/students";

/**
 * "Worth a glance" — the two rows that are this school's, and the one that is not.
 *
 * D04 draws three. All three were fixture, under a note admitting it. Two have
 * sources and are computed here; the third ("classes that haven't run a lesson")
 * has none, and the nearest proxy is one adaptation-log call per class, which is
 * a different claim. It is not drawn: an invented row, even under a note, is
 * still a school being shown class names that are not theirs.
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
export function glanceRows(
  students: AdminStudentRow[] | null,
  flags: AttentionFlag[] | null,
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

  return rows;
}
