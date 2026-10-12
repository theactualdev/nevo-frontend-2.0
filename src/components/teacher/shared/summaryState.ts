import { accountStatus } from "@/lib/constants/accountStatus";

/**
 * THE SUMMARY CHIP SYSTEM (design, 12 Oct - `CLAUDE-reference.md` and C08's
 * "Summary chips" board): three states, never merged, never one combined
 * number.
 *
 * - Worth a glance - Nevo noticed something. Soft-violet OUTLINE, the quietest.
 * - Flagged - a person raised the child for learning support. Navy FILL.
 *   Sudden change is the Flagged variant with a glyph, and outranks the rest.
 * - Can't sign in - the child is locked out. Muted grey. Rows and headers
 *   only, never the profile chip.
 *
 * WHAT EACH STATE IS READ FROM, and the one that is not read at all:
 *
 * - Worth a glance and Sudden change come from Nevo's attention flags
 *   (`/api/intelligence/flags`): a `sudden_change` flag is a sudden change,
 *   anything else open is worth a glance. Nothing here decides either - the
 *   engine raised the flag, the type says which.
 * - Flagged, the person-raised kind, is an escalation, and a teacher cannot
 *   read escalations back: `GET /api/v1/escalations` is the SENCo's inbox and
 *   is untested for a teacher (see `lib/api/escalations.ts`). Absence is an
 *   instruction, so no plain Flagged state is produced until the contract
 *   carries one. The header's "flagged" count is the sudden changes, which
 *   design draws as Flagged's own variant (C05 counts Tunde, the sudden
 *   change, as its "1 flagged").
 * - Can't sign in is a deactivated account, or an active one that asked for a
 *   new PIN nobody has cleared yet. `invited` is not in it: an account nobody
 *   has opened is "hasn't started", not "cannot get in".
 */

export type AttentionState = "sudden" | "glance";

/**
 * One state per child, the strongest of their open flags: a child with a
 * sudden change and a standing pattern is a sudden change. A plain map over
 * the flag list let whichever came LAST win, so the same child could read
 * "Worth a glance" on one visit and "Sudden change" on the next.
 */
export function attentionByStudent(
  flags: readonly { studentId: string; isSudden: boolean }[],
): Map<string, AttentionState> {
  const out = new Map<string, AttentionState>();
  for (const f of flags) {
    if (f.isSudden) out.set(f.studentId, "sudden");
    else if (!out.has(f.studentId)) out.set(f.studentId, "glance");
  }
  return out;
}

export interface RosterCounts {
  glance: number;
  /** Sudden changes - see the note above on the person-raised kind. */
  flagged: number;
  cantSignIn: number;
}

export interface CountableStudent {
  studentId: string;
  status: string | null | undefined;
  pinResetRequested?: boolean;
  pinCleared?: boolean;
}

/**
 * The class header's three counts. Each state is counted on its own: a
 * child who forgot their PIN and has a pattern open is in both, because the
 * row's precedence (C05: account, then PIN, then attention) decides what ONE
 * row shows, not what is true of the class.
 *
 * A switched-off child's flag is history, not a prompt, so a deactivated
 * child counts only as unable to sign in.
 */
export function rosterCounts(
  students: readonly CountableStudent[],
  attention: ReadonlyMap<string, AttentionState>,
  clearedThisVisit: ReadonlySet<string> = new Set(),
): RosterCounts {
  let glance = 0;
  let flagged = 0;
  let cantSignIn = 0;
  for (const s of students) {
    const account = accountStatus(s.status);
    if (account === "deactivated") {
      cantSignIn += 1;
      continue;
    }
    if (
      account === "active" &&
      s.pinResetRequested === true &&
      s.pinCleared !== true &&
      !clearedThisVisit.has(s.studentId)
    ) {
      cantSignIn += 1;
    }
    const a = attention.get(s.studentId);
    if (a === "sudden") flagged += 1;
    else if (a === "glance") glance += 1;
  }
  return { glance, flagged, cantSignIn };
}

/**
 * The ONE chip a profile shows, in design's strict precedence: Sudden change,
 * then Flagged, then Worth a glance. Can't sign in never appears here.
 * Flagged has no source a teacher can read (above), so it never wins yet.
 */
export function profileChip(
  open: readonly { isSudden: boolean }[],
): AttentionState | null {
  if (open.some((f) => f.isSudden)) return "sudden";
  return open.length > 0 ? "glance" : null;
}
