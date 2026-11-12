import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LessonDetailResponse, LessonSegment } from "@/lib/api/lessons";

const { useLessonReview, useSegmentReview } = vi.hoisted(() => ({
  useLessonReview: vi.fn(),
  useSegmentReview: vi.fn(),
}));
vi.mock("@/hooks/useLessonReview", () => ({ useLessonReview }));
vi.mock("@/hooks/useSegmentReview", () => ({ useSegmentReview }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveLessonDetail } from "./LiveLessonDetail";

/**
 * A LESSON THE SERVER HAS SIGNED OFF HAS NOTHING WAITING (Hub's live assign
 * test, 9 Nov). Heat Transfer read "Needs review - a few sections need a quick
 * check before you assign" while the server said its review was complete
 * (`reviewComplete`, `readyToAssign`, no `outstandingReviewSteps`). The count
 * was the parser's per-segment flags, which nothing on this page clears since
 * the review moved to C07k (Lydia, 19 Oct).
 */

const seg = (id: string, over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id,
    segmentKey: `k-${id}`,
    contentType: "explanation",
    sequenceOrder: 1,
    title: `Segment ${id}`,
    body: "",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: true,
    reviewReasons: ["visual_pending"],
    approved: false,
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const FLAGGED = [seg("s-1"), seg("s-2")];

const LESSON = {
  id: "l-heat",
  title: "Heat Transfer",
  status: "completed",
  segmentCount: 7,
  segments: FLAGGED,
  confirmationSummary: null,
} as unknown as LessonDetailResponse;

const reviewState = (over: Record<string, unknown> = {}) =>
  useLessonReview.mockReturnValue({
    keyPoints: [],
    outstanding: 0,
    ready: true,
    hadReview: true,
    loading: false,
    failed: false,
    working: null,
    actionFailed: null,
    accept: vi.fn(),
    amend: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
    signedOff: true,
    missingKeyPoints: 0,
    outstandingSteps: [],
    ...over,
  });

beforeEach(() => {
  // The hook counts the parser's flags: both segments flagged, neither approved.
  useSegmentReview.mockReturnValue({
    outstanding: FLAGGED,
    remaining: 2,
    ready: false,
    approving: null,
    failed: null,
    approve: vi.fn(),
    isApproved: () => false,
  });
});

const show = () => render(<LiveLessonDetail lesson={LESSON} modules={[]} assignments={[]} />);

describe("a lesson the server has signed off and called ready", () => {
  it("does not say it needs review (the live defect)", () => {
    reviewState();

    show();

    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
    expect(screen.queryByText(/need a check before you assign/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still to check/)).not.toBeInTheDocument();
  });

  it("marks none of its segments as waiting", () => {
    reviewState();

    show();

    expect(screen.queryByText("Worth a look")).not.toBeInTheDocument();
  });

  it("is ready to assign", () => {
    reviewState();

    show();

    expect(screen.getByRole("link", { name: "Assign to a class" })).toBeInTheDocument();
  });
});

describe("until the server says so", () => {
  it("still counts the flags when the lesson is not signed off", () => {
    reviewState({ signedOff: false, ready: false });

    show();

    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("still counts them on a deployment that does not say", () => {
    reviewState({ signedOff: null });

    show();

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("A few segments need a check before you assign.")).toBeInTheDocument();
  });

  it("still counts them when the review could not be read", () => {
    reviewState({ failed: true });

    show();

    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

});

/*
 * WHILE THE REVIEW IS ON ITS WAY, NOTHING EITHER WAY (Hub's demo dry run,
 * 12 Nov). This block used to assert the opposite - "still counts them while
 * the review is on its way" - and that was the defect: for the five or six
 * seconds before the review read landed, Heat Transfer said "Needs review -
 * A few segments need a check before you assign." over a lesson the server
 * had signed off, then dropped it.
 */
describe("while the server has not answered yet", () => {
  it("does not say the lesson needs review", () => {
    reviewState({ loading: true, signedOff: null });

    show();

    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
    expect(screen.queryByText(/need a check before you assign/)).not.toBeInTheDocument();
  });

  it("marks none of its segments as waiting", () => {
    reviewState({ loading: true, signedOff: null });

    show();

    expect(screen.queryByText("Worth a look")).not.toBeInTheDocument();
  });

  it("counts the flags once the answer is that the lesson is not signed off", () => {
    reviewState({ loading: false, signedOff: false, ready: false });

    show();

    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });
});

describe("the review line", () => {
  // Lydia, 9 Nov (item 15): "quick" undercuts the rule that nothing reaches a
  // class unreviewed.
  it("never calls the check quick", () => {
    reviewState({ signedOff: null });

    show();

    expect(screen.queryByText(/quick/i)).not.toBeInTheDocument();
  });
});
