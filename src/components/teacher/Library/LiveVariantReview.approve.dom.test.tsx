import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

const { approveSegment, review } = vi.hoisted(() => ({
  approveSegment: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { approveSegment, review } }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveVariantReview } from "./LiveVariantReview";

/**
 * Approval, which this screen went to production without.
 *
 * C07b's stated purpose is that "the teacher reviews each segment's variants
 * and approves them for the class. Approval is manual and deliberate: the
 * teacher stays in control of what reaches students." There was no transport,
 * so what shipped was review WITHOUT approval and the frame's purpose was
 * unmet. Backend built it on 17 Sep once design settled the question.
 *
 * It stopped being cosmetic at the same moment: ASSIGNMENT IS NOW GATED on
 * every segment being approved. Without this control a teacher cannot assign a
 * lesson they have just uploaded, and has no way to unblock themselves.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanation",
    sequenceOrder: 1,
    title: "Common denominators",
    body: "…",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    approved: false,
    approvedAt: null,
    textVariant: { body: "Find a common denominator first.", keyPoints: [] },
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const show = (over: Partial<LessonSegment> = {}, segmentCount = 5) =>
  render(
    <LiveVariantReview
      lessonId="l-1"
      lessonTitle="Adding unlike denominators"
      segment={seg(over)}
      sectionIndex={2}
      segmentCount={segmentCount}
    />,
  );

beforeEach(() => {
  approveSegment.mockReset();
  approveSegment.mockResolvedValue({
    lessonId: "l-1",
    segmentId: "seg-1",
    approvedAt: "2026-09-17T10:00:00Z",
    approvedBy: "teacher-1",
    approvedSegmentCount: 3,
    segmentCount: 5,
    lessonApproved: false,
  });
});

describe("approving a section", () => {
  it("offers the control on a section that is not approved", () => {
    show();

    expect(
      screen.getByRole("button", { name: /approve this section/i }),
    ).toBeInTheDocument();
  });

  it("sends the approval for this lesson and segment", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    await waitFor(() =>
      expect(approveSegment).toHaveBeenCalledWith("l-1", "seg-1"),
    );
  });

  it("reports progress from the response, not from a second read", async () => {
    // The approval response carries the lesson counts precisely so the screen
    // does not have to refetch the lesson to know where it stands.
    show();

    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(await screen.findByText(/3 of 5 sections approved/i)).toBeInTheDocument();
  });

  it("shows the section as approved afterwards, and withdraws the control", async () => {
    /*
     * The gap a mutation run found: every other test here passed with
     * `setApproved(true)` deleted. The progress line comes from the response
     * and the already-approved case is seeded through props, so nothing
     * asserted that a SUCCESSFUL approval changes what the teacher sees. A
     * button that stays offering to approve an approved section invites a
     * second write and reads as though the first did not land.
     */
    show();

    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(await screen.findByText("Approved")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /approve this section/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("says the lesson can be assigned once the last section lands", async () => {
    // The teacher's actual question at this point is whether they can now
    // assign it, which is the thing the gate refuses. The SERVER answers it.
    review.mockResolvedValue({ readyToAssign: true, outstandingCount: 0 });
    approveSegment.mockResolvedValue({
      lessonId: "l-1",
      segmentId: "seg-1",
      approvedAt: "2026-09-17T10:00:00Z",
      approvedBy: "teacher-1",
      approvedSegmentCount: 5,
      segmentCount: 5,
      lessonApproved: true,
    });
    show();

    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(
      await screen.findByText(/every section approved.*can be assigned/i),
    ).toBeInTheDocument();
  });
});

describe("a section already approved", () => {
  it("shows it as approved and offers no second approval", () => {
    // Backfilled segments arrive approved with no approver recorded, so this
    // is the common state on everything already in the library.
    show({ approved: true, approvedAt: null });

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approve this section/i }),
    ).not.toBeInTheDocument();
  });
});

describe("when the write fails", () => {
  it("claims nothing was approved", async () => {
    // Nothing is approved until the server says so. A screen that says
    // "Approved" on a failed write is the shape of bug this console has
    // shipped before.
    approveSegment.mockRejectedValue(new Error("nope"));
    show();

    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(await screen.findByText(/couldn’t record that just now/i)).toBeInTheDocument();
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /approve this section/i }),
    ).toBeInTheDocument();
  });
});

describe("the progress line", () => {
  it("counts sections when the total is known", () => {
    show({}, 5);

    expect(screen.getByText(/reviewing section 2 of 5/i)).toBeInTheDocument();
  });

  it("states no total it was not given", () => {
    // The count is not derivable from one segment, and inventing it would be
    // a number nobody measured.
    render(
      <LiveVariantReview
        lessonId="l-1"
        lessonTitle="Adding unlike denominators"
        segment={seg()}
        sectionIndex={2}
      />,
    );

    expect(screen.getByText(/reviewing section 2$/i)).toBeInTheDocument();
    expect(screen.queryByText(/of 5/i)).not.toBeInTheDocument();
  });
});

/**
 * "CAN BE ASSIGNED" IS THE SERVER'S TO SAY.
 *
 * It was said on the section count alone. Sections are half of what holds a
 * lesson: a key point Nevo could not ground holds it too, and that half is
 * only in the review read. A teacher told "This lesson can be assigned" went
 * back to a greyed-out Assign.
 */
describe("the last section, while key points are still outstanding", () => {
  const lastOne = () =>
    approveSegment.mockResolvedValue({
      lessonId: "l-1",
      segmentId: "seg-1",
      approvedAt: "2026-09-17T10:00:00Z",
      approvedBy: "teacher-1",
      approvedSegmentCount: 5,
      segmentCount: 5,
      lessonApproved: true,
    });

  // Braces matter: a hook that RETURNS a function has it run as cleanup, and
  // `mockReset()` returns the mock - so vitest would call `review()` itself.
  beforeEach(() => {
    review.mockReset();
  });

  it("does not say the lesson can be assigned", async () => {
    review.mockResolvedValue({ readyToAssign: false, outstandingCount: 2 });
    lastOne();
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(
      await screen.findByText("Every section approved. 2 key points waiting for you."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can be assigned/i)).not.toBeInTheDocument();
  });

  it("asks the server about THIS lesson", async () => {
    review.mockResolvedValue({ readyToAssign: true, outstandingCount: 0 });
    lastOne();
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    await screen.findByText(/can be assigned/i);
    expect(review).toHaveBeenCalledWith("l-1");
  });

  it("says only what it knows when the review cannot be read", async () => {
    review.mockRejectedValue(new Error("network"));
    lastOne();
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(await screen.findByText("Every section approved.")).toBeInTheDocument();
    expect(screen.queryByText(/can be assigned/i)).not.toBeInTheDocument();
  });

  it("goes by the verdict, not the key-point count", async () => {
    // Nothing outstanding in THIS payload, and still not ready: a flagged
    // segment elsewhere holds the lesson, and only `readyToAssign` knows.
    review.mockResolvedValue({ readyToAssign: false, outstandingCount: 0 });
    lastOne();
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    await waitFor(() => expect(review).toHaveBeenCalled());
    expect(await screen.findByText("Every section approved.")).toBeInTheDocument();
    expect(screen.queryByText(/can be assigned/i)).not.toBeInTheDocument();
  });

  it("does not ask before the last section", async () => {
    approveSegment.mockResolvedValue({
      lessonId: "l-1",
      segmentId: "seg-1",
      approvedAt: "2026-09-17T10:00:00Z",
      approvedBy: "teacher-1",
      approvedSegmentCount: 3,
      segmentCount: 5,
      lessonApproved: false,
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    await screen.findByText("3 of 5 sections approved.");
    expect(review).not.toHaveBeenCalled();
  });
});

/**
 * C07b's end state carries its next step: "Assign to classes".
 */
describe("the way on from the last approval", () => {
  const lastOne = () =>
    approveSegment.mockResolvedValue({
      lessonId: "l-1",
      segmentId: "seg-1",
      approvedAt: "2026-09-17T10:00:00Z",
      approvedBy: "teacher-1",
      approvedSegmentCount: 5,
      segmentCount: 5,
      lessonApproved: true,
    });

  beforeEach(() => {
    review.mockReset();
  });

  it("offers Assign to classes once the server says it can go", async () => {
    review.mockResolvedValue({ readyToAssign: true, outstandingCount: 0 });
    lastOne();
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    expect(await screen.findByRole("link", { name: "Assign to classes" })).toHaveAttribute(
      "href",
      "/teacher/lessons/assign?lesson=l-1",
    );
  });

  it("offers nothing while key points are still waiting", async () => {
    review.mockResolvedValue({ readyToAssign: false, outstandingCount: 2 });
    lastOne();
    show();
    fireEvent.click(screen.getByRole("button", { name: /approve this section/i }));

    await screen.findByText(/2 key points waiting/);
    expect(screen.queryByRole("link", { name: "Assign to classes" })).not.toBeInTheDocument();
  });
});

/**
 * T58. The picture's sign-off line read the segment the page loaded with, so
 * the teacher who had just approved it was told nobody had.
 */
describe("the picture's sign-off line", () => {
  const PICTURE = { imageUrl: null, caption: "A leaf in cross-section", reviewedBy: null };
  const visual = () => fireEvent.click(screen.getByRole("tab", { name: "Visual" }));

  it("says nobody has signed it off while the section waits", () => {
    show({ visualVariant: PICTURE as never });
    visual();

    expect(screen.getByText("No one has signed this picture off yet.")).toBeInTheDocument();
  });

  it("stops saying so the moment the teacher approves it", async () => {
    show({ visualVariant: PICTURE as never });
    visual();
    fireEvent.click(screen.getByRole("button", { name: "Approve this section" }));

    await screen.findByText("Approved");
    expect(screen.queryByText("No one has signed this picture off yet.")).not.toBeInTheDocument();
  });

  it("does not say so of a section approved before the page opened", () => {
    show({ approved: true, visualVariant: PICTURE as never });
    visual();

    expect(screen.queryByText("No one has signed this picture off yet.")).not.toBeInTheDocument();
  });

  it("still names who signed it off, when the server says", () => {
    show({ approved: true, visualVariant: { ...PICTURE, reviewedBy: "Ms Bello" } as never });
    visual();

    expect(screen.getByText("Signed off by Ms Bello.")).toBeInTheDocument();
  });
});

/**
 * T54. One section per URL, and no way to the next but back to the lesson.
 * C07b draws a pill per section.
 */
describe("the section pills", () => {
  const pills = () => screen.getByRole("navigation", { name: "Sections" });

  it("draws one per section, each its own address", () => {
    show({}, 5);
    const links = Array.from(pills().querySelectorAll("a"));

    expect(links.map((a) => a.textContent)).toEqual([
      "Section 1",
      "Section 2",
      "Section 3",
      "Section 4",
      "Section 5",
    ]);
    expect(links[3]).toHaveAttribute("href", "/teacher/lessons/l-1/variants?section=4");
  });

  it("marks this section as the current one, in the frame's filled pill", () => {
    show({}, 5);
    const here = screen.getByRole("link", { name: "Section 2" });

    expect(here).toHaveAttribute("aria-current", "page");
    expect(here.className).toMatch(/bg-nevo-navy/);
  });

  it("tints the sections before this one and leaves the rest plain", () => {
    show({}, 5);

    expect(screen.getByRole("link", { name: "Section 1" }).className).toMatch(/bg-nevo-violet\/12/);
    expect(screen.getByRole("link", { name: "Section 3" }).className).toMatch(/bg-nevo-cream-elevated/);
    expect(screen.getByRole("link", { name: "Section 3" })).not.toHaveAttribute("aria-current");
  });

  it("draws none for a lesson of one section", () => {
    show({}, 1);

    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  });
});

/**
 * DESIGN, 8 OCT: at tablet the review note conforms to its host - no cap of
 * its own (it was 680px), and the screen's tab row: equal widths, 38px,
 * 12.5px. Desktop keeps the 820px reading column and its own tabs.
 */
describe("at tablet width", () => {
  it("takes the host's width, capping only from 1280px", () => {
    show();
    const column = screen.getByRole("tablist").closest("[class*='xl:max-w-[820px]']")!;

    expect(column).not.toBeNull();
    expect(column.className).not.toMatch(/(^| )max-w-/);
  });

  it("lays its tabs out as the screen's row: equal widths, one line", () => {
    show();
    const row = screen.getByRole("tablist");

    expect(row.className.split(" ")).not.toContain("flex-wrap");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("flex-1", "basis-0", "h-[38px]", "text-[12.5px]", "xl:flex-none");
    }
  });
});
