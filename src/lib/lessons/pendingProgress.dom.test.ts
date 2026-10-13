import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimSlot,
  clearProgress,
  flushPendingProgress,
  holdAnswer,
  holdProgress,
  holdsAnswers,
  pendingProgressFor,
  sendHeldAnswers,
} from "./pendingProgress";
import { lessonsApi } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The promise outlived the mechanism.
 *
 * `useLessonProgress` holds the newest failed write and re-sends it on
 * `online`, which is correct for exactly as long as the player stays mounted.
 * It held it in a REF and registered the listener in the same hook - so both
 * died on unmount.
 *
 * That is the one moment it was guaranteed to be needed. A child offline
 * mid-lesson sees a banner promising we will save where they got to; they tap
 * X, and a dialog headed "Your progress is saved" offers "Leave for now".
 * Taking it fires one more doomed write and routes away on the next line,
 * unmounting the hook and dropping the buffer. When the connection came back
 * there was nothing left to send, and the child re-read what they had done.
 *
 * So these tests are about outliving the player, and about not retrying
 * something the server has already refused.
 */

const signInAs = (userId = "student-1") =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
  clearSession();
});

const held = { sessionId: "sess-1", status: "exited" as never, segment: 3 };

/** `holdProgress` attributes to whoever is signed in, so sign in to hold. */
const holdAs = (
  userId: string,
  lessonId: string,
  entry: Parameters<typeof holdProgress>[1] = held,
) => {
  signInAs(userId);
  holdProgress(lessonId, entry);
};

describe("progress that could not be saved", () => {
  it("outlives the player that captured it", () => {
    holdAs("student-1", "lesson-1");

    // A ref would be gone by now; this is the whole point.
    expect(pendingProgressFor("lesson-1")?.segment).toBe(3);
  });

  it("is sent when a student screen opens again", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-1");
    signInAs("student-1");

    await flushPendingProgress();

    expect(save).toHaveBeenCalledWith("lesson-1", {
      sessionId: "sess-1",
      status: "exited",
      segmentPosition: 3,
    });
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("is sent for a lesson the child never opens again", async () => {
    // A child who gave up offline may never return to that lesson, but their
    // position still belongs in Home's "Pick up where you left off" list.
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-a");
    holdAs("student-1", "lesson-b", {
      ...held,
      sessionId: "sess-2",
      segment: 7,
    });
    signInAs("student-1");

    await flushPendingProgress();

    expect(save).toHaveBeenCalledTimes(2);
    expect(pendingProgressFor("lesson-a")).toBeNull();
    expect(pendingProgressFor("lesson-b")).toBeNull();
  });

  it("is kept when the network is still down", async () => {
    vi.spyOn(lessonsApi, "saveProgress").mockRejectedValue(
      new ApiError(0, "offline"),
    );
    holdAs("student-1", "lesson-1");
    signInAs("student-1");

    await flushPendingProgress();

    expect(pendingProgressFor("lesson-1")?.segment).toBe(3);
  });

  it("is dropped when the server refuses it, rather than retried for ever", async () => {
    // A session id the server will never accept again would otherwise be
    // resent on every mount, for ever.
    vi.spyOn(lessonsApi, "saveProgress").mockRejectedValue(
      new ApiError(404, "gone"),
    );
    holdAs("student-1", "lesson-1");
    signInAs("student-1");

    await flushPendingProgress();

    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("sends nothing when nobody is signed in", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-1");
    clearSession();

    await flushPendingProgress();

    expect(save).not.toHaveBeenCalled();
    signInAs("student-1");
    expect(pendingProgressFor("lesson-1")).not.toBeNull();
  });

  it("keeps only the newest position for a lesson", () => {
    holdAs("student-1", "lesson-1");
    holdAs("student-1", "lesson-1", { ...held, segment: 9 });

    expect(pendingProgressFor("lesson-1")?.segment).toBe(9);
  });

  it("forgets a position from another week", async () => {
    signInAs();
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdProgress("lesson-1", held);
    const shelf = "nevo.lesson.pendingProgress.student-1";
    const raw = JSON.parse(window.localStorage.getItem(shelf) ?? "{}");
    raw["lesson-1:sess-1"].heldAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(shelf, JSON.stringify(raw));

    await flushPendingProgress();

    expect(save).not.toHaveBeenCalled();
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("is NOT written to the next child who picks up the tablet", async () => {
    // Child A works offline and leaves the lesson. Child B signs in on the same
    // school tablet, any student screen mounts, and the flush runs.
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("child-a", "lesson-1");

    signInAs("child-b");
    await flushPendingProgress();

    expect(save).not.toHaveBeenCalled();
    // Not B's to see, and still child A's, waiting for them.
    expect(pendingProgressFor("lesson-1")).toBeNull();
    signInAs("child-a");
    expect(pendingProgressFor("lesson-1")?.segment).toBe(3);
  });

  it("sends it when the child it belongs to comes back", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("child-a", "lesson-1");

    signInAs("child-b");
    await flushPendingProgress();
    signInAs("child-a");
    await flushPendingProgress();

    expect(save).toHaveBeenCalledTimes(1);
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("holds nothing when nobody is signed in to attribute it to", () => {
    clearSession();
    holdProgress("lesson-1", held);
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("clears cleanly", () => {
    holdAs("student-1", "lesson-1");
    clearProgress("lesson-1");
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });
});

/**
 * A SHARED TABLET, AND ONE LESSON BOTH CHILDREN HAVE.
 *
 * The store was keyed by lesson alone. The owner check on the way out stopped
 * A's place being SENT as B's, but B's own writes still reached it: B's landed
 * write cleared the lesson's entry, which was A's, and B's failed one
 * overwrote it.
 */
describe("held progress on a shared tablet", () => {
  it("is not cleared by the next child's landed write", () => {
    holdAs("child-a", "lesson-1");

    signInAs("child-b");
    clearProgress("lesson-1");

    signInAs("child-a");
    expect(pendingProgressFor("lesson-1")?.segment).toBe(3);
  });

  it("is not overwritten by the next child's failed one", () => {
    holdAs("child-a", "lesson-1");
    holdAs("child-b", "lesson-1", { ...held, sessionId: "sess-b", segment: 9 });

    signInAs("child-a");
    expect(pendingProgressFor("lesson-1")?.segment).toBe(3);
    signInAs("child-b");
    expect(pendingProgressFor("lesson-1")?.segment).toBe(9);
  });

  it("stays the child's it was made for when the session is gone by the time it fails", () => {
    // A 401 clears the session before the failure is handled. The owner is
    // taken when the write is made and handed in, not looked up after.
    clearSession();
    holdProgress("lesson-1", held, "child-a");

    signInAs("child-a");
    expect(pendingProgressFor("lesson-1")?.segment).toBe(3);
  });

  it("moves a store from before this change onto its owner's shelf", () => {
    window.localStorage.setItem(
      "nevo.lesson.pendingProgress",
      JSON.stringify({
        "lesson-1": {
          userId: "child-a",
          sessionId: "sess-1",
          status: "exited",
          segment: 4,
          heldAt: Date.now(),
        },
      }),
    );

    signInAs("child-b");
    expect(pendingProgressFor("lesson-1")).toBeNull();
    signInAs("child-a");
    expect(pendingProgressFor("lesson-1")?.segment).toBe(4);
  });
});

describe("held progress, replayed", () => {
  it("is filed under the assignment it was made for", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-1", { ...held, assignmentId: "asg-7" });

    await flushPendingProgress();

    expect(save).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ assignmentId: "asg-7" }),
    );
  });

  it("still says where the check was left (B49)", async () => {
    // Leaving the after-lesson check offline: the exit is held, and the place
    // in the check has to survive with it or the check cannot be picked up.
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-1", { ...held, check: 2 });

    await flushPendingProgress();

    expect(save).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ status: "exited", checkPosition: 2 }),
    );
  });

  it("keeps a completion from an earlier visit when a later one lands", async () => {
    // Today's first segment landing says nothing about yesterday's finish.
    holdAs("student-1", "lesson-1", {
      ...held,
      status: "completed" as never,
      segment: 7,
    });
    clearProgress("lesson-1", "sess-today");

    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    await flushPendingProgress();

    expect(save).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ status: "completed", sessionId: "sess-1" }),
    );
  });

  it("sends an earlier visit's completion before a later visit's position", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-1", { ...held, status: "completed" as never });
    holdAs("student-1", "lesson-1", {
      ...held,
      sessionId: "sess-2",
      status: "in_progress" as never,
      segment: 1,
    });

    await flushPendingProgress();

    expect(save.mock.calls.map((c) => c[1].status)).toEqual([
      "completed",
      "in_progress",
    ]);
  });

  it("opens a session for a position that never had one", async () => {
    // A lesson opened offline - from Downloads, say - never got a session,
    // and `PUT /progress` cannot be made without one.
    vi.spyOn(lessonsApi, "startSession").mockResolvedValue({
      sessionId: "sess-new",
    } as never);
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    signInAs("student-1");
    holdProgress("lesson-1", {
      sessionId: null,
      localId: "local-1",
      status: "in_progress" as never,
      segment: 4,
    });

    await flushPendingProgress();

    expect(save).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ sessionId: "sess-new", segmentPosition: 4 }),
    );
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("leaves a sessionless position to the player that is still open", async () => {
    const start = vi.spyOn(lessonsApi, "startSession");
    signInAs("student-1");
    holdProgress("lesson-1", {
      sessionId: null,
      localId: "local-1",
      status: "in_progress" as never,
      segment: 4,
    });
    const release = claimSlot("lesson-1", "local-1");

    await flushPendingProgress();
    release();

    expect(start).not.toHaveBeenCalled();
    expect(pendingProgressFor("lesson-1")).not.toBeNull();
  });

  it("sends once when two screens ask at the same moment", async () => {
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdAs("student-1", "lesson-1");

    await Promise.all([flushPendingProgress(), flushPendingProgress()]);

    expect(save).toHaveBeenCalledTimes(1);
  });
});

/**
 * ANSWERS GIVEN OFFLINE, AND THE COMPLETION THEY STAND BEHIND (Lydia, 6 Oct).
 *
 * Her rule exists so the engine never books a completion with no check data
 * behind it. Since B85 a lesson played offline can be completed - and its
 * answers were sent once and dropped, while the completion was held and sent
 * on reconnect with nothing behind it. So the answers are held too, they go
 * first, and the completion goes only once every one has landed. One the
 * server refuses for good turns the completion into `exited`.
 */
describe("answers held for a check (Lydia, 6 Oct)", () => {
  const completion = {
    sessionId: "sess-1",
    status: "completed" as never,
    segment: 4,
  };
  const answer = (n: number, over: Record<string, unknown> = {}) => ({
    sessionId: "sess-1",
    body: {
      problemId: `cp-${n}`,
      source: "assessment" as const,
      answer: n,
      clientAttemptId: `0000000${n}-0000-4000-8000-000000000000`,
    },
    ...over,
  });
  const calls: string[] = [];
  const spyWrites = (
    attempt: () => Promise<unknown> = () => Promise.resolve({}),
  ) => {
    calls.length = 0;
    const save = vi
      .spyOn(lessonsApi, "saveAttempt")
      .mockImplementation((_, body) => {
        calls.push(`attempt ${body.problemId}`);
        return attempt() as never;
      });
    const progress = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockImplementation((_, body) => {
        calls.push(`progress ${body.status}`);
        return Promise.resolve({}) as never;
      });
    return { save, progress };
  };

  it("sends the answers first, as they were given, then the completion", async () => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1));
    holdAnswer("lesson-1", answer(2));
    holdProgress("lesson-1", completion);
    const { save } = spyWrites();

    await flushPendingProgress();

    expect(calls).toEqual([
      "attempt cp-1",
      "attempt cp-2",
      "progress completed",
    ]);
    // Their own ids and session, so a write that did land is not filed twice.
    expect(save).toHaveBeenCalledWith("lesson-1", {
      sessionId: "sess-1",
      ...answer(1).body,
    });
    expect(holdsAnswers("lesson-1", "sess-1")).toBe(false);
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("keeps the completion back while an answer still cannot be sent", async () => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1));
    holdProgress("lesson-1", completion);
    spyWrites(() => Promise.reject(new ApiError(0, "offline")));

    await flushPendingProgress();

    expect(calls).toEqual(["attempt cp-1"]);
    expect(holdsAnswers("lesson-1", "sess-1")).toBe(true);
    expect(pendingProgressFor("lesson-1")?.status).toBe("completed");
  });

  it("writes exited, never completed, when an answer is refused for good", async () => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1));
    holdProgress("lesson-1", completion);
    const { progress } = spyWrites(() =>
      Promise.reject(new ApiError(422, "refused")),
    );

    await flushPendingProgress();

    expect(calls).toEqual(["attempt cp-1", "progress exited"]);
    expect(progress).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ status: "exited", segmentPosition: 4 }),
    );
    // Done its work: nothing is held back any more.
    expect(holdsAnswers("lesson-1", "sess-1")).toBe(false);
    expect(pendingProgressFor("lesson-1")).toBeNull();
  });

  it("still holds back a completion of that visit held after the refusal", async () => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1));
    spyWrites(() => Promise.reject(new ApiError(403, "consent")));
    await flushPendingProgress();

    holdProgress("lesson-1", completion);
    await flushPendingProgress();

    expect(calls).toEqual(["attempt cp-1", "progress exited"]);
  });

  it("opens one session for a visit that never had one, for both", async () => {
    // A lesson played from Downloads with no connection never opened one.
    signInAs("student-1");
    const start = vi.spyOn(lessonsApi, "startSession").mockResolvedValue({
      sessionId: "sess-new",
    } as never);
    holdAnswer("lesson-1", answer(1, { sessionId: null, localId: "local-1" }));
    holdProgress("lesson-1", {
      ...completion,
      sessionId: null,
      localId: "local-1",
    });
    const { save, progress } = spyWrites();

    await flushPendingProgress();

    expect(start).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].sessionId).toBe("sess-new");
    expect(progress.mock.calls[0][1].sessionId).toBe("sess-new");
    expect(calls).toEqual(["attempt cp-1", "progress completed"]);
  });

  it("leaves a visit's answers to the player that is still open", async () => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1, { sessionId: null, localId: "local-1" }));
    const release = claimSlot("lesson-1", "local-1");
    spyWrites();

    await flushPendingProgress();
    release();

    expect(calls).toEqual([]);
  });

  it("are never sent as the next child's", async () => {
    signInAs("child-a");
    holdAnswer("lesson-1", answer(1));
    spyWrites();

    signInAs("child-b");
    await flushPendingProgress();

    expect(calls).toEqual([]);
    signInAs("child-a");
    expect(holdsAnswers("lesson-1", "sess-1")).toBe(true);
  });

  it("are sent before the completion the player itself is about to write", async () => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1));
    spyWrites();

    expect(await sendHeldAnswers("lesson-1", "sess-1")).toBe("sent");
    expect(calls).toEqual(["attempt cp-1"]);
  });

  it.each([
    [0, "held"],
    [401, "held"],
    [429, "held"],
    [503, "held"],
    [404, "refused"],
    [422, "refused"],
  ])("count a %d as %s", async (status, outcome) => {
    signInAs("student-1");
    holdAnswer("lesson-1", answer(1));
    spyWrites(() => Promise.reject(new ApiError(status, "no")));

    expect(await sendHeldAnswers("lesson-1", "sess-1")).toBe(outcome);
  });
});
