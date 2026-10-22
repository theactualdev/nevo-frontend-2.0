import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useLessonProgress } from "./useLessonProgress";
import { lessonsApi } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";
import { pendingProgressFor } from "@/lib/lessons/pendingProgress";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A COMPLETED LESSON WHOSE COMPLETED SITTING CANNOT BE FOUND (Teslim, 21 Oct).
 *
 * `POST /session` answers 409 `completed_session_unavailable` rather than make
 * the lesson unfinished: "a missing review sitting never resets a completed
 * lesson". It is the server's answer, the same one every time - not a failed
 * open. Taken as one, it was held, retried on every reconnect and every move,
 * and the completion screen told the child their work could not be saved.
 */

const LESSON = "lesson-1";

const refusal = (code: string) =>
  new ApiError(409, "Conflict", {
    detail: { code, message: "This lesson is complete, but..." },
  });

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  clearSession();
  vi.restoreAllMocks();
});

describe("useLessonProgress - a completed lesson with no sitting to reopen", () => {
  it("says the lesson cannot be opened, and claims no failed save", async () => {
    vi.spyOn(lessonsApi, "startSession").mockRejectedValue(
      refusal("completed_session_unavailable"),
    );

    const { result } = renderHook(() => useLessonProgress(LESSON, true));

    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.completionFailed).toBe(false);
    expect(result.current.sessionId).toBeNull();
  });

  it("asks again on nothing: not the connection's return, a move, or Try again", async () => {
    const start = vi
      .spyOn(lessonsApi, "startSession")
      .mockRejectedValue(refusal("completed_session_unavailable"));

    const { result, unmount } = renderHook(() =>
      useLessonProgress(LESSON, true),
    );
    await waitFor(() => expect(result.current.unavailable).toBe(true));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    act(() => result.current.report("in_progress", { segment: 2 }));
    act(() => result.current.resend());
    unmount();

    expect(start).toHaveBeenCalledTimes(1);
    // And nothing is held for a later flush to open a session for.
    expect(pendingProgressFor(LESSON)).toBeNull();
  });

  it("still takes any other 409 as an open that failed", async () => {
    // Only this code is the lesson's nothing-state. Another refusal keeps the
    // behaviour it had: held, and said at the completion screen.
    vi.spyOn(lessonsApi, "startSession").mockRejectedValue(
      refusal("prerequisite_required"),
    );

    const { result } = renderHook(() => useLessonProgress(LESSON, true));

    await waitFor(() => expect(result.current.completionFailed).toBe(true));
    expect(result.current.unavailable).toBe(false);
  });
});
