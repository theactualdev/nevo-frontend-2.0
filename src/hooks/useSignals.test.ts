import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";

/** Typed so `submitBatch.mock.calls` carries a real tuple and needs no casts. */
interface Envelope {
  sessionId: string;
  lessonId: string | null;
  sessionType: string;
  startedAt: string;
}
interface Event {
  type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

const submitBatch = vi.fn(
  async (_envelope: Envelope, _events: Event[]) => ({
    sessionId: "s",
    acceptedEvents: _events.length,
  }),
);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, signalsApi: { submitBatch } };
});

const { useSignals } = await import("./useSignals");
const { clearSession, setSession } = await import("@/lib/auth/session");

/**
 * These tests encode a defect that destroyed real data silently.
 *
 * Signal ingest is Bearer-only, and a 4xx batch is DROPPED rather than retried
 * - correctly, since a contract rejection would fail identically every five
 * seconds forever. But onboarding happens BEFORE an account exists, so every
 * pre-auth batch 401'd and was dropped: a child's entire baseline profiling
 * stream, gone, with nothing on screen to show it. Both failure paths ended in
 * silence, which is why nothing surfaced it until the wire was read.
 *
 * The fix holds the queue while unauthenticated and flushes once a session
 * exists. The first two tests are the fix; without them a future refactor
 * "simplifying" the token check would reintroduce the loss invisibly.
 */

const UUID = "fd0cba6c-0828-48e3-8510-c78146a5d449";
const LESSON = "9c1e77aa-1111-4222-8333-444455556666";

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "user-1",
    role: "student",
  });

beforeEach(() => {
  submitBatch.mockClear();
  clearSession();
  vi.restoreAllMocks();
});

describe("useSignals", () => {
  it("does not send while signed out - and does not lose the events either", async () => {
    const { result } = renderHook(() =>
      useSignals(UUID, undefined, "onboarding"),
    );

    await act(async () => {
      result.current.trackEvent("time_on_segment", { phase: "pre-auth" });
      result.current.flush();
    });

    // Nothing sent: a 401 batch would be dropped, taking the events with it.
    expect(submitBatch).not.toHaveBeenCalled();

    // ...and the events are still held, so signing in delivers them.
    signIn();
    await act(async () => {
      result.current.flush();
    });
    expect(submitBatch).toHaveBeenCalledTimes(1);
    // The batch carries a device-context event alongside the tracked one, so
    // the assertion is that the PRE-AUTH event survived the wait - not a count.
    const [, events] = submitBatch.mock.calls[0];
    expect(events.some((e) => e.payload?.phase === "pre-auth")).toBe(true);
  });

  it("labels a non-lesson stream and sends no lesson id for it", async () => {
    signIn();
    const { result } = renderHook(() =>
      useSignals(UUID, undefined, "onboarding"),
    );

    await act(async () => {
      result.current.trackEvent("time_on_segment", {});
      result.current.flush();
    });

    const [envelope] = submitBatch.mock.calls[0];
    expect(envelope.sessionType).toBe("onboarding");
    // `lessonId` is nullable now; onboarding is not a lesson and must not
    // borrow an id to satisfy a required field, as it once did.
    expect(envelope.lessonId).toBeNull();
    expect(envelope.sessionId).toBe(UUID);
  });

  it("sends the lesson id for a lesson stream", async () => {
    signIn();
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));

    await act(async () => {
      result.current.trackEvent("time_on_segment", {});
      result.current.flush();
    });

    const [envelope] = submitBatch.mock.calls[0];
    expect(envelope.sessionType).toBe("lesson");
    expect(envelope.lessonId).toBe(LESSON);
  });

  it("holds a lesson stream that has no lesson id yet", async () => {
    signIn();
    // A lesson session id arrives asynchronously. Sending before it lands
    // would post a batch the validator refuses, so the events wait.
    const { result } = renderHook(() => useSignals(UUID, undefined, "lesson"));

    await act(async () => {
      result.current.trackEvent("time_on_segment", {});
      result.current.flush();
    });
    expect(submitBatch).not.toHaveBeenCalled();
  });

  it("sends nothing when there is nothing to send", async () => {
    signIn();
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    await act(async () => {
      result.current.flush();
    });
    expect(submitBatch).not.toHaveBeenCalled();
  });
});

/*
 * THE CLOCK. Frontend §2 and rule 4.
 *
 * Every event used to be stamped `new Date().toISOString()`, read fresh from
 * the device wall clock. A clock correction landing mid-lesson - an NTP sync on
 * an unsynced Android, a child changing the date - shifted every subsequent
 * timestamp, corrupting every latency that spanned it and able to reorder the
 * stream outright. Latency is the primary signal for three of the four
 * affective states, and §2 is blunt that precision the client did not send
 * cannot be recovered.
 *
 * The events are now dated from a per-session anchor: one wall reading and one
 * `performance.now()` reading taken together, then `wall + (now - perf)`. The
 * wire is unchanged - still `format: date-time` - and every within-session
 * delta is now the difference of two monotonic readings.
 */
describe("the clock the engine measures latency from", () => {
  it("keeps deltas true when the device clock jumps mid-session", async () => {
    let perf = 1_000;
    let wall = Date.parse("2026-09-17T09:00:00.000Z");
    vi.spyOn(performance, "now").mockImplementation(() => perf);
    vi.spyOn(Date, "now").mockImplementation(() => wall);

    const { result } = renderHook(() => useSignals(UUID, LESSON));
    signIn();

    act(() => result.current.trackEvent("time_on_segment", { step: 1 }));
    // 250ms of real time passes...
    perf += 250;
    // ...and the device clock is corrected backwards by an hour in the middle
    // of it. Under the old code this event was stamped an hour BEFORE the one
    // that preceded it.
    wall -= 60 * 60 * 1000;
    act(() => result.current.trackEvent("time_on_segment", { step: 2 }));

    await act(async () => {
      await result.current.flush();
    });

    const events = submitBatch.mock.calls[0]![1];
    const timed = events.filter((e) => e.type !== "session_context");
    const delta =
      Date.parse(timed[1]!.timestamp) - Date.parse(timed[0]!.timestamp);

    // The only number that matters: 250ms of monotonic time, measured as 250ms.
    expect(delta).toBe(250);
    // And the stream is still in order, which the wall clock could not promise.
    expect(delta).toBeGreaterThan(0);
  });

  it("dates the envelope from the same anchor as its events", async () => {
    let perf = 500;
    const wall = Date.parse("2026-09-17T10:00:00.000Z");
    vi.spyOn(performance, "now").mockImplementation(() => perf);
    vi.spyOn(Date, "now").mockImplementation(() => wall);

    const { result } = renderHook(() => useSignals(UUID, LESSON));
    signIn();

    act(() => result.current.trackEvent("time_on_segment", { step: 1 }));
    perf += 40;
    await act(async () => {
      await result.current.flush();
    });

    const [envelope, events] = submitBatch.mock.calls[0]!;
    // An envelope dated later than the events it carries is the defect the
    // session-reset comment already warns about; deriving both from one anchor
    // makes it unrepresentable.
    expect(Date.parse(envelope.startedAt)).toBeLessThanOrEqual(
      Date.parse(events[0]!.timestamp),
    );
  });
});

describe("the last event before a component goes", () => {
  /*
   * React runs this hook's cleanup before the cleanups of effects its caller
   * declared after it. The player's time-on-segment event is exactly such a
   * cleanup, so the hook flushed and THEN the last segment's timing landed in
   * a queue nothing would flush again - lost on every exit and completion.
   */
  it("is sent even when the caller queues it in its own unmount cleanup", async () => {
    signIn();
    const { unmount } = renderHook(() => {
      const { trackEvent } = useSignals(UUID, LESSON, "lesson");
      // Declared AFTER the hook, as the player's timing effect is.
      useEffectOnUnmount(() =>
        trackEvent("time_on_segment" as never, { segmentId: "last" }),
      );
    });

    unmount();
    await act(async () => {});

    const sent = submitBatch.mock.calls.flatMap(([, events]) => events);
    expect(sent.map((e) => e.payload?.segmentId)).toContain("last");
  });
});

function useEffectOnUnmount(fn: () => void) {
  useEffect(() => fn, [fn]);
}
