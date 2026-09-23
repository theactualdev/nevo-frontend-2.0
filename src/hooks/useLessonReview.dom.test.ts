import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { review, accept, amend, remove } = vi.hoisted(() => ({
  review: vi.fn(),
  accept: vi.fn(),
  amend: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      review,
      acceptKeyPoint: accept,
      amendKeyPoint: amend,
      removeKeyPoint: remove,
    },
  };
});

import { useLessonReview } from "./useLessonReview";

/**
 * SCRUM-153, and the rule backend asked for by name.
 *
 * *"Enable Assign on `readyToAssign`, not by counting the list yourself.
 * Client and server disagreeing about ready is how this started."* A teacher
 * uploaded a lesson, was told parts needed review, and could not assign it -
 * and the screen and the server each had their own idea of what "ready" meant.
 *
 * So the assertions here are mostly about what this hook DOESN'T do: it does
 * not count, it does not re-read after an action, and it does not treat a read
 * it could not make as a reason to refuse a teacher.
 */

const KP = (over: Record<string, unknown> = {}) => ({
  id: "kp-1",
  segmentId: "s-1",
  segmentTitle: "Adding unlike denominators",
  position: 1,
  text: "You need a common denominator first.",
  extractedText: "You need a common denominator first.",
  amendedText: null,
  sourceText: "Before adding, rewrite both fractions over a common base.",
  confidence: "low",
  reviewState: "unsure",
  outstanding: true,
  resolvedAt: null,
  resolvedBy: null,
  ...over,
});

const REVIEW = (over: Record<string, unknown> = {}) => ({
  lessonId: "l-1",
  title: "Adding fractions",
  outstandingCount: 1,
  keyPointCount: 3,
  readyToAssign: false,
  keyPoints: [KP()],
  ...over,
});

const open = async () => {
  const { result } = renderHook(() => useLessonReview("l-1"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
};

beforeEach(() => {
  review.mockReset().mockResolvedValue(REVIEW());
  accept.mockReset();
  amend.mockReset();
  remove.mockReset();
});

describe("reading the review", () => {
  it("asks about this lesson", async () => {
    await open();

    expect(review).toHaveBeenCalledWith("l-1");
  });

  it("takes the count and the verdict from the server", async () => {
    // Deliberately inconsistent with the list: three outstanding by the
    // server's reckoning, one card. A hook that counted would say 1.
    review.mockResolvedValue(
      REVIEW({ outstandingCount: 3, readyToAssign: false }),
    );
    const result = await open();

    expect(result.current.outstanding).toBe(3);
    expect(result.current.ready).toBe(false);
  });

  it("lets a lesson nobody doubted through without any clicking", async () => {
    /*
     * The scope ruling, as a test. Key points are listed and none is
     * outstanding, so assign is live and the teacher never opens a card.
     * A count of the list would have blocked on three cards.
     */
    review.mockResolvedValue(
      REVIEW({
        outstandingCount: 0,
        readyToAssign: true,
        keyPoints: [
          KP({ outstanding: false, reviewState: "settled", confidence: "high" }),
          KP({ id: "kp-2", outstanding: false, reviewState: "settled" }),
        ],
      }),
    );
    const result = await open();

    expect(result.current.ready).toBe(true);
    expect(result.current.keyPoints).toHaveLength(2);
  });

  it("does not shut the door on a read it could not make", async () => {
    /*
     * Refusing a teacher because OUR read failed is worse than letting the
     * server refuse: the server's refusal names what is outstanding, ours
     * would name nothing and be wrong half the time.
     */
    review.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useLessonReview("l-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("is loading until it has an answer", () => {
    review.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLessonReview("l-1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.keyPoints).toEqual([]);
  });
});

describe("settling a key point", () => {
  it("accepts one", async () => {
    accept.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const result = await open();

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(accept).toHaveBeenCalledWith("l-1", "kp-1");
  });

  it("takes the count and the verdict from the ACTION, with no second read", async () => {
    /*
     * The reason all three endpoints return the whole review. A hook that
     * re-read after acting would work, and would also be a second chance for
     * the screen and the server to disagree - plus a request per click on a
     * page a teacher is clicking through.
     */
    accept.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const result = await open();
    review.mockClear();

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(result.current.outstanding).toBe(0));
    expect(review).not.toHaveBeenCalled();
  });

  it("sends an amendment as the text it is", async () => {
    amend.mockResolvedValue(REVIEW());
    const result = await open();

    act(() => result.current.amend("kp-1", "You need a common base first."));

    await waitFor(() =>
      expect(amend).toHaveBeenCalledWith(
        "l-1",
        "kp-1",
        "You need a common base first.",
      ),
    );
  });

  it("removes one", async () => {
    remove.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const result = await open();

    act(() => result.current.remove("kp-1"));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("l-1", "kp-1"));
  });

  it("names the card AND the action while one is in flight", async () => {
    // Which action matters: the card says "Accepting…" over the control that
    // was pressed, and three controls share one busy state.
    accept.mockReturnValue(new Promise(() => {}));
    const result = await open();

    act(() => result.current.accept("kp-1"));

    await waitFor(() =>
      expect(result.current.working).toEqual({ id: "kp-1", action: "accept" }),
    );
  });

  it("refuses a second action while one is in flight", async () => {
    accept.mockReturnValue(new Promise(() => {}));
    const result = await open();

    act(() => result.current.accept("kp-1"));
    act(() => result.current.remove("kp-1"));

    expect(remove).not.toHaveBeenCalled();
  });
});

describe("when an action does not land", () => {
  it("leaves the review exactly as it was", async () => {
    accept.mockRejectedValue(new Error("nope"));
    const result = await open();

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(result.current.actionFailed).toBe("kp-1"));
    expect(result.current.outstanding).toBe(1);
    expect(result.current.ready).toBe(false);
    expect(result.current.working).toBeNull();
  });

  it("clears the mark when the next action is tried", async () => {
    accept.mockRejectedValue(new Error("nope"));
    const result = await open();
    act(() => result.current.accept("kp-1"));
    await waitFor(() => expect(result.current.actionFailed).toBe("kp-1"));

    accept.mockResolvedValue(REVIEW({ outstandingCount: 0 }));
    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(result.current.actionFailed).toBeNull());
  });
});

describe("the lesson that has just been settled", () => {
  it("remembers that there WAS a review, so the state change is visible", async () => {
    /*
     * LR-05 asks for a quiet state change. Without this the whole section
     * disappears the moment the last point is settled, and a teacher is left
     * looking for what they just did.
     */
    accept.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const result = await open();
    expect(result.current.hadReview).toBe(true);

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(result.current.outstanding).toBe(0));
    expect(result.current.hadReview).toBe(true);
  });

  it("claims no review for a lesson that never had one", async () => {
    review.mockResolvedValue(
      REVIEW({ outstandingCount: 0, readyToAssign: true, keyPoints: [] }),
    );
    const result = await open();

    expect(result.current.hadReview).toBe(false);
  });
});

describe("refresh", () => {
  it("re-reads, for the half of the review this hook cannot see", async () => {
    // A flagged SEGMENT also holds a lesson, and approving one moves
    // `readyToAssign` without touching a key point.
    const result = await open();
    review.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(review).toHaveBeenCalledTimes(2);
  });
});

describe("the moment the last thing is settled", () => {
  const openWith = async (onReady: () => void) => {
    const { result } = renderHook(() => useLessonReview("l-1", onReady));
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result;
  };

  it("tells the screen, once, when an action crosses it over", async () => {
    // LR-05: "quiet state change plus the SCRUM-152 system message". This is
    // the half that says the moment arrived.
    accept.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const onReady = vi.fn();
    const result = await openWith(onReady);

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  it("stays quiet for a lesson that was already ready when it opened", async () => {
    /*
     * A teacher opening a settled lesson has not just done anything, and
     * congratulating them for last week's work is the kind of noise that
     * teaches people to ignore the bar. Fired from the ACTION's response
     * rather than an effect watching `ready`, which is what makes this
     * distinction possible at all.
     */
    review.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const onReady = vi.fn();
    await openWith(onReady);

    expect(onReady).not.toHaveBeenCalled();
  });

  it("stays quiet when an action lands but something is still outstanding", async () => {
    accept.mockResolvedValue(REVIEW({ outstandingCount: 1, readyToAssign: false }));
    const onReady = vi.fn();
    const result = await openWith(onReady);

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(accept).toHaveBeenCalled());
    expect(onReady).not.toHaveBeenCalled();
  });

  it("stays quiet when it never knew the lesson was not ready", async () => {
    /*
     * A mutation run found this had nothing behind it - `before === false`
     * versus `before !== true` are different only when there was no previous
     * answer at all, and that happens when the REVIEW READ FAILED.
     *
     * We never learned the lesson was outstanding, so we cannot say a teacher
     * crossed anything. Announcing it would be congratulating them on a
     * transition we did not see.
     */
    review.mockRejectedValue(new Error("network"));
    accept.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));
    const onReady = vi.fn();
    const { result } = renderHook(() => useLessonReview("l-1", onReady));
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.accept("kp-1"));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(onReady).not.toHaveBeenCalled();
  });

  it("stays quiet on a refresh that merely re-reports ready", async () => {
    // `refresh` is a read, not a teacher's action. Only an action crosses.
    const onReady = vi.fn();
    const result = await openWith(onReady);
    review.mockResolvedValue(REVIEW({ outstandingCount: 0, readyToAssign: true }));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(onReady).not.toHaveBeenCalled();
  });
});
