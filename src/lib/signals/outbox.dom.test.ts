import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitBatch } = vi.hoisted(() => ({ submitBatch: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, signalsApi: { submitBatch } };
});

import { ApiError } from "@/lib/api";
import { clearSession, setSession } from "@/lib/auth/session";
import {
  deliverHeldSignals,
  forgetSignals,
  holdSignals,
  lastTry,
  withholdSignals,
} from "./outbox";

/**
 * Signals a lesson could not send before it went: delivered later, to the
 * child who produced them and nobody else.
 */

const ENVELOPE = {
  sessionId: "fd0cba6c-0828-48e3-8510-c78146a5d449",
  lessonId: "9c1e77aa-1111-4222-8333-444455556666",
  sessionType: "lesson" as const,
  startedAt: "2026-10-01T09:00:00.000Z",
};
const events = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "time_on_segment" as const,
    timestamp: "2026-10-01T09:00:01.000Z",
    payload: { i },
  }));
const signInAs = (userId: string) =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role: "student",
  });
const held = () =>
  JSON.parse(window.localStorage.getItem("nevo.signals.outbox") ?? "[]") as {
    userId: string;
  }[];

beforeEach(() => {
  submitBatch.mockReset();
  submitBatch.mockResolvedValue({ acceptedEvents: 1 });
  clearSession();
});

describe("held signals", () => {
  it("go to the child who produced them, and only that child", async () => {
    holdSignals("child-a", ENVELOPE, events(2));
    holdSignals("child-b", ENVELOPE, events(3));
    signInAs("child-b");

    await deliverHeldSignals();

    expect(submitBatch).toHaveBeenCalledTimes(1);
    expect(submitBatch.mock.calls[0]![1]).toHaveLength(3);
    // The other child's are left alone - not sent, not deleted.
    expect(held().map((h) => h.userId)).toEqual(["child-a"]);
  });

  it("wait for a session rather than posting to a door that will refuse", async () => {
    holdSignals("child-a", ENVELOPE, events(1));

    await deliverHeldSignals();

    expect(submitBatch).not.toHaveBeenCalled();
    expect(held()).toHaveLength(1);
  });

  it("go in requests the contract accepts", async () => {
    holdSignals("child-a", ENVELOPE, events(150));
    signInAs("child-a");

    await deliverHeldSignals();

    const sizes = submitBatch.mock.calls.map(([, e]) => e.length);
    expect(sizes).toEqual([100, 50]);
    expect(held()).toEqual([]);
  });

  it("are kept again when the network is still down", async () => {
    submitBatch.mockRejectedValue(new ApiError(0, "offline"));
    holdSignals("child-a", ENVELOPE, events(2));
    signInAs("child-a");

    await deliverHeldSignals();

    expect(held()).toHaveLength(1);
  });

  it("are dropped when the contract refuses them", async () => {
    submitBatch.mockRejectedValue(new ApiError(422, "invalid"));
    holdSignals("child-a", ENVELOPE, events(2));
    signInAs("child-a");

    await deliverHeldSignals();

    expect(held()).toEqual([]);
  });

  it("are sent once, however many triggers fire together", async () => {
    holdSignals("child-a", ENVELOPE, events(2));
    signInAs("child-a");

    await Promise.all([deliverHeldSignals(), deliverHeldSignals()]);

    expect(submitBatch).toHaveBeenCalledTimes(1);
  });
});

/*
 * A GUARDIAN'S WITHDRAWAL (SCRUM-80). What was held for that child is deleted,
 * nothing more is held, and nothing is delivered - while every other child on
 * a shared tablet keeps theirs. Each test uses its own child: the withdrawal
 * is remembered for the life of the page, and this file is one page.
 */
describe("held signals for a child whose consent was withdrawn", () => {
  it("are deleted, and nobody else's are", () => {
    holdSignals("child-w", ENVELOPE, events(2));
    holdSignals("child-b", ENVELOPE, events(1));

    withholdSignals("child-w");

    expect(held().map((h) => h.userId)).toEqual(["child-b"]);
  });

  it("are not kept again afterwards", () => {
    withholdSignals("child-x");

    holdSignals("child-x", ENVELOPE, events(1));

    expect(held()).toEqual([]);
  });

  it("are never delivered, even when another tab held them", async () => {
    withholdSignals("child-y");
    // Written behind this page's back, as another tab would.
    window.localStorage.setItem(
      "nevo.signals.outbox",
      JSON.stringify([
        { userId: "child-y", session: ENVELOPE, events: events(1), heldAt: Date.now() },
      ]),
    );
    signInAs("child-y");

    await deliverHeldSignals();

    expect(submitBatch).not.toHaveBeenCalled();
    expect(held()).toEqual([]);
  });

  it("stop a delivery already under way", async () => {
    holdSignals("child-z", ENVELOPE, events(250));
    signInAs("child-z");
    // The answer lands while the first request is out.
    submitBatch.mockImplementationOnce(async () => {
      withholdSignals("child-z");
      return { acceptedEvents: 100 };
    });

    await deliverHeldSignals();

    expect(submitBatch).toHaveBeenCalledTimes(1);
    expect(held()).toEqual([]);
  });
});

/*
 * A CHILD'S SESSION ENDING (19 Oct browser-storage audit). What they left
 * unsent - break feelings among it - sat on a shared tablet until they next
 * signed in there. Now it gets one last try, with the token their session
 * held, and is deleted whatever that comes to. Each test uses its own child:
 * a sign-out is remembered for the life of the page.
 */
describe("held signals when their child's session ends", () => {
  it("get one try with the token that session held, and only theirs go", async () => {
    holdSignals("leaving-1", ENVELOPE, events(2));
    holdSignals("staying-1", ENVELOPE, events(3));

    forgetSignals("leaving-1", "tok-leaving");
    await Promise.resolve();

    expect(submitBatch).toHaveBeenCalledTimes(1);
    const [, sent, options] = submitBatch.mock.calls[0]!;
    expect(sent).toHaveLength(2);
    expect(options).toMatchObject({ keepalive: true, token: "tok-leaving" });
    // Another child's are left exactly where they were.
    expect(held().map((h) => h.userId)).toEqual(["staying-1"]);
  });

  it("are deleted even when that try fails, and never tried again", async () => {
    submitBatch.mockRejectedValue(new ApiError(0, "offline"));
    holdSignals("leaving-2", ENVELOPE, events(2));

    forgetSignals("leaving-2", "tok-leaving");
    await Promise.resolve();
    expect(held()).toEqual([]);

    // Back on this page later: there is nothing left to send twice.
    signInAs("leaving-2");
    await deliverHeldSignals();
    expect(submitBatch).toHaveBeenCalledTimes(1);
  });

  it("give the try a short bound, so it cannot outlast its moment", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      submitBatch.mockImplementation((_s, _e, options) => {
        signal = options?.signal;
        return new Promise(() => {});
      });
      holdSignals("leaving-3", ENVELOPE, events(1));

      forgetSignals("leaving-3", "tok-leaving");
      expect(signal?.aborted).toBe(false);

      vi.advanceTimersByTime(4_000);
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("are not tried at all when they are from another week", async () => {
    window.localStorage.setItem(
      "nevo.signals.outbox",
      JSON.stringify([
        {
          userId: "leaving-4",
          session: ENVELOPE,
          events: events(1),
          heldAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        },
      ]),
    );

    forgetSignals("leaving-4", "tok-leaving");
    await Promise.resolve();

    expect(submitBatch).not.toHaveBeenCalled();
    expect(held()).toEqual([]);
  });

  it("are not held again for that child on this page, until they sign in again", () => {
    forgetSignals("leaving-5", "tok-leaving");

    // A stream still open as they went - its pagehide, a send failing late.
    holdSignals("leaving-5", ENVELOPE, events(1));
    expect(held()).toEqual([]);

    signInAs("leaving-5");
    holdSignals("leaving-5", ENVELOPE, events(1));
    expect(held().map((h) => h.userId)).toEqual(["leaving-5"]);
  });

  it("are deleted untried for a child whose consent was withdrawn", async () => {
    // Written behind this page's back, as another tab would.
    window.localStorage.setItem(
      "nevo.signals.outbox",
      JSON.stringify([
        { userId: "leaving-6", session: ENVELOPE, events: events(1), heldAt: Date.now() },
      ]),
    );
    withholdSignals("leaving-6");
    window.localStorage.setItem(
      "nevo.signals.outbox",
      JSON.stringify([
        { userId: "leaving-6", session: ENVELOPE, events: events(1), heldAt: Date.now() },
      ]),
    );

    forgetSignals("leaving-6", "tok-leaving");
    await Promise.resolve();

    expect(submitBatch).not.toHaveBeenCalled();
    expect(held()).toEqual([]);
  });
});

describe("the last try a stream still open makes", () => {
  it("goes in requests the contract accepts, with the token it was given", () => {
    lastTry(ENVELOPE, events(150), "tok-leaving");

    expect(submitBatch.mock.calls.map(([, e]) => e.length)).toEqual([100, 50]);
    for (const [, , options] of submitBatch.mock.calls) {
      expect(options).toMatchObject({ keepalive: true, token: "tok-leaving" });
    }
  });

  it("sends nothing without a token to send it with", () => {
    lastTry(ENVELOPE, events(2), "");

    expect(submitBatch).not.toHaveBeenCalled();
  });
});

/*
 * A DELIVERY UNDER WAY WHEN ITS CHILD'S SESSION ENDS (19 Oct browser-storage
 * audit). It read the session once and sent batch after batch, so a 401
 * elsewhere left the rest going up with no Authorization header. What it had
 * taken out gets the one last try a session's ending gives the rest of the
 * child's held events, with the token it began with, and is not held again.
 */
describe("a delivery under way when its child's session ends", () => {
  it("sends nothing more without their token: the rest gets one last try with it", async () => {
    holdSignals("ending-1", ENVELOPE, events(150));
    signInAs("ending-1");
    submitBatch.mockImplementationOnce(async () => {
      clearSession();
      return { acceptedEvents: 100 };
    });

    await deliverHeldSignals();

    expect(submitBatch).toHaveBeenCalledTimes(2);
    const [, rest, options] = submitBatch.mock.calls[1]!;
    expect(rest).toHaveLength(50);
    expect(options).toMatchObject({ keepalive: true, token: "tok" });
    expect(held()).toEqual([]);
  });

  it("sends the first child's nothing as the next child, once another signs in over them", async () => {
    holdSignals("ending-2", ENVELOPE, events(150));
    signInAs("ending-2");
    submitBatch.mockImplementationOnce(async () => {
      signInAs("someone-else");
      return { acceptedEvents: 100 };
    });

    await deliverHeldSignals();

    // The rest goes on the first child's token, named explicitly - not on
    // whatever session is signed in now, which is the next child's.
    expect(submitBatch).toHaveBeenCalledTimes(2);
    expect(submitBatch.mock.calls[1]![2]).toMatchObject({
      keepalive: true,
      token: "tok",
    });
    expect(held().map((h) => h.userId)).not.toContain("ending-2");
  });
});
