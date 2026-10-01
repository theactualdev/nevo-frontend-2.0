import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLessonProgress } from "./useLessonProgress";
import { LESSON_STATUS } from "@/lib/api/lessons";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * WHICH PIECE OF SET WORK A CHILD WAS DOING.
 *
 * `ProgressWrite.assignmentId` has been on the wire and typed in this client
 * since the contract shipped, and nothing ever sent it. So every write recorded
 * that a child had moved through a LESSON and never which assignment that was -
 * and a lesson can be assigned more than once, to the same child, by different
 * teachers.
 *
 * The player's route is `/student/lessons/{id}` and knows nothing about
 * assignments, so the id rides the link from the card that was tapped.
 *
 * ABSENT IS CORRECT AND COMMON, which is the half worth testing hardest: a
 * lesson opened from the library is not set work, and sending an id anyway
 * would file a child's own reading under a teacher's instruction.
 */

const saveProgress = vi.hoisted(() => vi.fn());
const startSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      startSession: (...a: unknown[]) => startSession(...a),
      saveProgress: (...a: unknown[]) => saveProgress(...a),
    },
  };
});

vi.mock("@/lib/lessons/pendingProgress", () => ({
  holdProgress: vi.fn(),
  clearProgress: vi.fn(),
  flushPendingProgress: vi.fn(),
  claimSlot: vi.fn(() => () => {}),
}));

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });

/** The body of the most recent progress write. */
const lastWrite = () =>
  saveProgress.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;

beforeEach(() => {
  clearSession();
  signIn();
  saveProgress.mockReset().mockResolvedValue({});
  startSession.mockReset().mockResolvedValue({ sessionId: "sess-1" });
});

afterEach(() => {
  clearSession();
});

describe("a lesson opened from an assignment", () => {
  it("says which assignment on every write", async () => {
    const { result } = renderHook(() =>
      useLessonProgress("les-1", true, "asg-7"),
    );
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    result.current.report(LESSON_STATUS.IN_PROGRESS, { segment: 2 });

    await waitFor(() => expect(saveProgress).toHaveBeenCalled());
    expect(lastWrite()?.assignmentId).toBe("asg-7");
  });

  it("still carries the session, which the write requires", async () => {
    const { result } = renderHook(() =>
      useLessonProgress("les-1", true, "asg-7"),
    );
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    result.current.report(LESSON_STATUS.COMPLETED, { segment: 5 });

    await waitFor(() => expect(saveProgress).toHaveBeenCalled());
    expect(lastWrite()?.sessionId).toBe("sess-1");
  });
});

describe("a lesson opened from the library", () => {
  it("omits the field rather than sending it empty", async () => {
    /*
     * Omitted, not null. Absent says "not from an assignment"; a null would be
     * us asserting the same thing in a field the backend may read differently -
     * and the difference between "no assignment" and "assignment unknown" is
     * exactly the kind of thing a report is later built on.
     */
    const { result } = renderHook(() => useLessonProgress("les-1", true));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    result.current.report(LESSON_STATUS.IN_PROGRESS, { segment: 1 });

    await waitFor(() => expect(saveProgress).toHaveBeenCalled());
    expect(lastWrite()).not.toHaveProperty("assignmentId");
  });

  it("omits it for an empty string too", async () => {
    // A stray `?assignment=` with nothing after it is not an assignment.
    const { result } = renderHook(() => useLessonProgress("les-1", true, ""));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    result.current.report(LESSON_STATUS.IN_PROGRESS, { segment: 1 });

    await waitFor(() => expect(saveProgress).toHaveBeenCalled());
    expect(lastWrite()).not.toHaveProperty("assignmentId");
  });
});
