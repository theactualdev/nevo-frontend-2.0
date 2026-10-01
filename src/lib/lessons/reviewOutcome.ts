import type { RecordReviewResponse, ReviewOutcome } from "@/lib/api/scheduler";

/**
 * What a review session tells the scheduler, and what it may then tell the
 * child.
 *
 * Both halves live here so the decision is one function each and testable
 * without mounting the player.
 */

/** What the screen saw of ONE question about the concept under review. */
export interface RecallEvidence {
  /** Which pick was the first right one - 1 is first try. Null if none was. */
  rightOnPick: number | null;
  /** A hint was on screen before the question was first answered. */
  hinted: boolean;
}

/** Strongest first, so a later index is a weaker report. */
const STRENGTH: readonly ReviewOutcome[] = [
  "first_time",
  "after_hint",
  "second_attempt",
  "not_recalled",
];

/**
 * One question's outcome (B28), as a report of what happened rather than a
 * mark: right first try, right first try with a hint showing, right on the
 * second try, or not recalled within two.
 *
 * A third pick is not recall. On the sheets this app draws, two or three
 * options and a re-opening check mean a child who keeps tapping reaches the
 * right answer by elimination; whether any of these counts as recall is the
 * scheduler's call, and it is told what happened so it can make it.
 */
export function questionOutcome({
  rightOnPick,
  hinted,
}: RecallEvidence): ReviewOutcome {
  if (rightOnPick === 1) return hinted ? "after_hint" : "first_time";
  if (rightOnPick === 2) return "second_attempt";
  return "not_recalled";
}

/**
 * The review's one outcome, from every question it asked about the concept.
 *
 * THE WEAKEST QUESTION SPEAKS FOR THE REVIEW. One record goes per review, and
 * reporting the best answer would say "first time" for a child who got one
 * question right and another wrong twice - recall the scheduler would lengthen
 * the interval on. The weakest is the claim every question supports.
 *
 * NULL WHEN NOTHING WAS ASKED about the concept, and the caller then sends
 * nothing: no evidence either way is not an outcome.
 */
export function reviewOutcome(
  questions: readonly RecallEvidence[],
): ReviewOutcome | null {
  if (questions.length === 0) return null;
  return questions
    .map(questionOutcome)
    .reduce((weakest, next) =>
      STRENGTH.indexOf(next) > STRENGTH.indexOf(weakest) ? next : weakest,
    );
}

/** Where the scheduler write has got to. */
export type ReviewRecord =
  | { state: "unsent" }
  | { state: "pending" }
  | { state: "failed" }
  | { state: "recorded"; response: RecordReviewResponse };

/** Design's signed-off lines (D40, 1 Oct), verbatim. */
export const REVIEW_COPY = {
  firmer: "You've got this one more firmly now.",
  again: "You've been through this one again.",
  later: "We'll bring it back later.",
} as const;

/**
 * What the review's completion screen may claim (D40).
 *
 * "You strengthened this concept" showed whatever happened - including when
 * nothing was recorded at all. Design's ruling splits it:
 *
 *   - THE FIRMER LINE ONLY WHERE THE BACKEND CONFIRMS MOVEMENT. The field that
 *     confirms it is `RecordReviewResponse.recallSuccessful`: the server's own
 *     verdict on the outcome sent, which it alone decides. Nothing the client
 *     counted reaches this line.
 *   - Otherwise "You've been through this one again", which is true of every
 *     child who reached this screen: nothing sent, a failed write, or a review
 *     the server did not count as recall.
 *   - "We'll bring it back later" only when the write came back with a
 *     `nextReviewDue`. It is a promise about scheduling, so it needs the
 *     schedule behind it. The date is checked for being one, never compared to
 *     now - when it falls is the scheduler's business.
 *
 * HELD WHILE THE WRITE IS IN FLIGHT. Showing the plain line and then swapping
 * in the firmer one a moment later turns a report into a reveal, which is a
 * reward mechanic by another route (rule 8). The heading keeps its place and
 * lands once, when there is something true to say.
 */
export function reviewCompletionCopy(record: ReviewRecord): {
  heading: string;
  held: boolean;
  bringBack: boolean;
} {
  const response = record.state === "recorded" ? record.response : null;
  const due = response?.schedule?.nextReviewDue;
  return {
    heading:
      response?.recallSuccessful === true
        ? REVIEW_COPY.firmer
        : REVIEW_COPY.again,
    held: record.state === "pending",
    bringBack: typeof due === "string" && !Number.isNaN(Date.parse(due)),
  };
}
