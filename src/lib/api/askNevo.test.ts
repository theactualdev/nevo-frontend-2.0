import { describe, expect, it } from "vitest";
import {
  allowanceSpent,
  HISTORY_DAYS,
  HISTORY_LIMIT,
  recentThreads,
  safetyStop,
  type ThreadSummary,
} from "./askNevo";
import { ApiError } from "./client";

/**
 * The history window, which this client has to enforce because the endpoint
 * cannot.
 *
 * C15 states the rule: "Nothing older than 90 days, up to 50 entries." But
 * `GET /api/v1/ask-nevo/threads` declares NO parameters on the deployed
 * contract - no limit, no since, no cursor - so there is nowhere to ask the
 * server for that window. Whether the backend already applies it is not
 * something the client can see from here, so the client applies it too: a
 * no-op if the server trims, and the frame's list if it does not.
 *
 * `now` is a parameter rather than a clock read, so these tests pin the rule
 * without freezing time - and so a workflow script, which cannot call
 * `Date.now()`, could still exercise it.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-11T12:00:00.000Z");

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  threadId: "t-1",
  title: "What needs my attention today?",
  role: "teacher",
  messageCount: 2,
  lastMessageAt: new Date(NOW - DAY).toISOString(),
  createdAt: new Date(NOW - DAY).toISOString(),
  ...over,
});

const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

describe("recentThreads", () => {
  it("drops anything older than the 90-day window", () => {
    const kept = recentThreads(
      [
        thread({ threadId: "recent", lastMessageAt: at(89) }),
        thread({ threadId: "ancient", lastMessageAt: at(91) }),
      ],
      NOW,
    );

    expect(kept.map((t) => t.threadId)).toEqual(["recent"]);
  });

  it("keeps a conversation sitting exactly on the boundary", () => {
    // Ninety days old is not "older than ninety days". A teacher losing a
    // real conversation to an off-by-one is worse than showing one an hour
    // past the line.
    const kept = recentThreads(
      [thread({ threadId: "boundary", lastMessageAt: at(HISTORY_DAYS) })],
      NOW,
    );

    expect(kept.map((t) => t.threadId)).toEqual(["boundary"]);
  });

  it("orders most-recent-first, whatever order the server sent", () => {
    // The frame says "flat, most-recent-first". The endpoint's schema promises
    // no ordering at all, so the client must not assume one.
    const kept = recentThreads(
      [
        thread({ threadId: "middle", lastMessageAt: at(10) }),
        thread({ threadId: "oldest", lastMessageAt: at(40) }),
        thread({ threadId: "newest", lastMessageAt: at(1) }),
      ],
      NOW,
    );

    expect(kept.map((t) => t.threadId)).toEqual(["newest", "middle", "oldest"]);
  });

  it("caps at 50 entries, keeping the newest rather than the first 50 sent", () => {
    // Order before slice. Slicing first would cap an unordered list and throw
    // away conversations from this week to keep ones from two months ago.
    const many = Array.from({ length: 60 }, (_, i) =>
      thread({ threadId: `t-${i}`, lastMessageAt: at(60 - i) }),
    );

    const kept = recentThreads(many, NOW);

    expect(kept).toHaveLength(HISTORY_LIMIT);
    expect(kept[0].threadId).toBe("t-59"); // one day ago
    expect(kept.some((t) => t.threadId === "t-0")).toBe(false); // sixty days ago
  });

  it("keeps a conversation whose date it cannot read", () => {
    // A date the client cannot parse is a client problem, not evidence the
    // conversation is old. Dropping it would silently lose a real one.
    const kept = recentThreads(
      [thread({ threadId: "unparseable", lastMessageAt: "not a date" })],
      NOW,
    );

    expect(kept.map((t) => t.threadId)).toEqual(["unparseable"]);
  });

  it("handles an empty list without inventing anything", () => {
    expect(recentThreads([], NOW)).toEqual([]);
  });
});

/**
 * B33: the spent allowance is a 429 with its own code, and so is nothing
 * else. The code is the spec's, `ask_nevo_daily_limit`, which is what the
 * deployed contract's 429 description names.
 */
describe("allowanceSpent", () => {
  const refusal = (status: number, code: string) =>
    new ApiError(status, "x", { detail: { code, message: "m" } });

  it("is the 429 that names the day's allowance", () => {
    expect(allowanceSpent(refusal(429, "ask_nevo_daily_limit"))).toBe(true);
  });

  it("is not any other 429, which clears in a moment", () => {
    expect(allowanceSpent(refusal(429, "too_many_requests"))).toBe(false);
    expect(allowanceSpent(new ApiError(429, "x"))).toBe(false);
  });

  it("is not that code on any other status, nor a failure with no response", () => {
    expect(allowanceSpent(refusal(500, "ask_nevo_daily_limit"))).toBe(false);
    expect(allowanceSpent(new ApiError(0, "offline"))).toBe(false);
    expect(allowanceSpent(new Error("ask_nevo_daily_limit"))).toBe(false);
  });
});

/**
 * SCRUM-259: the safety stop is a 403 with its own code, carrying the
 * server's words for the child. Told apart by its code, as the allowance is:
 * a 403 is also a role or consent refusal, and those stay ordinary failures.
 */
describe("safetyStop", () => {
  const WORDS =
    "Nevo can’t help with this one. Please talk to a trusted adult or your teacher.";
  const refusal = (status: number, detail: Record<string, unknown>) =>
    new ApiError(status, "x", { detail });

  it("is the 403 that names the safety check, carrying the server's words verbatim", () => {
    expect(
      safetyStop(refusal(403, { code: "content_safety_blocked", message: WORDS })),
    ).toEqual({ message: WORDS });
  });

  it("carries no words of its own when the server sent none", () => {
    expect(safetyStop(refusal(403, { code: "content_safety_blocked" }))).toEqual({
      message: null,
    });
    expect(
      safetyStop(refusal(403, { code: "content_safety_blocked", message: "  " })),
    ).toEqual({ message: null });
  });

  it("is not any other 403", () => {
    expect(safetyStop(refusal(403, { code: "ask_role_forbidden", message: "m" }))).toBeNull();
    expect(safetyStop(refusal(403, { code: "consent_withdrawn", message: "m" }))).toBeNull();
    expect(safetyStop(new ApiError(403, "x"))).toBeNull();
  });

  it("is not that code on any other status, nor a failure with no response", () => {
    expect(
      safetyStop(refusal(500, { code: "content_safety_blocked", message: WORDS })),
    ).toBeNull();
    expect(safetyStop(new ApiError(0, "offline"))).toBeNull();
    expect(safetyStop(new Error("content_safety_blocked"))).toBeNull();
  });
});
