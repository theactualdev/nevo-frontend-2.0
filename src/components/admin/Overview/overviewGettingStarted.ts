import type { SchoolRosterCounts } from "@/lib/api/school";
import type { SsoStatus } from "@/lib/api/sso";
import type { AdminStudentRow } from "@/lib/api/students";

/**
 * D04's Getting-started checklist - the "Just onboarded, honest early state"
 * variant of the Overview.
 *
 * The frame draws THREE variants of this screen and gives the early one its own
 * roll-up: a live school gets "Worth a glance", a just-onboarded school gets
 * "Getting started". The screen used to render "Worth a glance" in both cases,
 * so a school with no students was told "6 students are waiting on parent
 * consent" - three invented counts, under a note admitting they were invented.
 *
 * Copy is D04's `ksData`, verbatim. Only the school name in the first row is
 * substituted, because the frame hard-codes its own fixture school there.
 *
 * WHAT A TICK MEANS HERE. A tick is a positive CLAIM about this school, so it
 * is only ever set from a signal we actually hold:
 *   - "Workspace created" is true by construction - the admin is signed into a
 *     school that exists.
 *   - "Add your students" reads `studentsProfiled` from the compliance audit,
 *     which the screen already fetches.
 *   - "Invite your teachers" reads `counts.teachers` from
 *     `GET /api/v1/school/overview`, which the screen already fetches for its
 *     snapshot tiles.
 *
 * ALL FIVE ARE SIGNAL-BACKED NOW - 16 Sep. Every row either ticks from
 * something this school actually did, or stays open because nothing can see
 * it. Each predicate lives beside this block with its own reasoning:
 * `teachersOnRoster`, `signInChosen`, `consentRequestsSent`, plus WORKSPACE
 * (true by construction - the admin is signed into a school that exists) and
 * STUDENTS (`audit.studentsProfiled > 0`, read in OverviewView).
 *
 * THE TODO THAT USED TO SIT HERE SAID "settle the remaining THREE", and by
 * then it was two: the teachers row had settled and the sentence had not
 * followed it. That is this file's own warning happening inside the comment
 * that states the warning, and it is why the count is no longer written down
 * anywhere - the predicates are the record.
 *
 * ONE HALF STAYS UNVERIFIABLE BY DESIGN, and it is not a gap to close.
 * "Choose how everyone signs in" offers "connect a provider, OR share your
 * school code". A connected provider ticks it. A school that instead told
 * every child its code has done the step, and nothing in the contract records
 * that it did - `SchoolCodeResponse` is a lookup, not a register of who was
 * told. So that row can go open on a school that is finished, and an open
 * circle here has always meant "we cannot see it", never "you have not done
 * it". Do not invent a signal for it.
 *
 * THAT WAS TRUE AND IS NOT ANY MORE. This used to read: "The consent row's
 * action is 'When ready' rather than a link... No endpoint reads consent for a
 * roster, so there is nothing to link to."
 *
 * Both halves are now false. `AdminStudentRow` carries `consent`, which is
 * what `blockedByConsent` counts on the roster header, and
 * `consentsApi.requestParentConsent` finally has callers - the row and the
 * student's own record. So the row links to the place the action lives.
 *
 * Left as a caution rather than deleted: a docblock that stops being true is
 * the most expensive comment in a codebase, because the next person re-makes
 * the decision on it. Four were found wrong in a single pass on 10 Sep.
 */

export interface StartStep {
  title: string;
  sub: string;
  /** The action's label. Empty when the step is not an action. */
  cta: string;
  /** Absent when the step has nowhere to go yet. */
  href?: string;
}

export function gettingStartedSteps(school: string): StartStep[] {
  return [
    {
      title: "Workspace created",
      sub: `${school} is live on Nevo.`,
      cta: "",
    },
    {
      title: "Invite your teachers",
      sub: "They each get a link to set up their own console.",
      cta: "Invite teachers",
      href: "/admin/invitations",
    },
    {
      title: "Add your students",
      sub: "Import a roster, or enrol them class by class.",
      cta: "Enrol students",
      href: "/admin/students",
    },
    {
      title: "Choose how everyone signs in",
      sub: "Connect Microsoft or Google, or share your school code.",
      cta: "Set up sign-in",
      href: "/admin/sso",
    },
    {
      title: "Send parent consent requests",
      /*
       * THIS COMMENT SAID THE OPPOSITE UNTIL 23 SEP, and the sentence it was
       * arguing against is now the true one.
       *
       * It read: "Not 'Students can begin lessons once a parent confirms' -
       * they can begin either way, per SCRUM-80." That ruling is superseded. A
       * child whose consent is not in cannot reach the assessment at all - see
       * `00d Waiting on Consent` in the student frames, and the required
       * `blocked` on `ConsentGateResponse`.
       *
       * The copy still says what the school DOES here rather than what it
       * unlocks, because the unlocking is the student console's to state and
       * this row is a checklist item rather than a warning. But the REASON has
       * inverted, and the next person reasoning from the old comment would
       * have reasoned from a falsehood.
       */
      sub: "Your school records each parent's confirmation here.",
      cta: "Send requests",
      href: "/admin/students",
    },
  ];
}

/** Indices of the steps a real signal can currently settle. */
export const STEP_WORKSPACE = 0;
export const STEP_TEACHERS = 1;
export const STEP_STUDENTS = 2;
export const STEP_SIGNIN = 3;
export const STEP_CONSENT = 4;

/**
 * Whether "Invite your teachers" may be ticked.
 *
 * `SchoolRosterCounts.teachers` is the school's teacher headcount. Nothing on
 * the contract makes it required - the schema carries a default of 0 and has
 * no `required` array - so an ABSENT number is unknown, and so is a `null`
 * counts object, which is what OverviewView holds after
 * `schoolApi.overview().catch(() => null)`. Unknown returns false and the row
 * stays open, in the same state as the steps no signal reaches. That is the
 * absence of a claim, not the claim that this school has no teachers.
 *
 * The type test is the point. `(counts?.teachers ?? 0) > 0` reads the same and
 * invites the next edit to default a missing count to zero, which is exactly
 * the move this checklist must never make.
 *
 * `> 0` IS THE RIGHT THRESHOLD, AND THIS DOES NOT TICK AT REGISTRATION. The
 * schema counts `sencoAdmins` and `otherAdmins` in fields of their own, and
 * the founding admin comes back from registration as an admin - never inside
 * `teachers`. A school that has just registered and invited nobody reads 0.
 *
 * The contract does not settle whether a teacher who was invited but has not
 * joined is counted; students are split active/invited and teachers are not.
 * It does not matter here - under either reading a non-zero count means a
 * teacher was invited, which is what this step asks. It WOULD matter for
 * anything rendering the number as accounts.
 */
export function teachersOnRoster(
  counts: SchoolRosterCounts | null | undefined,
): boolean {
  return typeof counts?.teachers === "number" && counts.teachers > 0;
}

/**
 * Whether "Choose how everyone signs in" may be ticked.
 *
 * THE STEP'S OWN SUB-COPY IS AN OR: "Connect Microsoft or Google, **or** share
 * your school code." So a connected provider satisfies it outright - the code
 * is an alternative route, not a second requirement.
 *
 * Which is also why the reverse does not hold. A school with no provider may
 * well have shared its code with every child, and nothing in the contract can
 * see that: `SchoolCodeResponse` is a lookup, not a record of who was told.
 * So no provider means UNKNOWN, and unknown leaves the row open. That is the
 * absence of a claim, never the claim that this school has not chosen.
 *
 * `needs_attention` TICKS, and the distinction is worth stating. It means a
 * connection exists and is unhealthy - the school HAS chosen how everyone
 * signs in, which is the only question this row asks. The unhealthiness is
 * D15's to report and the IT home already surfaces it; a getting-started row
 * that un-ticked itself because a certificate wobbled would be telling a
 * school it had not done something it did.
 *
 * `null` is the read having failed (`ssoApi.status().catch(() => null)`), and
 * follows `teachersOnRoster`: unknown returns false.
 */
export function signInChosen(sso: SsoStatus | null | undefined): boolean {
  return sso?.status === "connected" || sso?.status === "needs_attention";
}

/**
 * Whether "Send parent consent requests" may be ticked.
 *
 * Ticks only on a POSITIVE reading of the roster: at least one student, and
 * not one of them still sitting at `not_sent`. `AdminStudentRow.consent` is
 * required and non-null on the deployed spec, so a child with no record comes
 * back `not_sent` rather than absent - there is no "we were not told" state to
 * handle here.
 *
 * AN EMPTY ROSTER DOES NOT TICK, and that is the whole reason this is a
 * function rather than an `.every()` at the call site. `[].every(...)` is
 * `true`, so a school that has enrolled nobody would be congratulated for
 * having sent every request it owes - a vacuous truth presented as an
 * achievement, on the exact screen a brand-new school sees first.
 *
 * `withdrawn` and `pending` both COUNT AS SENT, because the row asks whether
 * the requests went out, not how parents answered. Per SCRUM-80 the school is
 * not gating anything on the reply: `not_sent` is the only value meaning this
 * school still has work to do here.
 *
 * `null` is the read having failed, and leaves the row open like its siblings.
 */
export function consentRequestsSent(
  roster: AdminStudentRow[] | null | undefined,
): boolean {
  if (!Array.isArray(roster) || roster.length === 0) return false;
  return roster.every((s) => s.consent.status !== "not_sent");
}
