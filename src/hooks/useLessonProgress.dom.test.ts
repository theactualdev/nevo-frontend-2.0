import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { useLessonProgress } from "./useLessonProgress";
import { lessonsApi } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";
import {
  holdAnswer,
  holdProgress,
  pendingProgressFor,
} from "@/lib/lessons/pendingProgress";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The wiring, not the store.
 *
 * `pendingProgress` has its own tests, but a correct store nobody writes to is
 * worth nothing - and that is exactly what a mutation run showed: removing the
 * `holdProgress` call from this hook, which restores the original bug outright,
 * left every store test passing.
 *
 * The bug: a failed write was held only in a REF, and the `online` listener
 * that would have re-sent it lived in the same hook. "Leave for now" - the
 * button under the words "Your progress is saved" - fires one more doomed write
 * and routes away on the next line, unmounting both. So the position was lost
 * at the one moment the UI had just promised it was safe.
 */

const LESSON = "lesson-1";

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
  signIn();
  vi.spyOn(lessonsApi, "startSession").mockResolvedValue({
    sessionId: "sess-1",
  } as never);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  clearSession();
  vi.restoreAllMocks();
});

describe("useLessonProgress", () => {
  it("holds a failed position somewhere that survives the player closing", async () => {
    vi.spyOn(lessonsApi, "saveProgress").mockRejectedValue(
      new ApiError(0, "offline"),
    );
    const { result, unmount } = renderHook(() =>
      useLessonProgress(LESSON, true),
    );

    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));
    act(() => result.current.report("exited", { segment: 3 }));
    await waitFor(() => expect(pendingProgressFor(LESSON)).not.toBeNull());

    // The exact sequence "Leave for now" performs.
    unmount();

    expect(pendingProgressFor(LESSON)?.segment).toBe(3);
    expect(pendingProgressFor(LESSON)?.sessionId).toBe("sess-1");
  });

  it("owes nothing once the write lands", async () => {
    vi.spyOn(lessonsApi, "saveProgress").mockResolvedValue({} as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));

    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));
    act(() => result.current.report("in_progress", { segment: 2 }));

    await waitFor(() => expect(pendingProgressFor(LESSON)).toBeNull());
  });

  it("sends what a previous visit could not, when a lesson opens again", async () => {
    // The child came back. Nothing in the UI mentions this; it simply catches up.
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    window.localStorage.setItem(
      "nevo.lesson.pendingProgress",
      JSON.stringify({
        [LESSON]: {
          // The owner matters now: an entry with no child attached is skipped
          // rather than sent, which is what stops one child's position landing
          // on the next child to use the tablet.
          userId: "student-1",
          sessionId: "sess-old",
          status: "exited",
          segment: 5,
          heldAt: Date.now(),
        },
      }),
    );

    renderHook(() => useLessonProgress(LESSON, true));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        LESSON,
        expect.objectContaining({ sessionId: "sess-old", segmentPosition: 5 }),
      ),
    );
  });
});

describe("useLessonProgress - when the session will not open", () => {
  it("holds the position past the player closing, with no session", async () => {
    vi.spyOn(lessonsApi, "startSession").mockRejectedValue(
      new ApiError(0, "offline"),
    );
    const { result, unmount } = renderHook(() =>
      useLessonProgress(LESSON, true, "asg-7"),
    );
    await waitFor(() => expect(result.current.completionFailed).toBe(true));

    act(() => result.current.report("in_progress", { segment: 4 }));
    unmount();

    // Nothing recorded at all used to be the answer here.
    expect(pendingProgressFor(LESSON)).toMatchObject({
      sessionId: null,
      segment: 4,
      assignmentId: "asg-7",
    });
  });

  it("tries the session again when the connection returns, and sends the place", async () => {
    const start = vi
      .spyOn(lessonsApi, "startSession")
      .mockRejectedValueOnce(new ApiError(0, "offline"))
      .mockResolvedValue({ sessionId: "sess-2" } as never);
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.completionFailed).toBe(true));
    act(() => result.current.report("in_progress", { segment: 4 }));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        LESSON,
        expect.objectContaining({ sessionId: "sess-2", segmentPosition: 4 }),
      ),
    );
    expect(start).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(pendingProgressFor(LESSON)).toBeNull());
  });
});

describe("useLessonProgress - a write that meets a dead session", () => {
  it("is still held for the child who made it", async () => {
    // What `client.ts` does on a 401: clear the session, then reject.
    vi.spyOn(lessonsApi, "saveProgress").mockImplementation(async () => {
      clearSession();
      throw new ApiError(401, "expired");
    });
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => result.current.report("in_progress", { segment: 6 }));
    await new Promise((r) => setTimeout(r, 0));

    signIn();
    expect(pendingProgressFor(LESSON)?.segment).toBe(6);
  });
});

describe("useLessonProgress - an earlier visit's finish", () => {
  it("is not wiped when today's first position lands", async () => {
    // Yesterday's completion could not be sent and is still held; today's
    // write lands first. Clearing the LESSON here un-finished it.
    holdProgress(LESSON, {
      sessionId: "sess-old",
      status: "completed" as never,
      segment: 7,
    });
    vi.spyOn(lessonsApi, "saveProgress").mockImplementation(
      async (_id, body) => {
        if (body.sessionId === "sess-old") throw new ApiError(0, "offline");
        return {} as never;
      },
    );
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => result.current.report("in_progress", { segment: 0 }));
    await waitFor(() => expect(result.current.saved).not.toBeNull());

    expect(pendingProgressFor(LESSON)).toMatchObject({
      sessionId: "sess-old",
      status: "completed",
    });
  });
});

describe("useLessonProgress - the after-lesson check (B49, B26)", () => {
  it("sends where the check was left on the write that leaves it", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => result.current.report("exited", { segment: 4, check: 2 }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(LESSON, {
        sessionId: "sess-1",
        status: "exited",
        segmentPosition: 4,
        checkPosition: 2,
      }),
    );
  });

  it("sends no result state with the completion: the server derives it (B98)", async () => {
    // `ProgressWrite.resultState` is deprecated and never controlled the
    // reroute; the server reads its own marks.
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => result.current.report("completed", { segment: 3 }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(LESSON, {
        sessionId: "sess-1",
        status: "completed",
        segmentPosition: 3,
      }),
    );
  });

  it("sends no place in a check on any other write", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => result.current.report("in_progress", { segment: 1 }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).not.toHaveProperty("checkPosition");
  });

  it("gives back what the newest write that landed came back with", async () => {
    // The only read of the progress row there is: it carries the check-in's
    // outcome after the completion, and where a check was left.
    const row = {
      lessonId: LESSON,
      status: "completed",
      modulePosition: 0,
      segmentPosition: 4,
      intelligence: {},
      masteredConcepts: [{ conceptName: "Halves", asked: 1, correct: 1 }],
    };
    vi.spyOn(lessonsApi, "saveProgress").mockResolvedValue(row as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));
    expect(result.current.saved).toBeNull();

    act(() => result.current.report("completed", { segment: 4 }));

    await waitFor(() => expect(result.current.saved).toEqual(row));
  });

  it("never gives back an older write's answer over a newer one", async () => {
    const lands: ((row: unknown) => void)[] = [];
    vi.spyOn(lessonsApi, "saveProgress").mockImplementation(
      () => new Promise((resolve) => lands.push(resolve as never)),
    );
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => result.current.report("in_progress", { segment: 1 }));
    act(() => result.current.report("completed", { segment: 2 }));
    await act(async () => {
      lands[1]({ status: "completed", segmentPosition: 2 });
      lands[0]({ status: "in_progress", segmentPosition: 1 });
    });

    expect(result.current.saved).toMatchObject({ status: "completed" });
  });

  it("gives back where the session says the check was left (B82)", async () => {
    const session = {
      sessionId: "sess-1",
      resumed: true,
      checkPosition: 2,
      checkResumableUntil: "2026-10-08T23:59:59Z",
    };
    vi.spyOn(lessonsApi, "startSession").mockResolvedValue(session);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));

    await waitFor(() => expect(result.current.opened).toEqual(session));
  });
});

/**
 * A completion never goes ahead of the answers its visit holds on the device
 * (Lydia, 6 Oct): the check data has to be behind it. With nothing held -
 * every online visit - it goes at once, as it always has.
 */
describe("useLessonProgress - a completion and the answers held for it", () => {
  const answer = {
    problemId: "cp-1",
    source: "assessment" as const,
    answer: 2,
    clientAttemptId: "00000001-0000-4000-8000-000000000000",
  };
  const order: string[] = [];
  const spyWrites = (attempt: () => Promise<unknown>) => {
    order.length = 0;
    vi.spyOn(lessonsApi, "saveAttempt").mockImplementation(() => {
      order.push("attempt");
      return attempt() as never;
    });
    return vi.spyOn(lessonsApi, "saveProgress").mockImplementation((_, b) => {
      order.push(`progress ${b.status}`);
      return Promise.resolve({ status: b.status }) as never;
    });
  };

  it("sends the held answers first, then the completion", async () => {
    spyWrites(() => Promise.resolve({}));
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));
    holdAnswer(LESSON, { sessionId: "sess-1", body: answer });

    act(() => result.current.report("completed", { segment: 4 }));

    await waitFor(() => expect(result.current.completionSaved).toBe(true));
    expect(order).toEqual(["attempt", "progress completed"]);
  });

  it("holds the completion back while an answer still cannot be sent", async () => {
    const save = spyWrites(() => Promise.reject(new ApiError(0, "offline")));
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));
    holdAnswer(LESSON, { sessionId: "sess-1", body: answer });

    act(() => result.current.report("completed", { segment: 4 }));

    await waitFor(() => expect(result.current.completionFailed).toBe(true));
    expect(save).not.toHaveBeenCalled();
    expect(pendingProgressFor(LESSON)?.status).toBe("completed");
  });

  it("writes exited, never completed, when an answer was refused for good", async () => {
    spyWrites(() => Promise.reject(new ApiError(422, "refused")));
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));
    holdAnswer(LESSON, { sessionId: "sess-1", body: answer });

    act(() => result.current.report("completed", { segment: 4 }));

    await waitFor(() => expect(order).toContain("progress exited"));
    expect(order).not.toContain("progress completed");
    expect(result.current.completionSaved).toBe(false);
    await waitFor(() => expect(result.current.completionFailed).toBe(true));
  });

  it("makes an answer given before the session opened that session's", async () => {
    let open: (v: unknown) => void = () => {};
    vi.spyOn(lessonsApi, "startSession").mockImplementation(
      () => new Promise((resolve) => (open = resolve as never)),
    );
    const attempt = vi
      .spyOn(lessonsApi, "saveAttempt")
      .mockResolvedValue({} as never);
    const { result } = renderHook(() => useLessonProgress(LESSON, true));
    holdAnswer(LESSON, {
      sessionId: null,
      localId: result.current.localId,
      body: answer,
    });

    await act(async () => open({ sessionId: "sess-1", resumed: false }));

    await waitFor(() =>
      expect(attempt).toHaveBeenCalledWith(LESSON, {
        sessionId: "sess-1",
        ...answer,
      }),
    );
  });
});
