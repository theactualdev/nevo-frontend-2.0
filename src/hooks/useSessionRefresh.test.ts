import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSessionRefresh } from "./useSessionRefresh";
import { clearSession, getSession, setSession } from "@/lib/auth/session";

/**
 * This file exists because the hook's own docblock used to assert the property
 * the code broke: it said retrying a refusal in a loop would spend a dying
 * token faster, and then looped. The comment was the reason nobody looked.
 *
 * `run()` only fires once `now` has reached `expiresAt - MARGIN_MS`, so `due`
 * is already zero by the time it runs. A failed attempt fell through `finally`
 * into an unconditional `schedule()`, `Math.max(due, 0)` returned 0, and it
 * re-fired immediately - for the whole two-minute margin, at the speed an
 * offline `fetch` can reject. So the first test below is the regression, and
 * it is written to COUNT, because "it retries sensibly" and "it retries two
 * thousand times" both look like passing if you only assert that it retried.
 */

const MARGIN_MS = 2 * 60 * 1000;

// `vi.mock` is hoisted above every `const` in this file, so a plain
// `const refresh = vi.fn()` is in its temporal dead zone inside the factory -
// which kills the worker outright and reports a 60s timeout naming no file,
// rather than failing here. `vi.hoisted` is the way to share a spy with a mock.
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ authApi: { refresh } }));

/** A session that is due for renewal RIGHT NOW - the moment `run()` fires. */
const signInDueNow = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + MARGIN_MS).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  clearSession();
});

afterEach(() => {
  vi.useRealTimers();
  clearSession();
});

describe("useSessionRefresh", () => {
  it("does not spin when the refresh keeps failing", async () => {
    // Offline: `client.ts` throws ApiError(0) from a rejected fetch, with no
    // round trip to slow it down. This is the exact shape that span.
    refresh.mockRejectedValue(new Error("network"));
    signInDueNow();

    renderHook(() => useSessionRefresh());

    // The full margin - the entire window in which the old code hammered.
    await vi.advanceTimersByTimeAsync(MARGIN_MS);

    // Backoff is 10s doubling to a 60s cap, so a handful of attempts fit in
    // two minutes. The number that matters is the one it must never be again:
    // hundreds. A generous ceiling still fails the old behaviour by ~2 orders
    // of magnitude.
    expect(refresh.mock.calls.length).toBeGreaterThan(0);
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("stops once the session it would renew is gone", async () => {
    refresh.mockRejectedValue(new Error("network"));
    signInDueNow();

    renderHook(() => useSessionRefresh());
    await vi.advanceTimersByTimeAsync(MARGIN_MS);
    const duringMargin = refresh.mock.calls.length;

    // Past `expiresAt`, `getSession()` clears itself, so there is no token left
    // to present and nothing to renew. It must go quiet rather than keep asking.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(refresh.mock.calls.length).toBe(duringMargin);
  });

  it("renews once on success and then waits, rather than renewing in a loop", async () => {
    // A successful refresh writes a new session, so the next run is a full
    // token life away. If the hook re-armed on the OLD expiry it would spin.
    refresh.mockImplementation(async () => {
      setSession({
        token: "tok-fresh",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        userId: "student-1",
        role: "student",
      });
    });
    signInDueNow();

    renderHook(() => useSessionRefresh());
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not renew a token the server hands back already inside the margin", async () => {
    // No failure to count, so the backoff never engages - this is what the
    // minimum gap is for. Without it the hook renews, reschedules at zero, and
    // renews again forever against a misbehaving backend.
    refresh.mockImplementation(async () => {
      setSession({
        token: "tok-short",
        expiresAt: new Date(Date.now() + MARGIN_MS).toISOString(),
        userId: "student-1",
        role: "student",
      });
    });
    signInDueNow();

    renderHook(() => useSessionRefresh());
    await vi.advanceTimersByTimeAsync(30 * 1000);

    // 30s of a 5s floor is at most 7 attempts, not thousands.
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("goes quiet at a session's absolute end rather than asking forever (B57)", async () => {
    // Since 5 Oct a session has an absolute lifetime from sign-in - ten hours
    // for a child - and a refresh near it reports the SAME deadline every
    // time: it reports one, it does not move one. That is now the ordinary
    // end of every long session, not a misbehaving backend.
    const cap = new Date(Date.now() + MARGIN_MS).toISOString();
    const capped = () =>
      setSession({
        token: "tok-capped",
        expiresAt: cap,
        userId: "student-1",
        role: "student",
      });
    refresh.mockImplementation(async () => capped());
    capped();

    renderHook(() => useSessionRefresh());
    await vi.advanceTimersByTimeAsync(MARGIN_MS);
    const duringMargin = refresh.mock.calls.length;

    // The 5s floor across the two-minute margin: two dozen, not thousands.
    expect(duringMargin).toBeGreaterThan(0);
    expect(duringMargin).toBeLessThanOrEqual(25);

    // Past the deadline the session clears itself, and nothing asks again -
    // `useSessionLapse` takes the child to the door from here.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(refresh.mock.calls.length).toBe(duringMargin);
    expect(getSession()).toBeNull();
  });

  it("asks for nothing when nobody is signed in", async () => {
    renderHook(() => useSessionRefresh());
    await vi.advanceTimersByTimeAsync(MARGIN_MS);
    expect(refresh).not.toHaveBeenCalled();
  });
});
