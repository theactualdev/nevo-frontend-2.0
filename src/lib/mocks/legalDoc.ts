/**
 * Privacy Policy and Terms of Service (`Nevo Legal Doc`). The frame carries a
 * standing badge - "Placeholder wording - final legal text pending counsel" -
 * and every section ends in a bracketed note naming what counsel still has to
 * confirm. Reproduced verbatim, badge included: shipping this as if it were
 * settled legal text would be the dishonest move.
 *
 * TODO(legal): replace wholesale when counsel returns the final wording.
 */

export type LegalDocId = "privacy" | "terms";

export interface LegalSection {
  num: string;
  title: string;
  body: string;
}

export const LEGAL_DRAFT_BADGE =
  "Placeholder wording - final legal text pending counsel";

export const LEGAL_VERSION_LINE =
  "Version 0.9 (draft) · Last updated 12 August 2026 · Governed by the Nigeria Data Protection Act (NDPA) 2023";

export const LEGAL_DOCS: Record<
  LegalDocId,
  { title: string; intro: string; sections: LegalSection[] }
> = {
  privacy: {
    title: "Privacy Policy",
    intro:
      "How Nevo handles personal data on behalf of the schools that use it, and what that means for teachers, parents and their children.",
    sections: [
      {
        num: "01",
        title: "Who we are",
        body: "Nevo is an adaptive learning platform provided to schools. When your child's school uses Nevo, the school is the data controller and Nevo acts as its data processor. [Placeholder: legal entity name, RC number, registered address and NDPC registration reference to be confirmed by counsel.]",
      },
      {
        num: "02",
        title: "What we collect",
        body: "Account details (name, role, school, email), the learning activity a student generates in lessons, and technical information such as device type and session timestamps needed to run the service. We do not collect more than the teaching relationship requires. [Placeholder: full data inventory and lawful-basis mapping to be finalised in the DPIA.]",
      },
      {
        num: "03",
        title: "How AI processing works",
        body: "Nevo adapts lessons to each learner by analysing their responses and pace. This personalises teaching; it never makes a decision about a child with legal or similarly significant effect without a person involved. Learner data is not used to train third-party foundation models. [Placeholder: model-provider list, data-flow diagram and human-oversight statement to be confirmed.]",
      },
      {
        num: "04",
        title: "Children's data",
        body: "Most learners are minors and cannot consent for themselves. A parent or guardian gives consent, or the school relies on its own lawful basis, before a child begins. Children are never shown advertising, and their data is never sold. [Placeholder: age thresholds and guardian-verification method to be confirmed under the NDPA.]",
      },
      {
        num: "05",
        title: "Where data is processed",
        body: "Data is hosted with our infrastructure providers to deliver the service. Where any processing happens outside Nigeria, it is covered by the safeguards the NDPA requires for cross-border transfers. [Placeholder: hosting regions, sub-processor list and transfer-safeguard mechanism to be confirmed.]",
      },
      {
        num: "06",
        title: "How long we keep it",
        body: "We keep learning data while the student is enrolled with the school, then for a limited period afterwards before secure deletion. A school can request earlier deletion on a family's behalf. [Placeholder: exact retention periods per data category to be confirmed.]",
      },
      {
        num: "07",
        title: "Your rights",
        body: "You can ask to see the data held about your child, correct it, request its deletion, or withdraw consent at any time - and a student's access to their learning is never affected by doing so. Requests are made through the school as data controller. [Placeholder: full NDPA data-subject rights and response timelines to be confirmed.]",
      },
      {
        num: "08",
        title: "How to contact us",
        body: "Our Data Protection Officer can be reached at privacy@nevo.africa. If your child is enrolled through a school, that school is your first point of contact. [Placeholder: DPO name, postal address and NDPC complaint-escalation route to be confirmed.]",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro:
      "The terms on which schools, staff, and parents or guardians use Nevo.",
    sections: [
      {
        num: "01",
        title: "Who these terms cover",
        body: "These terms govern use of Nevo by schools and the staff, and by parents or guardians who hold an account. Students use Nevo under their school's arrangement, not under a direct agreement with Nevo. [Placeholder: contracting-party definitions to be confirmed by counsel.]",
      },
      {
        num: "02",
        title: "Your account",
        body: "Keep your sign-in details private and let your school administrator know if you think your account has been accessed by someone else. Accounts are provisioned by the school and are for the named person only. [Placeholder: acceptable-use and account-sharing clauses to be confirmed.]",
      },
      {
        num: "03",
        title: "How AI features work",
        body: "Nevo personalises lessons using automated analysis of learner activity. It supports teachers; it does not replace a teacher's judgement, and adaptation decisions remain reviewable by school staff. [Placeholder: description of automated processing and human oversight to be confirmed.]",
      },
      {
        num: "04",
        title: "Children and consent",
        body: "A school may only enrol a student where it has a valid lawful basis, including parental consent where required. Nevo relies on the school's confirmation that this basis is in place. [Placeholder: consent-warranty and indemnity clauses to be confirmed.]",
      },
      {
        num: "05",
        title: "Availability of the service",
        body: "We work to keep Nevo available and secure, and a student's or teacher's access to learning is never used as commercial leverage. Occasional maintenance may briefly interrupt the service. [Placeholder: service-level and maintenance-window commitments to be confirmed.]",
      },
      {
        num: "06",
        title: "Fees and payment",
        body: "Where fees apply, they are agreed with the school and set, displayed and invoiced in Naira. Non-payment is handled through ordinary commercial channels and never by restricting a learner's access. [Placeholder: billing terms, VAT treatment and late-payment process to be confirmed.]",
      },
      {
        num: "07",
        title: "Changes to these terms",
        body: "We may update these terms and will give reasonable notice of material changes through the school or in the product. Continued use after a change means the updated terms apply. [Placeholder: notice period and change-acceptance mechanism to be confirmed.]",
      },
      {
        num: "08",
        title: "Contact and governing law",
        body: "For questions about these terms, contact legal@nevo.africa. These terms are governed by the laws of the Federal Republic of Nigeria. [Placeholder: dispute-resolution forum and governing-law clause to be confirmed.]",
      },
    ],
  },
};

export const LEGAL_FOOTER = {
  heading: "Questions about your data?",
  body: "Reach our Data Protection Officer at privacy@nevo.africa. If your child is enrolled through a school, that school is the data controller and your first point of contact.",
  email: "privacy@nevo.africa",
};
