import { describe, expect, it } from "vitest";
import {
  REVIEW_COPY,
  questionOutcome,
  reviewCompletionCopy,
  reviewOutcome,
  type ReviewRecord,
} from "./reviewOutcome";
import type { RecordReviewResponse } from "@/lib/api/scheduler";

/**
 * What a review tells the scheduler (B28), and what the child is told after
 * (D40). The second used to be fixed copy - "You strengthened this concept" -
 * shown whatever happened, including when nothing was recorded at all.
 */

describe("one question's outcome", () => {
  it("is first_time when the first pick was right", () => {
    expect(questionOutcome({ rightOnPick: 1, hinted: false })).toBe(
      "first_time",
    );
  });

  it("is after_hint when the first pick was right with a hint showing", () => {
    // Only first_time lengthens the interval, so a hinted answer reported as
    // first_time would stretch it on help the child was given.
    expect(questionOutcome({ rightOnPick: 1, hinted: true })).toBe(
      "after_hint",
    );
  });

  it("is second_attempt when the second pick was right", () => {
    expect(questionOutcome({ rightOnPick: 2, hinted: false })).toBe(
      "second_attempt",
    );
  });

  it("is not_recalled past the second pick, or with no right pick", () => {
    expect(questionOutcome({ rightOnPick: 3, hinted: false })).toBe(
      "not_recalled",
    );
    expect(questionOutcome({ rightOnPick: null, hinted: false })).toBe(
      "not_recalled",
    );
  });
});

describe("the review's outcome", () => {
  it("is nothing when nothing was asked about the concept", () => {
    expect(reviewOutcome([])).toBeNull();
  });

  it("is the weakest question's, not the best", () => {
    expect(
      reviewOutcome([
        { rightOnPick: 1, hinted: false },
        { rightOnPick: 2, hinted: false },
        { rightOnPick: 1, hinted: true },
      ]),
    ).toBe("second_attempt");
  });

  it("is first_time only when every question was right first time unaided", () => {
    expect(
      reviewOutcome([
        { rightOnPick: 1, hinted: false },
        { rightOnPick: 1, hinted: false },
      ]),
    ).toBe("first_time");
  });
});

const recorded = (over: Partial<RecordReviewResponse> = {}): ReviewRecord => ({
  state: "recorded",
  response: {
    recallSuccessful: false,
    outcome: "second_attempt",
    schedule: {
      studentId: "s-1",
      conceptId: "c-1",
      stability: 2,
      difficulty: 5,
      retrievability: 0.9,
      lastReview: "2026-10-01T10:00:00Z",
      reviewCount: 3,
      nextReviewDue: "2026-10-08T10:00:00Z",
      lessonId: null,
    },
    ...over,
  },
});

describe("what the completion screen may claim (D40)", () => {
  it("says the firmer line only where the server confirmed recall", () => {
    expect(
      reviewCompletionCopy(recorded({ recallSuccessful: true })).heading,
    ).toBe(REVIEW_COPY.firmer);
  });

  it("says the plain line where the server did not count it", () => {
    expect(reviewCompletionCopy(recorded()).heading).toBe(REVIEW_COPY.again);
  });

  it("says the plain line where nothing was recorded", () => {
    expect(reviewCompletionCopy({ state: "unsent" }).heading).toBe(
      REVIEW_COPY.again,
    );
    expect(reviewCompletionCopy({ state: "failed" }).heading).toBe(
      REVIEW_COPY.again,
    );
  });

  it("uses design's words exactly", () => {
    expect(REVIEW_COPY.firmer).toBe("You've got this one more firmly now.");
    expect(REVIEW_COPY.again).toBe("You've been through this one again.");
  });

  it("holds the heading while the write is in flight, and only then", () => {
    expect(reviewCompletionCopy({ state: "pending" }).held).toBe(true);
    expect(reviewCompletionCopy({ state: "unsent" }).held).toBe(false);
    expect(reviewCompletionCopy({ state: "failed" }).held).toBe(false);
    expect(reviewCompletionCopy(recorded()).held).toBe(false);
  });

  it("promises a return only when the schedule came back with a date", () => {
    expect(reviewCompletionCopy(recorded()).bringBack).toBe(true);
    expect(reviewCompletionCopy({ state: "unsent" }).bringBack).toBe(false);
    expect(reviewCompletionCopy({ state: "pending" }).bringBack).toBe(false);
    expect(reviewCompletionCopy({ state: "failed" }).bringBack).toBe(false);
  });

  it("does not promise a return on a date that is not one", () => {
    const bad = recorded();
    if (bad.state !== "recorded") throw new Error("unreachable");
    bad.response.schedule.nextReviewDue = "unknown";
    expect(reviewCompletionCopy(bad).bringBack).toBe(false);
  });
});
