import { describe, expect, it } from "vitest";
import { __toCardForTest } from "./useLessonLibrary";
import type { LessonSummary } from "@/lib/api/lessons";

/**
 * The library card's review badge, from the lesson-wide sign-off (Teslim
 * 294584b, 27 Oct: `reviewComplete` on the library list).
 *
 * Since cdba131 a lesson goes to a class only once its whole review is
 * signed, so the card's "Needs review" and "Ready" follow that, not a count
 * of unapproved sections. Where a deployment does not send it, the count is
 * all there is, and it stands.
 */
const lesson = (over: Partial<LessonSummary> = {}) =>
  ({
    id: "l-1",
    title: "Osmosis",
    status: "completed",
    sourceType: "pdf",
    segmentCount: 6,
    reviewSegmentCount: 0,
    unapprovedSegmentCount: 0,
    createdAt: "2026-10-20T09:00:00Z",
    ...over,
  }) as LessonSummary;

describe("the card's review state", () => {
  it("needs review while the lesson is not signed off, whatever the section count", () => {
    const card = __toCardForTest(lesson({ reviewComplete: false }));

    expect(card.status).toBe("Needs review");
    expect(card.needsReview).toBe(true);
    expect(card.reviewComplete).toBe(false);
  });

  it("is ready once it is signed off, whatever the section count", () => {
    const card = __toCardForTest(lesson({ reviewComplete: true, unapprovedSegmentCount: 2 }));

    expect(card.status).toBe("Ready");
    expect(card.needsReview).toBe(false);
    expect(card.reviewComplete).toBe(true);
  });

  it("keeps the section count where the server sends no sign-off", () => {
    const card = __toCardForTest(lesson({ unapprovedSegmentCount: 2 }));

    expect(card.status).toBe("Needs review");
    expect(card.reviewComplete).toBeNull();
  });

  it("puts no badge on a lesson still being read", () => {
    const card = __toCardForTest(lesson({ status: "processing", reviewComplete: false }));

    expect(card.needsReview).toBe(false);
  });
});
