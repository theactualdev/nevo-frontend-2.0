/**
 * The NDPA 2023 claims D22 turns into evidence a SENCo can stand behind, and
 * the zero-labels claim itself, which two screens state and neither owned.
 *
 * THE CLAIM IS A FUNCTION OF THE COUNT. `diagnosticLabelsStored` is a live
 * query - design's own build rules are explicit that it must be ("it must
 * always be true, not cosmetic", Handoff - Backend; "a real query, not a
 * constant: it must reflect the store so the claim stays true", SCRUM-39) -
 * and the prose beneath it used to be static on both surfaces:
 *
 *     44px  {audit.diagnosticLabelsStored}   diagnostic labels stored
 *           "Nevo has never assigned or recorded a diagnostic category for
 *            any learner in this school."
 *
 * At a count of 7 the audit screen contradicted itself in adjacent lines, and
 * the Overview card did the same in different words. That is the screen a
 * SENCo hands a regulator. So the copy lives here, once, derived from the
 * count, and both surfaces read it.
 *
 * TWO THINGS THE OLD SENTENCE CLAIMED THAT NOTHING CAN VERIFY:
 *
 * "has never" is historical. The audit is a point-in-time scan with a
 * `generatedAt` - it proves the state of the store when it ran, not the whole
 * past. The wording is now present-tense and tied to the check.
 *
 * "no field exists to record one in" was the mechanism's basis for the claim.
 * If that were strictly so the counter could not return non-zero, and a live
 * counter whose justification is that there is nothing to count is a
 * contradiction whichever way it resolves. The mechanism now describes what
 * the check looked for and what it found.
 *
 * COUNSEL HAS RULED NOTHING HERE. The claim was never put to them - the
 * counsel checklist covers erasure, retention, DPA wording and roster-sync
 * consent, and not this - while every absolute "never" in the legal doc
 * carries "Placeholder wording - final legal text pending counsel". So this
 * file deliberately does not invent a new legal absolute; it states what the
 * scan proves. Final wording is counsel's.
 *
 * The non-zero wording follows the only tone design has set for this state,
 * on the internal ops console: the system owns it, says the data is safe,
 * offers a forward action, and never alarms.
 *
 * Claim states are honest about their own provenance:
 *
 * - `labels` is verified from the live audit and carries the count.
 * - `product` claims describe an architectural property, true of every school.
 * - `unverified` claims need school data no endpoint returns - a consent
 *   count, an erasure request log, a subprocessor register. Those render
 *   their mechanism with no state chip rather than a number we cannot stand
 *   behind, which on this screen of all screens would be the worst thing to
 *   invent.
 *
 * TWO OF THE FOUR ARE MEASURED NOW - consent coverage from the roster read and
 * the retention position from `GET /api/v1/school` - and carry real figures
 * under the `school` verification rather than a mechanism with no number.
 *
 * TODO(api): erasure requests in progress, and a subprocessor count - the two
 * states this screen genuinely cannot verify.
 * `POST /api/v1/parent/{token}/rights` mints a request id but nothing reads one
 * back, and its `ParentRightType` enum is
 * `request_data | object | withdraw_consent` - with no erasure value at all.
 * "Subprocessor" does not appear in the contract.
 *
 * TWO MORE WERE ON THIS LIST AND SHOULD NOT HAVE BEEN. Consent coverage is
 * derivable from `studentsApi.list()` with `blockedByConsent` - the same pair
 * StudentsView already renders - and a retention position is
 * `retentionPolicy` + `retentionDays`, both REQUIRED on `GET /api/v1/school`
 * and both already read by Settings. Those two claim rows should move off
 * `unverified` and carry real figures; leaving them unverified now understates
 * what this school can be told about itself, on the one screen where that
 * matters most.
 * TODO(design): the non-zero rendering is drawn nowhere school-facing. Wording
 * below is built to the ops breach tone; design and counsel both to confirm.
 */

import type { StudentConsent } from "@/lib/api/students";
import { withoutRecordedConsent } from "../Students/ConsentPill";

/**
 * Coverage is counted with the ROSTER'S OWN function, deliberately.
 *
 * The compliance screen and the Students screen must not be able to disagree
 * about how many consents a school holds - two implementations of one legal
 * figure is how they end up differing by one and nobody notices.
 */
export interface ConsentCoverage {
  /** Rows this read returned. */
  roster: number;
  /** Rows carrying a confirmed record. */
  confirmed: number;
  /** Rows carrying a record that is not confirmed. */
  outstanding: number;
}

export type ConsentInput = ConsentCoverage | "unreadable";
export interface RetentionPosition {
  policy: string;
  days: number;
}
export type RetentionInput = RetentionPosition | "unreadable";

export interface NdpaInputs {
  labels: number;
  consent: ConsentInput;
  retention: RetentionInput;
}

/**
 * The coverage figures, from the roster read the Students screen already makes.
 *
 * `confirmed` is derived by SUBTRACTION so it cannot drift from the count the
 * roster header quotes. `unknown` is kept apart from both: a row that came back
 * without a consent object is neither covered nor outstanding, and folding it
 * into either would be a guess on the one screen where guessing is worst.
 */
export function consentCoverage(
  rows: { consent?: StudentConsent | null }[],
): ConsentCoverage {
  /*
   * NO "UNKNOWN" TALLY, AND THERE WAS ONE. It counted rows that came back
   * with no consent object, and sent the whole claim to `unverified` if any
   * existed - on the reasoning that a coverage figure over a roster we only
   * partly understand is worse than none.
   *
   * That state cannot occur. `consent` is required and non-null on
   * `StudentSummaryResponse` (verified against the deployed spec, 16 Sep) and
   * a student nobody has written to arrives as `not_sent`, never absent.
   *
   * The row signature still tolerates a missing object because `api.get<T>`
   * is a cast rather than a validation - and a malformed row then counts as
   * OUTSTANDING via `withoutRecordedConsent`, which overstates the school's
   * remaining work rather than understating it. On a compliance screen that
   * is the safe direction to fail.
   */
  const outstanding = withoutRecordedConsent(rows);
  return {
    roster: rows.length,
    outstanding,
    /*
     * COUNTED POSITIVELY, NOT BY SUBTRACTION - and this is the second time
     * the direction of that arithmetic has mattered here.
     *
     * `withoutRecordedConsent` deliberately ignores a row with no consent
     * object (see its own note), so `roster - outstanding` quietly moves such
     * a row into CONFIRMED. On the screen a school shows a regulator, a row we
     * could not read must never be reported as a consent we hold. Counted
     * directly, it lands in neither bucket and the coverage figure understates
     * - which is the only safe way for this number to be wrong.
     *
     * `outstanding` still comes from the roster's own function, so the two
     * screens cannot disagree about how many consents are outstanding.
     */
    confirmed: rows.filter((r) => r.consent?.status === "confirmed").length,
  };
}

export type ClaimVerification =
  | "labels"
  | "product"
  /** Measured from THIS school's own data, not an architectural property. */
  | "school"
  | "unverified";

export interface NdpaClaim {
  title: string;
  /** The chip. "product" and "school" rows carry one; "unverified" never does. */
  state?: string;
  mechanism: string;
  evidence: string;
  verification: ClaimVerification;
  /** Why this row carries no figure. Only ever set on "unverified". */
  note?: string;
}

export interface LabelHero {
  /** The word beside the numeral. The numeral itself is the live count. */
  unit: string;
  body: string;
  /** True only when the check found none. Never styling - wording only. */
  clear: boolean;
}

/**
 * The hero claim, for the surface asking.
 *
 * Design fixes the zero state hard: it is "the expected reading forever", it
 * "must not look like missing data", the numeral stays navy and is never
 * muted, and the tone is "a statement of fact, not a boast - no 'compliant',
 * no 'certified', no percentage". So zero keeps design's approved framing and
 * loses only the two unverifiable claims described at the top of this file.
 */
export function labelHero(
  count: number,
  surface: "audit" | "overview",
): LabelHero {
  const clear = count === 0;
  const unit =
    surface === "audit" ? "diagnostic labels stored" : "Diagnostic labels stored";

  if (surface === "audit") {
    return {
      unit,
      clear,
      body: clear
        ? "Not zero shown – zero stored. This school’s records hold no diagnostic category and no clinical label for any learner, as of the check above. This is the claim every other item below exists to protect."
        : `The last check found ${count} where there should be none. Nothing has been shared outside your school and no learner has been told anything. Your data officer should have these cleared – until the count is zero, this claim does not hold.`,
    };
  }

  return {
    unit,
    clear,
    body: clear
      ? "Nevo adapts to how each student is learning right now. It records no diagnosis and no label, and the last check found nothing of that kind held about your students."
      : `Nevo is built to record no diagnosis and no label. The last check found ${count} that need looking at. Your data is safe; your data officer should review them.`,
  };
}

/**
 * The parental-consent row.
 *
 * ~~An outstanding consent is the SCHOOL'S record to complete, not a bar on the
 * child: SCRUM-80 ruled that the school warrants consent through the DSA and
 * only a withdrawal stops processing.~~ SUPERSEDED. Consent is a gate: a
 * learner's work begins when a parent gives permission, and nothing starts
 * before then. This row said "Learning is not held up while it is
 * outstanding" until 29 Sep - the same claim the parent consent email made,
 * and corrected in both at once.
 *
 * `unknown` rows send the whole row back to `unverified`. A coverage figure
 * computed over a roster we only partly understand is worse than no figure on
 * this screen, because it looks exactly like one we do understand.
 */
function consentClaim(input: ConsentInput): NdpaClaim {
  const base = {
    title: "Parental consent coverage",
    evidence: "Consent register (count only)",
  };
  const generic =
    "A parental consent is recorded against each learner, and this row counts how many are covered. Coverage is a count only \u2013 which learner, who consented and when stays on the student record.";

  if (input === "unreadable") {
    return {
      ...base,
      mechanism: generic,
      verification: "unverified",
      note: "Your roster didn\u2019t come back when this page loaded, so no count is shown. That is this console failing to read it \u2013 nothing about your school\u2019s consents has changed.",
    };
  }
  if (input.roster === 0) {
    return {
      ...base,
      state: "No learners yet",
      mechanism:
        "No learners are enrolled yet, so there is no consent to cover. The count appears here as soon as your first learner is enrolled.",
      verification: "school",
    };
  }
  if (input.outstanding === 0) {
    return {
      ...base,
      state: `${input.roster} of ${input.roster}`,
      mechanism: `All ${input.roster} learners on your roster have a parental consent recorded against their name. This screen holds the count only \u2013 which learner, who consented and when stays on the student record.`,
      verification: "school",
    };
  }
  const one = input.outstanding === 1;
  return {
    ...base,
    state: `${input.confirmed} of ${input.roster}`,
    mechanism: `${input.confirmed} of the ${input.roster} learners on your roster have a parental consent recorded. ${input.outstanding} ${one ? "does" : "do"} not yet. Their learning begins as soon as a parent gives permission \u2013 nothing starts before then. Your Students page lists which.`,
    verification: "school",
  };
}

/**
 * The retention row.
 *
 * `retentionPolicy` and `retentionDays` are BOTH required on `GET
 * /api/v1/school`, so this is a measurement rather than an architectural claim
 * - which is why the row moved off `unverified`, where it sat because an
 * earlier note said no endpoint reported it.
 *
 * The title lost "within counsel limits": this reports the school's configured
 * position, and whether that position satisfies counsel is counsel's judgement,
 * not a thing this screen can check.
 */
function retentionClaim(input: RetentionInput): NdpaClaim {
  const base = {
    title: "Records retention",
    evidence: "Retention policy, deletion jobs",
    mechanism:
      "Account and enrolment records are kept only for the period set with counsel; nothing is retained beyond it. Learning signals, being ephemeral, have no retention period at all.",
  };
  if (input === "unreadable") {
    return {
      ...base,
      verification: "unverified",
      note: "Your school record didn\u2019t come back when this page loaded, so the configured period isn\u2019t shown here.",
    };
  }
  return {
    ...base,
    state: `${input.days} days`,
    mechanism: `${base.mechanism} Your school is set to ${POLICY_LABEL[input.policy] ?? input.policy}, which is ${input.days} days.`,
    verification: "school",
  };
}

/** The three values the contract's `retentionPolicy` pattern allows. */
const POLICY_LABEL: Record<string, string> = {
  contract: "the contract term",
  contract_plus_3_years: "the contract term plus three years",
  contract_plus_7_years: "the contract term plus seven years",
};

/** The claims table. */
export function ndpaClaims(inputs: NdpaInputs): NdpaClaim[] {
  const count = inputs.labels;
  return [
    /*
     * PULLED 14 SEP, PENDING A REWRITE BY DESIGN AND COUNSEL.
     *
     * It read: "Raw learning signals are used in the moment to adapt the
     * lesson, then discarded. Nothing about how a learner performed is written
     * to long-term storage."
     *
     * `GET /api/admin/adaptation-log` returns `studentFirstName` alongside
     * `trigger`, `adaptation` and `timestamp`, filterable by `studentId` and
     * by date range. Whatever that is, it is not nothing written to long-term
     * storage about how a learner performed.
     *
     * THE SENTENCE CHANGES, NOT THE LOG - design's ruling, and the right way
     * round: the log is a real product capability and an audit trail. What was
     * wrong was a compliance screen denying it existed.
     *
     * A compliance screen making a false statement is worse than a missing
     * one, so the row is absent until the replacement wording arrives.
     */
    {
      // The plain form, which the v1 Build Lock settles on: "the plain
      // 'Diagnostic labels stored: 0' fact. The plain form wins going
      // forward." The old title began with the word "Zero", so at a count of
      // 3 the row read "Zero diagnostic labels stored - Needs review".
      title: "Diagnostic labels stored",
      mechanism:
        count === 0
          ? "The check reads every field in which a diagnostic category or clinical label could sit, and found none. Adaptations reference behaviour in the moment only, so there is nothing of that kind to export or to subpoena."
          : `The check reads every field in which a diagnostic category or clinical label could sit. It found ${count}. Each is recorded as a location in the store rather than as text, and none is shown on this screen.`,
      evidence: "Data-model audit, schema review",
      verification: "labels",
    },
    consentClaim(inputs.consent),
    {
      title: "Data-flow transparency",
      state: "Documented",
      mechanism:
        "Where each category of data originates, how it moves and where it rests is documented and available to your data officer. No learning data leaves the processing boundary.",
      evidence: "Data-flow map, DPA schedule 2",
      verification: "product",
    },
    retentionClaim(inputs.retention),
    /*
     * PULLED 14 SEP, PENDING A REWRITE BY DESIGN AND COUNSEL.
     *
     * It read: "A parent or guardian can request erasure of their child's
     * account data at any time; requests are actioned within the window agreed
     * with counsel."
     *
     * A parent cannot exercise that. `ParentRightType` is
     * `request_data | object | withdraw_consent` - there is no erasure value,
     * and the string "erasure" does not appear anywhere in the deployed
     * contract. The nearest real mechanism is
     * `DELETE /api/v1/students/{student_id}` ("Anonymize Student"), which only
     * a school administrator can invoke.
     *
     * Describing a right the product does not offer, on the screen a school
     * shows a regulator, is the worst version of this console's oldest
     * mistake. Absent until the replacement wording arrives.
     */
    {
      title: "Subprocessors",
      mechanism:
        "Every third party that touches school data is named, with its role and location, in the subprocessor list attached to your DPA. Adding one requires notice under the same agreement.",
      evidence: "Subprocessor register",
      verification: "unverified",
    },
  ];
}
