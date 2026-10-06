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
  status: "completed",
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

describe("the gate QA met", () => {
  it("assigns on the server's verdict even with unapproved segments about", () => {
    /*
     * QA, 22 Sep: "assign still blocked after approving everything."
     *
     * The caller read `review.ready && outstandingSections === 0`, and that
     * second clause was the thing backend asked by name not to do.
     * `LessonDetailActions` has a test proving IT gates on `ready` - the
     * count was ANDed in one line before it was passed, where that test
     * could not see it. So this test is at the caller, deliberately.
     */
    useSegmentReview.mockReturnValue({
      outstanding: [],
      remaining: 5,
      ready: false,
      approving: null,
      failed: null,
      approve: vi.fn(),
      isApproved: () => false,
    });
    reviewState({ ready: true, outstanding: 0 });

    show();

    expect(
      screen.getByRole("link", { name: "Assign to a class" }),
    ).toBeInTheDocument();
  });

  it("still refuses when the server refuses", () => {
    reviewState({ ready: false, outstanding: 2, hadReview: true });

    show();

    expect(
      screen.queryByRole("link", { name: "Assign to a class" }),
    ).not.toBeInTheDocument();
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

/**
 * A SECTION THAT HAS BEEN CHECKED STOPS ASKING TO BE.
 *
 * Found by the first real end-to-end run, 25 Sep, and by nothing else: a lesson
 * reviewed, approved in full and sent to seven children still marked every
 * section below "Worth a look". The rows read `needsReview`, which is the
 * parser's verdict and never clears - approval sets `approved` and leaves the
 * flag where it was. The review hook had the right answer all along.
 *
 * No existing test caught it because none drew a flagged section that had
 * already been approved. These do, and they pin the other half too: the review
 * list KEEPS an approved section, shown as checked, so "fix it everywhere" is
 * the wrong repair.
 */
describe("the section rows once a teacher has checked them", () => {
  const FLAGGED_A = seg({ id: "s-1", sequenceOrder: 1, title: "What a leaf does", needsReview: true });
  const FLAGGED_B = seg({ id: "s-2", sequenceOrder: 2, title: "Inside the leaf", needsReview: true });

  const showWith = (segments: LessonSegment[]) =>
    render(
      <LiveLessonDetail
        lesson={{ ...LESSON, segments } as LessonDetailResponse}
        modules={[]}
        assignments={[]}
      />,
    );

  const sectionReview = (outstanding: LessonSegment[], approvedIds: string[]) =>
    useSegmentReview.mockReturnValue({
      outstanding,
      remaining: outstanding.length,
      ready: outstanding.length === 0,
      approving: null,
      failed: null,
      approve: vi.fn(),
      isApproved: (x: LessonSegment) => approvedIds.includes(x.id),
    });

  it("marks a flagged section while it is still waiting", () => {
    sectionReview([FLAGGED_A], []);

    showWith([FLAGGED_A]);

    expect(screen.getByText("Worth a look")).toBeInTheDocument();
  });

  it("stops marking a flagged section once it has been approved", () => {
    // `needsReview` is still true here, exactly as the server sends it after
    // approval. Only the hook's list says it is done.
    sectionReview([], ["s-1"]);

    showWith([FLAGGED_A]);

    expect(screen.queryByText("Worth a look")).not.toBeInTheDocument();
  });

  it("marks only the section that is still waiting", () => {
    sectionReview([FLAGGED_B], ["s-1"]);

    showWith([FLAGGED_A, FLAGGED_B]);

    expect(screen.getAllByText("Worth a look")).toHaveLength(1);
  });

  it("draws no review border once everything has been approved", () => {
    /*
     * The violet left edge is the same signal as the chip, drawn a second way,
     * and a mutation run found nothing checked it - the chip could be fixed and
     * the border left saying the opposite. The review list uses the same edge
     * for a section still waiting, so with everything approved there should be
     * none anywhere on the page.
     */
    sectionReview([], ["s-1", "s-2"]);

    const { container } = showWith([FLAGGED_A, FLAGGED_B]);

    expect(container.querySelectorAll('[class*="border-l-[3px]"]')).toHaveLength(0);
  });

  it("marks a waiting section inside a module as well as outside one", () => {
    /*
     * The rows are drawn from two places - grouped under a module, and the
     * ungrouped remainder - and every test above had no modules, so the grouped
     * call site was never rendered. A mutation run that never marked grouped
     * sections survived.
     */
    sectionReview([FLAGGED_A], []);

    render(
      <LiveLessonDetail
        lesson={{ ...LESSON, segments: [FLAGGED_A] } as LessonDetailResponse}
        modules={[
          {
            id: "m-1",
            title: "How leaves work",
            recap: null,
            preview: null,
            sequenceOrder: 1,
            segmentIds: ["s-1"],
          },
        ]}
        assignments={[]}
      />,
    );

    expect(screen.getByText("How leaves work")).toBeInTheDocument();
    expect(screen.getByText("Worth a look")).toBeInTheDocument();
  });

  it("keeps the approved section in the review list, shown as checked", () => {
    // The OTHER half, and the reason the review list is built differently: a
    // teacher who accepts a section must see it settle, not vanish.
    sectionReview([], ["s-1"]);

    showWith([FLAGGED_A]);

    expect(screen.getByText("Checked")).toBeInTheDocument();
    expect(screen.queryByText("Worth a look")).not.toBeInTheDocument();
  });
});

/**
 * WHAT THE PAGE CLAIMS WHEN IT DOES NOT KNOW - or when there is nothing to send.
 *
 * Three ways this page said "Ready when you are... Assign it to a class" over
 * something that was not ready: a failed assignments read, a lesson whose
 * parse failed or is still running, and the window before the review read
 * lands. Rule 5 - absence is an instruction, not a gap to fill.
 */
describe("when who has this lesson could not be read", () => {
  const showFailed = () =>
    render(
      <LiveLessonDetail
        lesson={LESSON}
        modules={[]}
        assignments={[]}
        assignmentsFailed
      />,
    );

  it("does not say the lesson was never assigned", () => {
    showFailed();

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
  });

  it("says it could not find out, where the schedule would be", () => {
    showFailed();

    expect(
      screen.getByText(/couldn’t load who has this lesson just now/),
    ).toBeInTheDocument();
  });

  it("says nothing of the kind when the read landed", () => {
    show();

    expect(screen.queryByText(/couldn’t load who has this lesson/)).not.toBeInTheDocument();
  });
});

describe("a lesson with nothing to send", () => {
  const showAs = (over: Record<string, unknown>) =>
    render(
      <LiveLessonDetail
        lesson={{ ...LESSON, ...over } as LessonDetailResponse}
        modules={[]}
        assignments={[]}
      />,
    );

  it("is not called ready when its parse failed", () => {
    showAs({ status: "failed", segments: [], segmentCount: 0 });

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
    expect(screen.queryByText(/prepared this lesson into 0 sections/)).not.toBeInTheDocument();
  });

  it("offers no Assign when its parse failed", () => {
    showAs({ status: "failed", segments: [], segmentCount: 0 });

    expect(screen.queryByText("Assign to a class")).not.toBeInTheDocument();
  });

  it("offers no Assign while it is still being read", () => {
    showAs({ status: "processing" });

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
    expect(screen.queryByText("Assign to a class")).not.toBeInTheDocument();
  });

  it("offers no Assign while it is waiting to be read", () => {
    showAs({ status: "pending" });

    expect(screen.queryByText("Assign to a class")).not.toBeInTheDocument();
  });

  it("offers no Assign for a finished lesson with no sections in it", () => {
    showAs({ segments: [], segmentCount: 0 });

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
    expect(screen.queryByText("Assign to a class")).not.toBeInTheDocument();
  });

  it("is ready when the parse finished with things to review", () => {
    showAs({ status: "completed_with_review" });

    expect(screen.getByText("Ready when you are")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assign to a class" })).toBeInTheDocument();
  });
});

describe("while the review is still being read", () => {
  it("is not the ready state yet", () => {
    reviewState({ loading: true });
    show();

    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
  });

  it("holds Assign, so it cannot be pressed into a 409", () => {
    reviewState({ loading: true });
    show();

    expect(screen.queryByRole("link", { name: "Assign to a class" })).not.toBeInTheDocument();
    expect(screen.getByText("Assign to a class")).toHaveAttribute("aria-disabled", "true");
  });

  it("does not explain a refusal nobody has made", () => {
    reviewState({ loading: true });
    show();

    expect(screen.queryByText("Still being checked.")).not.toBeInTheDocument();
    expect(screen.queryByText(/still to check/)).not.toBeInTheDocument();
  });

  it("lets Assign go the moment the answer is ready", () => {
    reviewState({ loading: false, ready: true });
    show();

    expect(screen.getByRole("link", { name: "Assign to a class" })).toBeInTheDocument();
  });
});

/**
 * THE PAGE HANDS THE SCHEDULE ITS CLASS NAMES. The schedule names a group
 * from the lesson's own classes first; a page that forgot to pass them would
 * put every group back to "A class" while the class list loads or fails,
 * with every schedule test still green.
 */
describe("the schedule on this page", () => {
  it("names a group after the class the lesson went to", () => {
    render(
      <LiveLessonDetail
        lesson={LESSON}
        modules={[]}
        assignments={[
          { id: "a-1", studentId: "st-1", classId: "c-1", status: "assigned", dueAt: null, availableFrom: null },
        ] as never}
        classes={[{ id: "c-1", name: "Year 7 Blue", yearGroup: null, studentCount: 1 }] as never}
      />,
    );

    expect(screen.queryByText(/A class/)).not.toBeInTheDocument();
  });
});

/**
 * THE ENGINE'S NOTE ON A SECTION, AND THE SUBJECT.
 *
 * Class progress carries a note per section and nothing read it; the slowed
 * section was marked by colour alone. And the header never said what subject
 * the lesson is, though C06b draws it first.
 */
describe("what the page says about each section", () => {
  const PROGRESS = {
    lessonId: "l-9",
    classId: "c-1",
    slowestSegmentId: "s-2",
    slowdownNote: null,
    segments: [
      {
        segmentId: "s-2",
        segmentKey: "k-2",
        title: "Inside the leaf",
        sequenceOrder: 2,
        assignedStudentCount: 7,
        completionCount: 4,
        completionRate: 4 / 7,
        averageTimeSeconds: 300,
        slowdownCount: 3,
        note: "Nevo read this section aloud for most of the class.",
      },
    ],
  };

  it("quotes the engine's note under its section", () => {
    render(
      <LiveLessonDetail lesson={LESSON} modules={[]} assignments={[]} progress={PROGRESS as never} />,
    );

    expect(screen.getByText("Nevo read this section aloud for most of the class.")).toBeInTheDocument();
  });

  it("builds no note of its own from the slowdown count", () => {
    render(
      <LiveLessonDetail
        lesson={LESSON}
        modules={[]}
        assignments={[]}
        progress={{ ...PROGRESS, segments: [{ ...PROGRESS.segments[0], note: null }] } as never}
      />,
    );

    expect(screen.queryByText(/slowed here/i)).not.toBeInTheDocument();
  });

  it("names the subject in the header", () => {
    render(
      <LiveLessonDetail
        lesson={{ ...LESSON, subject: "Biology" } as LessonDetailResponse}
        modules={[]}
        assignments={[]}
      />,
    );

    expect(screen.getByText(/Biology ·/)).toBeInTheDocument();
  });
});

/**
 * C06b's "Ready · not yet assigned" pill, and its two headings.
 */
describe("the ready lesson's pill and headings", () => {
  it("draws Ready beside the title on a lesson nobody has yet", () => {
    show();

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("draws no Ready once the lesson is assigned", () => {
    show([{ id: "a-1", studentId: "st-1", classId: "c-1", status: "assigned", dueAt: null, availableFrom: null }]);

    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("draws no Ready while the review is still being read", () => {
    reviewState({ loading: true });
    show();

    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("draws no Ready while something is waiting", () => {
    reviewState({ ready: false, outstanding: 2, hadReview: true });
    show();

    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("draws no Ready beside Needs review, even when the server would let it go", () => {
    // The server can say ready while flagged sections are still unapproved.
    // Both pills at once would contradict each other.
    reviewState({ ready: true, outstanding: 0 });
    useSegmentReview.mockReturnValue({
      outstanding: [],
      remaining: 2,
      ready: false,
      approving: null,
      failed: null,
      approve: vi.fn(),
      isApproved: () => false,
    });
    show();

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("calls the sections what's inside before anyone has worked through them", () => {
    show();

    expect(screen.getByText("What’s inside")).toBeInTheDocument();
  });

  it("calls them how the class moved through it once there is progress", () => {
    render(
      <LiveLessonDetail
        lesson={LESSON}
        modules={[]}
        assignments={[]}
        progress={{ lessonId: "l-9", classId: "c-1", slowestSegmentId: null, slowdownNote: null, segments: [] } as never}
      />,
    );

    expect(screen.getByText("How the class moved through it")).toBeInTheDocument();
  });
});
