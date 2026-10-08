import type { ObservationPattern } from "@/lib/api/classes";

/**
 * Plain-language wording for the five roster observation patterns.
 *
 * `LearnerObservationPattern` is a closed enum and the backend deliberately
 * stopped phrasing it - the wording is the client's and the guarantee lives in
 * the schema. This file is that wording, and it is the ONLY copy of it, so a
 * second screen that grows an observations row imports from here rather than
 * writing a set that drifts from this one.
 *
 * ZERO-TAG GOVERNS EVERY STRING BELOW. An observation says what HAPPENED. It
 * must never harden into a trait, a diagnosis, a deficit or a judgement, and
 * the note on each entry records which wrong reading that phrasing is steering
 * away from. The guard is also a test: `observations.test.ts` fails on trait
 * vocabulary, so a later edit cannot quietly slide back.
 *
 * NOTHING HERE DATES ITSELF. The roster route declares no window and no cap, so
 * "this week" and "in the last 30 days" are claims the API has not made.
 */

export interface ObservationCopy {
  title: string;
  body: (firstName: string) => string;
}

/*
 * The sentences below are DESIGN'S FINAL WORDING (15 Sep), with one change I
 * made and flagged back: theirs read "the lessons she starts" and "material she
 * had already covered". Nevo stores no pronoun for any child, and this renders
 * beside a named learner on a SEND record, so a guessed pronoun would be wrong
 * for some children on the one screen that must not get a child wrong. Singular
 * they is used instead, and it is the only edit to their copy.
 */
export const OBSERVATION_COPY: Record<ObservationPattern, ObservationCopy> = {
  // An event, stated as an event. Deliberately not a rate: a rate is a score
  // about a child, and this screen already refuses scores elsewhere.
  completed_lessons: {
    title: "Lessons finished",
    body: (first) => `${first} has been finishing the lessons they start.`,
  },
  // THE TRAP ONE. "Revisited" converts to "struggles with retention" in one
  // careless reading. The second sentence exists only to block that: it states
  // a fact about the PRODUCT, not about the child.
  revisited_content: {
    title: "Went back over something",
    body: (first) =>
      `${first} went back to material they had already covered. Nevo's lessons are built to be re-entered, so returning to one is part of how they work.`,
  },
  // Short on purpose. "Steadier" is the backend's comparative and the basis it
  // compared against is not in the response - so no "than last week" (no window
  // in the contract) and no "fewer long pauses" (a mechanism we were not told).
  steadier_pace: {
    title: "Pace",
    body: (first) => `Nevo has seen ${first}'s pace even out.`,
  },
  // Names no modality. The response says a switch happened, never which way,
  // and "prefers audio" or "needs visuals" is exactly the learning-style label
  // the card above this section promises the console does not produce.
  tried_another_format: {
    title: "Tried another format",
    body: (first) =>
      `${first} has worked through lessons in more than one way.`,
  },
  // An ordinary reading, said plainly. "No pattern" must not land as idleness.
  no_recent_pattern: {
    title: "Nothing standing out",
    body: (first) =>
      `Nothing consistent enough to name this time. That is an ordinary reading rather than a finding about how much ${first} has done.`,
  },
};

/**
 * The count, when it may be shown at all.
 *
 * TWO RULINGS FROM DESIGN (15 Sep), and the second is the interesting one.
 *
 * 1. No sentence ever interpolates the count. It renders as its own chip
 *    beside the row, and there is simply no chip when there is none. `count`
 *    is OPTIONAL AND NULLABLE on the contract - `LearnerObservationResponse`
 *    requires `pattern` alone - and a card that interpolated it printed "null
 *    times". This kills that by shape rather than by defensive coding.
 *
 * 2. ONLY `completed_lessons` may carry one. On `revisited_content` a number
 *    is precisely the thing that converts the careful sentence above back into
 *    "struggles with retention" - "went back over it 7 times" is a finding
 *    about a child however it is phrased. On the other three it tells a
 *    teacher nothing they can act on. So the count appears once, where it is
 *    unambiguous and is good news.
 *
 * Absent still means we were not told how many, which is not zero.
 *
 * IN LESSONS, NOT TIMES (Lydia, 7 Oct): "12 lessons", not "12 times". The
 * pattern is completed lessons, and "times" on a chip beside a child reads as
 * a tally of something they did - the unit says what was counted.
 */
export function observationCount(
  pattern: ObservationPattern,
  count?: number | null,
): string | null {
  if (pattern !== "completed_lessons") return null;
  if (typeof count !== "number") return null;
  return count === 1 ? "1 lesson" : `${count} lessons`;
}
