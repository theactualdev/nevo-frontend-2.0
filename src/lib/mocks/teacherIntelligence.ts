import type { SectionType } from "./teacherLibrary";

/**
 * Intelligence layer, teacher side (C16 / C16a-C16d). Four additive surfaces:
 * the Class Learning Pulse on Home, per-student Observations on the class
 * detail, Adaptation Insights on the student profile, and the Variant Review
 * orientation. Copy is frame-verbatim where our fixtures match the drawing;
 * numbers are adapted to the real JSS 2A roster (28, not the frame's 27).
 *
 * THE ENDPOINTS EXIST NOW (verified 11 Sep 2026) - "once they exist" was
 * true when this was written and is not any more. Flags, the pulse, class
 * insights and adaptation all read live: `useTeacherFlags`, `LiveClassPulse`,
 * `useClassInsights` (`LiveClassInsights:40`), `useAdaptation`.
 *
 * TODO(api): the residue is Variant Review, and only that. Variants are typed
 * (`lib/api/variants.ts`) and carried on `segments[]` of the lesson reads, but
 * `VariantReviewRoute` consumes neither - it still renders "Variants aren't
 * available yet" (`VariantReviewRoute.tsx:52`) to every signed-in teacher.
 */

/* ---- C16a Class Learning Pulse (Home, above the lesson list) ---- */

export interface PulseMetric {
  head: string;
  value: string;
  desc: string;
}

export const PULSE_LABEL = "Class learning pulse";
export const PULSE_SUBTITLE =
  "How your class is engaging with lessons this week.";

export const HOME_PULSE: PulseMetric[] = [
  {
    head: "Engagement",
    value: "Above 75%",
    desc: "25 of 28 students engaged consistently across sessions this week.",
  },
  {
    head: "Comprehension",
    value: "Below 50%",
    desc: "Most students are moving through the current sequence at their own pace. 4 may benefit from a review session.",
  },
  {
    head: "Focus",
    value: "50 to 75%",
    desc: "Attention patterns are stable across the class. No signs of widespread fatigue or disengagement.",
  },
];

/* ---- C16b Student Observations (replaces the plain class-detail roster) ---- */

export interface StudentObservation {
  seat: number;
  chips: string[];
}

/*
 * THE COPY RULE GOVERNS EVERY CHIP BELOW (design's sweep, 17 Sep, applied to
 * src rather than to the frames): a chip may say what Nevo did or what
 * happened. It may never say what a child is, prefers, tends to do, is better
 * at, struggles with or responds well to, and no strength or confidence word
 * may be attached to it. Nineteen chips failed that and are rewritten to the
 * event underneath them; the modality ones are deleted, because there is no
 * event under "settles faster when she can hear it first" - the claim WAS the
 * content.
 *
 * Deleting a claim is not inventing a replacement. Where a child had two chips
 * and one was a claim, they now have one.
 *
 * These are still free-text fixtures, which the live path is not: the roster
 * renders the five sanctioned patterns through `OBSERVATION_COPY`. That
 * mismatch is logged in the audit rather than fixed here - the vocabulary
 * being richer than the product's is design's call, not a copy breach.
 */
export const OBSERVATIONS_LABEL = "Student observations";
export const OBSERVATIONS_SUBTITLE =
  "What Nevo has noticed about each student this week.";

/** Keyed by class id, then student name (the roster stays the flag source). */
export const CLASS_OBSERVATIONS: Record<
  string,
  Record<string, StudentObservation>
> = {
  "jss-2a": {
    "Adaeze Ifeanyi": { seat: 3, chips: ["Worked in every subject this week"] },
    "Aisha Abdullahi": { seat: 21, chips: ["Steady pace through this week's lessons"] },
    "Amara Okafor": { seat: 12, chips: ["Taking longer on written segments this week"] },
    "Bello Ibrahim": { seat: 7, chips: ["Worked the problems one step at a time"] },
    "Chisom Eze": { seat: 16, chips: ["Finished the last four lessons that led with audio"] },
    "Chukwuemeka Nwosu": { seat: 4, chips: ["Opened the worked example, then moved quickly through the practice"] },
    "Damilola Akinwande": { seat: 25, chips: ["Worked through the diagrams in this week's lessons"] },
    "Emeka Nwachukwu": { seat: 9, chips: ["Back to full pace this week"] },
    "Fatima Musa": { seat: 14, chips: ["Finished the fractions set with time to spare"] },
    "Kolade Fashola": { seat: 22, chips: ["Moving evenly through the current sequence"] },
    "Ngozi Obi": { seat: 6, chips: ["Finished every comprehension task this week"] },
    "Sade Olawale": { seat: 18, chips: ["Steady through this week's longer sessions"] },
    "Taiwo Ogundimu": { seat: 11, chips: ["Settled quickly into the new equations work"] },
    "Tobi Adeleke": { seat: 27, chips: ["Opened the worked example before the new concept, twice this week"] },
    "Tunde Adeyemi": { seat: 8, chips: ["Stalled partway through Tuesday's lesson - three times this week", "The four sessions before were steady"] },
    "Zainab Yusuf": { seat: 15, chips: ["Finishing with time to spare this week"] },
  },
  "jss-2b": {
    "Adanna Okoye": { seat: 2, chips: ["Steady pace across both lessons this week"] },
    "Bashir Lawal": { seat: 17, chips: ["Answered the whole comprehension set without prompts"] },
    "Chiamaka Udo": { seat: 9, chips: ["Worked through this week's reading"] },
    "Efe Oghenekaro": { seat: 24, chips: ["Working through practice sets without prompts"] },
    "Halima Sani": { seat: 5, chips: ["Finished the Things Fall Apart chapters"] },
    "Ikenna Eze": { seat: 13, chips: ["Even pace through this week's longer lessons"] },
    "Lola Adebayo": { seat: 28, chips: ["Settled quickly into this term's fractions work"] },
    "Nnamdi Okafor": { seat: 11, chips: ["Read the explanation before the practice set"] },
    "Rukayat Balogun": { seat: 19, chips: ["Answering stretch questions unprompted"] },
    "Segun Adewale": { seat: 7, chips: ["Steady all week - nothing worth flagging"] },
    "Uche Nnaji": { seat: 22, chips: ["Moving through the current sequence"] },
    "Yemi Oladipo": { seat: 15, chips: ["Finished both lessons this week"] },
  },
  "sss-1-sciences": {
    "Abiola Ogunleye": { seat: 4, chips: ["Working through the labelled diagram"] },
    "Chidera Anyanwu": { seat: 12, chips: ["Named the organelles and their jobs in the practice set"] },
    "Dabira Oyelaran": { seat: 20, chips: ["Steady pace through the cell structure lesson"] },
    "Emmanuella Bassey": { seat: 8, chips: ["Went back to the diagram before the practice set"] },
    "Femi Alade": { seat: 26, chips: ["Moving evenly, no sections standing out"] },
    "Ifeoma Chukwu": { seat: 15, chips: ["Worked through the compare-two-cells task"] },
    "Kamsi Obiora": { seat: 3, chips: ["Finished the practice set in one sitting"] },
    "Micheal Etim": { seat: 18, chips: ["Spent longer on the diagram section"] },
    "Nafisa Garba": { seat: 10, chips: ["Consistent engagement across the sciences"] },
    "Olamide Shittu": { seat: 23, chips: ["Completed the match-and-label task without prompts"] },
    "Tari Briggs": { seat: 6, chips: ["Steady this week"] },
    "Zara Mohammed": { seat: 14, chips: ["Still to finish this week's lesson"] },
  },
};

/* ---- C16c Adaptation Insights (student profile, below lesson history) ---- */

export interface AdaptationEntry {
  date: string;
  lesson: string;
  desc: string;
}

export const ADAPTATIONS_LABEL = "How Nevo has adapted for this student";

/** Only students with a full profile carry history; early profiles render
 *  no section at all (the C08 no-empty-cards rule). */
export const STUDENT_ADAPTATIONS: Record<string, AdaptationEntry[]> = {
  "amara-okafor": [
    {
      date: "15 Jul",
      lesson: "Fractions Lesson 3",
      desc: "Nevo delivered the second half of this lesson with additional visual examples after noticing Amara took longer with the text-based explanation.",
    },
    {
      date: "12 Jul",
      lesson: "Reading: The Coastline",
      desc: "Nevo offered a listen-first version when Amara paused often on the longer passages.",
    },
    {
      date: "9 Jul",
      lesson: "Algebra Basics",
      desc: "Nevo broke the worked example into smaller steps and checked in a little more often.",
    },
  ],
};

export const ADAPTATIONS_FOOTNOTE_MAIN =
  "You do not need to act on any of these. Nevo handles the adaptations for you.";
export const ADAPTATIONS_FOOTNOTE_DESKTOP_TAIL =
  "They are shown here so you can see how the platform is supporting each student.";

/* ---- C16d Variant Review (SCRUM-37) ---- */

/**
 * FIVE TABS AS OF 21 SEP (SCRUM-136), and the fifth was not a judgement
 * call this repo got to make.
 *
 * `calculationVariant` has been on the lesson contract all along, carrying
 * worked steps and a completion statement, and the teacher preview showed
 * it nowhere - so a teacher could not see one of the five forms their own
 * lesson might reach a student in. The component said adding a tab would
 * mean "inventing a tab, its label and its layout" and left it to design.
 * Design ruled it on 14 Sep and the ruling is exact: show it, label it
 * "Calculation", same shape as the other tabs, steps in sequence, the
 * completion statement beneath them.
 *
 * THE LABEL IS "CALCULATION" AND THE PROSE SAYS "WORKED STEPS". Both are
 * deliberate and neither is a slip to tidy: the tab sits in a row of
 * modality names (Text, Visual, Audio, Interactive), while the review
 * reasons describe what went wrong in sentences, where `reviewReasons.ts`
 * requires "the worked steps" and forbids "calculation variant".
 */
export const VARIANT_TABS = [
  "Text",
  "Visual",
  "Audio",
  "Interactive",
  "Calculation",
] as const;
export type VariantTab = (typeof VARIANT_TABS)[number];

export const VARIANT_ORIENTATION =
  // "these four variants" was true until the calculation tab landed. A
  // sentence that counts is a sentence that goes wrong the day the count
  // changes, so this one no longer counts.
  "Nevo generates every one of these variants for each segment. During the lesson, the system decides which variant a student sees based on how they are engaging. You do not need to assign specific variants to specific students.";

/** Preview paragraphs per variant. Hand-written for the slowed JSS 2A
 *  section; every other section gets an honest derived preview. */
const LINEAR_EQUATIONS_S4: Record<VariantTab, string[]> = {
  Text: [
    "When x appears on both sides, the first move is to collect the x terms together. Subtract the smaller x term from both sides, then solve as before.",
    "Example: 5x + 2 = 3x + 10. Subtracting 3x from both sides leaves 2x + 2 = 10, and from there it solves the usual way.",
  ],
  Visual: [
    "A balance scale shows 5x + 2 on the left pan and 3x + 10 on the right. Removing 3x from each pan keeps the scale level - the remaining weights read 2x + 2 = 10.",
    "Each step redraws the scale, so students watch the equation stay balanced as terms move across.",
  ],
  Audio: [
    "A narrated walk-through of the same worked example, paced with short pauses. Students hear each move stated before they see it - “take three x from both sides” - then confirm it on screen.",
  ],
  Interactive: [
    "Students drag x-blocks off both sides of an on-screen balance until x remains on one side only. The equation updates live with every move, and a gentle check-in appears if the scale tips.",
  ],
  Calculation: [
    "5x + 2 = 3x + 10, worked one step at a time. Students are asked for each move rather than shown it: take 3x from both sides, then 2 from both sides, then divide by 2.",
    "The equation is redrawn after every step, so a student sees 2x + 2 = 10 before they are asked what to do with the 2.",
  ],
};

function derivedVariants(
  title: string,
  type: SectionType,
): Record<VariantTab, string[]> {
  const subject = `“${title}”`;
  const practice = type === "Practice" || type === "Extension";
  return {
    Text: [
      practice
        ? `The written form of ${subject} - each question stated plainly, with one worked line available if a student stalls.`
        : `A plain-written explanation of ${subject}, broken into short steps with one worked line per idea.`,
    ],
    Visual: [
      practice
        ? `The same questions with a diagram alongside each one, so students can see the step before they write it.`
        : `The same idea drawn out - each step of ${subject} appears as a diagram before any text does.`,
    ],
    Audio: [
      `A narrated version of ${subject}, paced with short pauses so students can follow along without reading.`,
    ],
    Interactive: [
      `A hands-on version of ${subject} - students work each step themselves and Nevo checks in as they go.`,
    ],
    Calculation: [
      practice
        ? `${subject} worked one step at a time, with the equation redrawn after each move a student makes.`
        : `The calculation inside ${subject}, broken into steps a student works through rather than watches.`,
    ],
  };
}

export function getSectionVariants(
  lessonId: string,
  sectionIndex: number,
  title: string,
  type: SectionType,
): Record<VariantTab, string[]> {
  if (lessonId === "solving-linear-equations" && sectionIndex === 4) {
    return LINEAR_EQUATIONS_S4;
  }
  return derivedVariants(title, type);
}
