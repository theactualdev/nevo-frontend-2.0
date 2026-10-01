import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitBatch } = vi.hoisted(() => ({ submitBatch: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, signalsApi: { submitBatch } };
});

import { ApiError } from "@/lib/api";
import { clearSession, setSession } from "@/lib/auth/session";
import { deliverHeldSignals, holdSignals, withholdSignals } from "./outbox";

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
