import type { RosterSyncHistory, RosterSyncRun, SsoStatus } from "@/lib/api/sso";
import { latestRun } from "@/lib/rosterSync";

/**
 * What the IT home puts under "Worth a glance", derived rather than asserted.
 *
 * Pure and separate from the screen because every row here is a claim about a
 * school's sign-in, and the rules are easier to test than to eyeball:
 *
 *  - A NEUTRAL row is not an attention item. It reports that the last sync went
 *    fine. It must not be counted in "N things worth a glance", or a healthy
 *    school is told it has something to look at.
 *  - `partial_manual_review` IS an attention item. The enum has four values and
 *    an earlier draft of this handled three; a run the provider explicitly
 *    named "manual review" produced no row at all, and the hero then said
 *    nothing needed attention.
 *  - A FAILED HISTORY READ is not evidence of health. It suppresses the
 *    reassuring clause rather than passing for a clean run - the same defect
 *    D10 was corrected for, where `failedRuns ?? 0` coalesced an unread history
 *    into "Healthy".
 */

export type RowKind = "soft" | "flag" | "neutral";

export interface GlanceRow {
  key: string;
  kind: RowKind;
  title: string;
  sub: string;
  action: string;
  href: string;
}

const IT = "/admin/sso";

export function itHomeRows(
  status: SsoStatus | null,
  history: RosterSyncHistory | null,
  historyFailed: boolean,
): GlanceRow[] {
  const rows: GlanceRow[] = [];
  if (!status) return rows;

  const run: RosterSyncRun | null = latestRun(history);

  if (status.status === "needs_attention") {
    rows.push({
      key: "reauthorise",
      kind: "flag",
      title: "Our access needs renewing",
      // D10's own wording, so the two screens cannot describe this differently.
      sub: "Everyone can still sign in; new accounts and roster updates are paused until it's reconnected.",
      action: "Reconnect",
      href: IT,
    });
  }

  /*
   * THE SIGN-IN CREDENTIAL, and the row this file existed without until 21 Sep.
   *
   * IT IS AN OAUTH CLIENT SECRET, NOT A SAML SIGNING CERTIFICATE. We asked for
   * the wrong thing by that name and built the first version describing the
   * wrong thing too. What Nevo holds is the secret it uses to talk to the
   * provider, and the copy says "sign-in credential" because that is true of
   * what we hold and does not claim a mechanism we got wrong once already.
   *
   * Gated on the server's own `credentialExpiringSoon`, never on a comparison
   * of our own against `credentialExpiresInDays`. What counts as "soon" here is
   * a decision with a real consequence and it is not the frontend's to make
   * (rule 3). Backend's window is 45 days, recorded here so the next reader
   * knows what the boolean MEANS - never so that anything computes it. The
   * number is DESCRIPTION, which is why the row still renders when it is null.
   *
   * SUPPRESSED WHEN "needs_attention" ALREADY FIRED. A school told in one
   * breath that its access needs renewing and that it will need renewing is
   * being told one thing twice, and the second telling makes the first look
   * less urgent.
   *
   * THE COPY DOES NOT SAY WHAT LAPSING DOES. We believe a lapsed signing
   * credential locks the school out - that belief is what got the field asked
   * for - but nothing in the contract states it, and the neighbouring
   * "needs_attention" copy promises the opposite ("Everyone can still sign
   * in"). Stating a consequence we cannot source, on the row most likely to be
   * escalated, is how a school gets told the wrong thing loudly.
   * TODO(api): what stops working when `credentialExpiresAt` passes?
   */
  if (status.credentialExpiringSoon && status.status !== "needs_attention") {
    const days = status.credentialExpiresInDays;
    rows.push({
      key: "credential",
      kind: "flag",
      title:
        days === null
          ? "Our sign-in credential expires soon"
          : days <= 0
            ? "Our sign-in credential has expired"
            : `Our sign-in credential expires in ${days} day${days === 1 ? "" : "s"}`,
      sub:
        days !== null && days <= 0
          ? "Reconnect to renew it."
          : "Nothing has changed yet. Reconnect to renew it.",
      action: "Reconnect",
      href: IT,
    });
  }

  /*
   * NULL IS NOT HEALTH, AND THIS IS THE STATE WE SHIPPED AS SILENCE.
   *
   * The expiry CANNOT BE READ BACK FROM THE PROVIDER. It is recorded by hand
   * when the connection is set up, so `credentialExpiresAt: null` does not mean
   * "nothing to worry about" - it means THE SCHOOL NEVER TOLD US, and therefore
   * that we cannot warn them before this credential lapses. The first version
   * of this row rendered nothing at all in that case, so the hero above went on
   * saying "Nothing needs your attention" to a school we cannot protect.
   *
   * That is rule 5 read backwards. Absence is an instruction to render the
   * state that corresponds to nothing - not to render nothing.
   *
   * NO ENDPOINT RECORDS IT. The only writes on this resource are reauthorise
   * and disconnect, so this row cannot offer a "tell us the date" action and
   * does not pretend to. It states the gap and sends them where the connection
   * is managed.
   * TODO(api): somewhere to record an expiry without reconnecting.
   *
   * CONNECTED ONLY. A disconnected school has no live credential, and a school
   * already told its access needs renewing does not need a second row saying we
   * do not know when that access expires.
   */
  if (
    !status.credentialExpiringSoon &&
    status.credentialExpiresAt === null &&
    status.status === "connected"
  ) {
    rows.push({
      key: "credential-unknown",
      kind: "soft",
      title: "We don't know when your sign-in credential expires",
      sub: "It's recorded when a provider is connected and can't be read back afterwards, so we can't warn you before this one lapses.",
      action: "Open IT & SSO",
      href: IT,
    });
  }

  if (run?.status === "partial_manual_review") {
    rows.push({
      key: "manual-review",
      kind: "flag",
      title: "The last sync finished, with rows for you to check",
      sub: "The provider could not complete every record on its own.",
      action: "Review in IT & SSO",
      href: IT,
    });
  }

  const failed = run?.status === "failed" || (history?.failedRuns ?? 0) > 0;
  if (failed && !historyFailed) {
    rows.push({
      key: "failed-run",
      kind: "flag",
      title: "A directory sync didn't finish",
      sub: "Sign-in is unaffected. The run's own details are on IT & SSO.",
      action: "Review in IT & SSO",
      href: IT,
    });
  }

  if (run && run.missingTeacherClassMappings > 0) {
    const n = run.missingTeacherClassMappings;
    rows.push({
      key: "unmatched",
      kind: "soft",
      /*
       * TEACHERS, NOT ACCOUNTS. The frame reads "3 accounts couldn't be matched
       * to a class automatically" and the only field behind it is
       * `missingTeacherClassMappings`. Saying "accounts" would widen a
       * teacher-to-class gap into a claim about students' sign-ins, which is a
       * different and more alarming thing.
       */
      title: `${n} teacher${n === 1 ? "" : "s"} couldn't be matched to a class automatically`,
      sub: "They can sign in; their classes need assigning by hand.",
      action: "Open IT & SSO",
      href: IT,
    });
  }

  if (
    run?.status === "completed" &&
    run.missingTeacherClassMappings === 0 &&
    run.importedStudents + run.importedTeachers > 0
  ) {
    const n = run.importedStudents + run.importedTeachers;
    rows.push({
      key: "imported",
      kind: "neutral",
      // Summing is safe HERE and only here: students and teachers are disjoint
      // account types. `activeStudents` and `invitedStudents` are two states of
      // one population and must never be added.
      title: `${n} account${n === 1 ? "" : "s"} imported by the last sync`,
      sub: "All matched to a class automatically. Nothing to do.",
      action: "View",
      href: IT,
    });
  }

  return rows;
}

/** Rows that actually want a decision. The neutral report is not one. */
export function attentionCount(rows: GlanceRow[]): number {
  return rows.filter((r) => r.kind !== "neutral").length;
}
