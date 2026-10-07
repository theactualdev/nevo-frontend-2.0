// ── Progress mock data ────────────────────────────────────────────────────────
// These are the SIGNED-OUT walkthrough's sentences. A signed-in child never
// sees them: the growth summary and the per-subject prose come from the
// backend's own `reflection` (3 Sep), read by `useStudentProgress` and
// `useSubjectProgress`. TODO(api): the session markers and the session list still
// have no field and remain fixture-only. All framing is plain-language and
// qualitative — never a percentile, score, or peer comparison.

import type { SubjectTopics } from "@/hooks/useSubjectProgress";

/** Warm, whole-picture summary shown at the top of the Progress tab. */
export const GROWTH_SUMMARY =
  "You've been building strong reading skills this month, and sticking with maths even when it got tricky.";

/**
 * One sample subject, shaped like what a real card reads (33a): its concept
 * names, the subject's note (B29), its topic counts and the topic being worked
 * on (B53). The counts, topics and notes are the Progress frame's own (as
 * redrawn on 6 Oct), from its sample subjects.
 */
export interface SubjectSummary {
  slug: string;
  name: string;
  /** What a live card's line falls back to where no topic is named (D42). */
  concepts: string[];
  /** The note at the card's foot (D120); absent, as in the frame, for one. */
  note?: string;
  /** Topics met, and how many of them are done. */
  topics: SubjectTopics;
  /** The topic being worked on, which takes the card's line. */
  currentTopic?: string;
}

export const SUBJECTS: SubjectSummary[] = [
  {
    slug: "mathematics",
    name: "Mathematics",
    concepts: ["Equivalent fractions", "Counting in 5s", "Telling the time"],
    note: "Fractions are starting to click. You stayed with a tricky one today before it came.",
    topics: { done: 3, total: 8 },
    currentTopic: "Equivalent fractions",
  },
  {
    slug: "english",
    name: "English",
    concepts: ["Rhyming words", "Describing words", "Story beginnings"],
    note: "A really steady run this term. Reading aloud has got noticeably easier.",
    topics: { done: 5, total: 5 },
  },
  {
    slug: "science",
    name: "Science",
    concepts: ["Osmosis", "Floating and sinking", "The water cycle"],
    topics: { done: 1, total: 6 },
    currentTopic: "Osmosis",
  },
];

export interface SessionRow {
  title: string;
  date: string;
  /** Calm, qualitative note for the Session Detail sheet - never a mark. */
  note: string;
}

export interface SubjectDetail {
  name: string;
  /** Plain-language reflection on how the subject has been going. */
  prose: string;
  lessons: SessionRow[];
}

export const SUBJECT_DETAIL: Record<string, SubjectDetail> = {
  mathematics: {
    name: "Mathematics",
    prose:
      "You've been getting quicker at problems that used to take a while. Fractions clicked this week. When something's hard, you're staying with it longer before asking for help.",
    lessons: [
      {
        title: "Adding Fractions",
        date: "2 Jul",
        note: "You stayed with a tricky one for a while before asking for a hint.",
      },
      {
        title: "Counting in 5s",
        date: "28 Jun",
        note: "Quick and confident today - you barely paused.",
      },
      {
        title: "Telling the Time",
        date: "24 Jun",
        note: "The half-past examples took a couple of goes, then it clicked.",
      },
      {
        title: "Number Bonds to 20",
        date: "19 Jun",
        note: "You took your time and got every one right. A calm, steady session.",
      },
    ],
  },
  english: {
    name: "English",
    prose:
      "Your reading has been stretching to longer stories, and you're noticing describing words on your own. You're taking your time with the tricky sentences instead of skipping them.",
    lessons: [
      {
        title: "The Lighthouse",
        date: "1 Jul",
        note: "A longer story than usual, and you stayed with it to the end.",
      },
      {
        title: "Rhyming Words",
        date: "27 Jun",
        note: "You spotted the sound patterns quickly and made up a few of your own.",
      },
      {
        title: "Describing Words",
        date: "22 Jun",
        note: "You started noticing describing words without being asked - lovely.",
      },
      {
        title: "Story Beginnings",
        date: "17 Jun",
        note: "You read the openings slowly and picked a favourite. A gentle start.",
      },
    ],
  },
  science: {
    name: "Science",
    prose:
      "You've started asking more of your own questions, and following them up. When an experiment surprised you, you wanted to know why rather than moving on.",
    lessons: [
      {
        title: "What is Photosynthesis?",
        date: "30 Jun",
        note: "The leaf experiment surprised you, and you wanted to know why.",
      },
      {
        title: "Floating and Sinking",
        date: "25 Jun",
        note: "You made a prediction for every object before testing it.",
      },
      {
        title: "The Water Cycle",
        date: "20 Jun",
        note: "The diagram helped it click - you explained it back in your own words.",
      },
      {
        title: "Living and Non-living",
        date: "15 Jun",
        note: "A steady session - you sorted every card and asked a great question.",
      },
    ],
  },
};
