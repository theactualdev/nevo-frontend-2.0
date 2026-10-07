/**
 * The Data Processing Agreement shown at D1.3, in full and read-gated.
 *
 * PLACEHOLDER WORDING, and labelled as such on screen - the same treatment
 * `legalDoc.ts` already gives the Privacy Policy and Terms. SCRUM-39 is
 * explicit that counsel is drafting the final language alongside the DPIA, and
 * that this is "swappable content, not layout": the pane scrolls, the gate is
 * scroll-driven, and nothing about the step depends on the document's length.
 *
 * The variable structure IS confirmed, and is the only thing the template
 * interpolates: school name, school address, contract start and end dates,
 * enrolment band, effective date. Nothing else is variable. Only the school
 * name is known during onboarding, so the rest render as named blanks rather
 * than as invented values - a legal document with plausible fabricated dates
 * in it is worse than one with obvious gaps.
 *
 * TODO(legal): replace wholesale when counsel returns the final wording, and
 * bump DPA_VERSION when you do. The accepted version is stored with the
 * acceptance and is what D12 and the D22 NDPA surface display later, so the
 * number must change whenever the words do.
 */

/** Bump on every wording change. Stored with each acceptance. */
export const DPA_VERSION = "0.9-draft";

export const DPA_BADGE =
  "Placeholder wording - final legal text pending counsel";

export const DPA_VERSION_LINE =
  `Version ${DPA_VERSION} · Governed by the Nigeria Data Protection Act (NDPA) 2023`;

export interface DpaClause {
  num: string;
  title: string;
  body: string;
}

/** `{{school}}` is the only interpolation the caller supplies. */
export const DPA_CLAUSES: DpaClause[] = [
  {
    num: "1",
    title: "Purpose and scope",
    body: "This agreement sets out how Nevo processes personal data on behalf of {{school}} in connection with the Nevo learning platform, and applies for the duration of the School's use of the service. [Placeholder: legal entity name, RC number and registered address to be confirmed by counsel.]",
  },
  {
    num: "2",
    title: "Roles of the parties",
    body: "{{school}} is the data controller and determines the purposes for which its students' personal data is processed. Nevo acts solely as data processor and processes that data only on the School's documented instructions, except where law requires otherwise.",
  },
  {
    num: "3",
    title: "What Nevo processes",
    body: "Names, year group and class, sign-in identifiers, and a record of how each learner interacts with lessons. Nevo does not process health data, and does not hold diagnostic labels about any child. [Placeholder: full data inventory to be appended by counsel.]",
  },
  {
    num: "4",
    title: "What Nevo does not do",
    body: "Nevo does not sell personal data, does not use a school's data to advertise, and does not train shared models on identifiable student data. Adaptation happens against the individual learner's own record.",
  },
  /*
   * ============================================================================
   * CLAUSE 5 IS COUNSEL'S, AND STILL OPEN. Flagged 11 Sep 2026; the consent
   * position beside it moved on 23 Sep.
   *
   * This clause warrants that Nevo "will not activate a learner whose consent
   * has not been confirmed". When it was flagged, SCRUM-80 (7 Sep) had ruled
   * the opposite - an unconfirmed consent was the school's administrative
   * task and the learner proceeded. Design's 23 Sep ruling superseded that:
   * every entry path resolves consent before anything mounts, so a child
   * whose consent is not given waits on 00d, a withdrawn child on 00e, and a
   * check that cannot complete holds them too (D69). See
   * `docs/waiting-on-counsel.md` item 1.
   *
   * Whether the clause stands as written is still counsel's question. It
   * matters more than ordinary copy because the school FORMALLY ACCEPTS this
   * document - `POST /school/dpa-acceptance` records the version, the
   * accepting administrator and the timestamp, and the D22 compliance surface
   * then cites that acceptance as evidence.
   *
   * Unlike clauses 6 and 7 this one carries no `[Placeholder: ...]` marker, so
   * it reads as settled. The text is deliberately left EXACTLY as counsel last
   * had it: silently rewording a term a school has already accepted would be
   * the worse error, and it is not a decision this file gets to make.
   * ============================================================================
   */
  {
    num: "5",
    title: "Parental consent",
    body: "Where a learner is a minor, the School is responsible for obtaining parental or guardian consent before that learner begins. Nevo provides the mechanism to request and record it, and will not activate a learner whose consent has not been confirmed.",
  },
  {
    num: "6",
    title: "Security",
    body: "Nevo applies technical and organisational measures appropriate to the risk, including encryption in transit and at rest, access control on a least-privilege basis, and logging of administrative access. [Placeholder: certification and audit commitments to be confirmed by counsel.]",
  },
  {
    num: "7",
    title: "Sub-processors",
    body: "Nevo engages sub-processors for hosting and delivery. The School will be notified before a new sub-processor is engaged, and may object. [Placeholder: current sub-processor list to be appended by counsel.]",
  },
  {
    num: "8",
    title: "Retention and deletion",
    body: "Personal data is retained for the period the School configures, and is deleted or irreversibly anonymised at the end of it. Where a record is erased, teachers' notes remain with the class with the learner's name removed.",
  },
  {
    num: "9",
    title: "Data subject rights",
    body: "Nevo assists the School in responding to access, correction, erasure and portability requests from learners and their guardians, within the timescales the NDPA sets. [Placeholder: response windows to be confirmed by counsel.]",
  },
  {
    num: "10",
    title: "Breach notification",
    body: "Nevo notifies the School without undue delay after becoming aware of a personal data breach affecting the School's data, with the information the School needs to meet its own notification duties.",
  },
  {
    num: "11",
    title: "Term and termination",
    body: "This agreement runs for the term of the School's subscription. On termination the School may export its data, after which Nevo deletes it in line with clause 8. [Placeholder: contract start and end dates, and enrolment band, to be interpolated on execution.]",
  },
  {
    num: "12",
    title: "Governing law",
    body: "This agreement is governed by the laws of the Federal Republic of Nigeria. [Placeholder: jurisdiction and dispute resolution clauses to be confirmed by counsel.]",
  },
];

export function dpaFor(schoolName: string): DpaClause[] {
  const name = schoolName.trim() || "the School";
  return DPA_CLAUSES.map((c) => ({ ...c, body: c.body.replaceAll("{{school}}", name) }));
}
