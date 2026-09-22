import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { approveSegment } = vi.hoisted(() => ({ approveSegment: vi.fn() }));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: { ...actual.lessonsApi, approveSegment },
  };
});

import { useSegmentReview } from "./useSegmentReview";
import type { LessonSegment } from "@/lib/api/lessons";

/**
 * SCRUM-153: the review a teacher does before their own lesson can go out.
 *
 * Assignment is gated on every section being approved, and the only screen
 * that could approve one was the variant review, behind a link inside a row.
 * A teacher was told their lesson needed checking, pointed at a page that does
 * not exist, and could not assign it. It stopped a demonstration.
 *
 * THE COUNTS ARE THE SERVER'S, not this screen's arithmetic. The same server
 * refuses the assignment with a 409, so a page that counted for itself could
 * unlock a button that then fails - which is the defect one level along.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "s-1",
    segmentKey: "k-1",
    sequenceOrder: 1,
    contentType: "explanatory_text",
    title: "What a fraction is",
    body: "A fraction names a part of a whole.",
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    needsReview: true,
    reviewReasons: ["model_flagged_for_review"],
    approved: false,
    approvedAt: null,
    ...over,
  }) as unknown as LessonSegment;

const approval = (over: Record<string, unknown> = {}) => ({
  lessonId: "l-1",
  segmentId: "s-1",
  approvedAt: "2026-09-21T09:00:00Z",
  approvedBy: "t-1",
  approvedSegmentCount: 1,
  segmentCount: 2,
  lessonApproved: false,
  ...over,
});

beforeEach(() => {
  approveSegment.mockReset().mockResolvedValue(approval());
});

describe("what is outstanding", () => {
  it("counts the sections nobody has approved", () => {
    const { result } = renderHook(() =>
      useSegmentReview("l-1", [seg(), seg({ id: "s-2" })]),
    );

    expect(result.current.remaining).toBe(2);
    expect(result.current.ready).toBe(false);
  });

  it("treats a lesson approved before the gate as done", () => {
    // 104 segments were backfilled `approved` with no approver recorded. They
    // are approved; a screen that asked for them again would be asking a
    // teacher to redo something the record says is done.
    const { result } = renderHook(() =>
      useSegmentReview("l-1", [seg({ approved: true, approvedAt: null })]),
    );

    expect(result.current.remaining).toBe(0);
    expect(result.current.ready).toBe(true);
  });
});

describe("accepting one", () => {
  it("sends the approval for that section", async () => {
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1"));

    await waitFor(() =>
      expect(approveSegment).toHaveBeenCalledWith("l-1", "s-1"),
    );
  });

  it("takes the server's count, not its own", async () => {
    // The screen has two sections in hand; the server says four of five are
    // approved. The server is the one that will refuse the assignment.
    approveSegment.mockResolvedValue(
      approval({ approvedSegmentCount: 4, segmentCount: 5 }),
    );
    const { result } = renderHook(() =>
      useSegmentReview("l-1", [seg(), seg({ id: "s-2" })]),
    );

    act(() => result.current.approve("s-1"));

    await waitFor(() => expect(result.current.remaining).toBe(1));
  });

  it("unlocks the lesson only when the server says so", async () => {
    approveSegment.mockResolvedValue(
      approval({ approvedSegmentCount: 2, segmentCount: 2, lessonApproved: true }),
    );
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1"));

    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it("does not unlock on a local count when the server withholds it", async () => {
    // Every section this page knows about is now approved, and the server
    // still says the lesson is not. It knows about segments this page does
    // not, and it is the one that answers the assignment.
    approveSegment.mockResolvedValue(
      approval({ approvedSegmentCount: 1, segmentCount: 3, lessonApproved: false }),
    );
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1"));

    await waitFor(() => expect(result.current.isApproved(seg())).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(result.current.remaining).toBe(2);
  });

  it("sends one approval however many times the control is pressed", async () => {
    approveSegment.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1"));
    act(() => result.current.approve("s-1"));

    await waitFor(() => expect(approveSegment).toHaveBeenCalledTimes(1));
    expect(result.current.approving).toBe("s-1");
  });

  it("tells the caller when an approval lands, so the rest can catch up", async () => {
    /*
     * A SECTION IS NO LONGER THE WHOLE REVIEW. Backend's ruling of 21 Sep:
     * a lesson is held by a flagged segment nobody approved OR an ungrounded
     * key point, and `readyToAssign` - which accounts for both - lives in a
     * different read.
     *
     * So settling the last section has to tell that read to run again.
     * Without this, the teacher finishes and Assign stays grey until they
     * reload the page, which is a version of the bug this ticket is about.
     */
    approveSegment.mockResolvedValue(
      approval({ approvedSegmentCount: 1, segmentCount: 1, lessonApproved: true }),
    );
    const onApproved = vi.fn();
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1", onApproved));

    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
  });

  it("does not tell the caller about an approval that failed", async () => {
    // Nothing moved, so there is nothing for the other half to catch up with.
    approveSegment.mockRejectedValue(new Error("network"));
    const onApproved = vi.fn();
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1", onApproved));

    await waitFor(() => expect(result.current.failed).toBe("s-1"));
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("leaves the section outstanding when the approval did not land", async () => {
    // Nothing about the lesson changed, and the gate still holds - so the
    // control has to stay where it is.
    approveSegment.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useSegmentReview("l-1", [seg()]));

    act(() => result.current.approve("s-1"));

    await waitFor(() => expect(result.current.failed).toBe("s-1"));
    expect(result.current.remaining).toBe(1);
    expect(result.current.ready).toBe(false);
  });
});
