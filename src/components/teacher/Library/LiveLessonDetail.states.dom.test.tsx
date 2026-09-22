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
  IllustrationWrapper: ({ alt }: { alt: string }) => (
    <div role="img" aria-label={alt} />
  ),
}));

import { LiveLessonDetail } from "./LiveLessonDetail";

/**
 * C06b's three states, drawn as the frame draws them.
 *
 * WHY THIS FILE EXISTS. The review shipped on 22 Sep against the SCRUM-153
 * ticket. `teacher/C06b Lesson Detail.dc.html` had landed in the design drop
 * of 20 Sep and was not pulled until after, so what shipped was built from a
 * ticket and my own reading of it. The diff turned up real divergences, and
 * the two that were not cosmetic are pinned here: what the meta line counts,
 * and what a finished review actually leaves on screen.
 *
 * THE SECOND ONE IS THE ONE I GOT WRONG BY INVENTING. I wrote "you have
 * checked everything Nevo was unsure about" for LR-05. The frame has no such
 * acknowledgement: a lesson with nothing outstanding simply IS the ready
 * state, whether it was reviewed or arrived clean, and it says what a teacher
 * can do next rather than congratulating them on what they just did.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "s-1",
    segmentKey: "k-1",
    contentType: "explanation",
    sequenceOrder: 1,
    title: "What a leaf does",
    body: "",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const kp = (id: string, outstanding: boolean) => ({
  id,
  segmentId: "s-1",
  segmentTitle: "What a leaf does",
  position: 1,
  text: "Leaves are the main site of photosynthesis.",
  extractedText: "Leaves are the main site of photosynthesis.",
  amendedText: null,
  sourceText: "The leaf is where most photosynthesis happens.",
  confidence: "low",
  reviewState: outstanding ? "unsure" : "settled",
  outstanding,
  resolvedAt: null,
  resolvedBy: null,
});

const LESSON = {
  id: "l-9",
  title: "Photosynthesis in Leaves",
  segmentCount: 5,
  segments: [seg(), seg({ id: "s-2", sequenceOrder: 2, title: "Inside the leaf" })],
  confirmationSummary: null,
} as unknown as LessonDetailResponse;

const reviewState = (over: Record<string, unknown> = {}) => {
  useLessonReview.mockReturnValue({
    keyPoints: [],
    outstanding: 0,
    ready: true,
    hadReview: false,
    loading: false,
    failed: false,
    working: null,
    actionFailed: null,
    accept: vi.fn(),
    amend: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
    ...over,
  });
};

const show = (assignments: unknown[] = []) =>
  render(
    <LiveLessonDetail
      lesson={LESSON}
      modules={[]}
      assignments={assignments as never}
    />,
  );

beforeEach(() => {
  reviewState();
  useSegmentReview.mockReturnValue({
    outstanding: [],
    remaining: 0,
    ready: true,
    approving: null,
    failed: null,
    approve: vi.fn(),
    isApproved: () => true,
  });
});

describe("a lesson with nothing outstanding", () => {
  it("is the ready state, not a note about what the teacher just did", () => {
    show();

    expect(screen.getByText("Ready when you are")).toBeInTheDocument();
    expect(
      screen.getByText(/Nevo has prepared this lesson into 5 sections/),
    ).toBeInTheDocument();
  });

  it("says nothing about having checked anything", () => {
    // The invented sentence. It congratulated a teacher for work they may
    // never have done - a lesson can reach this state without a review.
    show();

    expect(screen.queryByText(/You have checked/i)).not.toBeInTheDocument();
  });

  it("stays out of the way once the lesson is assigned", () => {
    // "Ready · not yet assigned" is the frame's own name for it. An assigned
    // lesson is the in-progress state and has its own panel.
    show([{ id: "a-1", studentId: "st-1", classId: "c-1", dueAt: null }]);

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
  });
});

describe("a lesson with key points waiting", () => {
  beforeEach(() => {
    reviewState({
      keyPoints: [kp("kp-1", true), kp("kp-2", true), kp("kp-3", false)],
      outstanding: 2,
      ready: false,
      hadReview: true,
    });
  });

  it("counts key points in the meta line, not sections", () => {
    /*
     * C06b reads "Biology · This term · 6 key points" in this state and
     * "5 sections" in the others - the meta line describes the thing the
     * screen is currently about. This counted sections in every state.
     */
    show();

    expect(screen.getByText(/3 key points/)).toBeInTheDocument();
  });

  it("says what is waiting and what it holds up", () => {
    // The line that stood here named a SECTION and how cleanly it scanned -
    // the old unit, and the old complaint.
    show();

    expect(
      screen.getByText("A few key points need a quick check before you assign."),
    ).toBeInTheDocument();
  });

  it("closes the banner with the reassurance the frame carries", () => {
    show();

    expect(screen.getByText(/Nothing you did is lost\./)).toBeInTheDocument();
  });

  it("puts a heading over the cards", () => {
    show();

    expect(screen.getByText("Key points Nevo found")).toBeInTheDocument();
  });

  it("offers no ready panel while anything is waiting", () => {
    show();

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
  });
});
