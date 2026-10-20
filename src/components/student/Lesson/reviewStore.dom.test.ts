import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, setSession } from "@/lib/auth/session";
import {
  forgetReviewAnswers,
  loadCheckOutcome,
  loadReviewAnswers,
  saveCheckOutcome,
  saveReviewAnswers,
} from "./reviewStore";

/**
 * The after-lesson picks, and the check-in's outcome, in this tab.
 *
 * Keyed by account, so the next child never READ them - and still kept:
 * sessionStorage outlives a sign-out in the tab, so which options a child
 * picked stayed on a shared tablet until the tab closed (19 Oct
 * browser-storage audit). A sign-out forgets the leaving child's, and only
 * theirs.
 */

const signInAs = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });

const picks = [{ questionIndex: 0, selectedId: "opt-b" }];
const outcome = { mastered: ["Fractions"], revisit: [], note: "" };

/** Save one lesson's picks and outcome as whoever is signed in. */
const keepAs = (userId: string | null) => {
  if (userId) signInAs(userId);
  else clearSession();
  saveReviewAnswers("lesson-1", picks);
  saveCheckOutcome("lesson-1", outcome);
};

beforeEach(() => {
  clearSession();
  window.sessionStorage.clear();
});

describe("forgetReviewAnswers", () => {
  it("forgets the leaving child's picks and outcomes", () => {
    keepAs("child-a");

    forgetReviewAnswers("child-a");

    expect(loadReviewAnswers("lesson-1")).toEqual([]);
    expect(loadCheckOutcome("lesson-1")).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("leaves another child's, and the walkthrough's, exactly as they were", () => {
    keepAs("child-b");
    keepAs(null);
    keepAs("child-a");

    forgetReviewAnswers("child-a");

    signInAs("child-b");
    expect(loadReviewAnswers("lesson-1")).toEqual(picks);
    expect(loadCheckOutcome("lesson-1")).toEqual(outcome);
    clearSession();
    expect(loadReviewAnswers("lesson-1")).toEqual(picks);
  });

  it("does not reach for a child whose id merely begins the same way", () => {
    keepAs("child-a2");

    forgetReviewAnswers("child-a");

    expect(window.sessionStorage.length).toBe(2);
  });

  it("forgets nobody's for no account at all", () => {
    keepAs(null);

    forgetReviewAnswers("");

    expect(window.sessionStorage.length).toBe(2);
  });
});
