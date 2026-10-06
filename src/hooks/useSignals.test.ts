import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import type { SessionOutcome } from "./useSignals";

/** Typed so `submitBatch.mock.calls` carries a real tuple and needs no casts. */
interface Envelope {
  sessionId: string;
  lessonId: string | null;
  sessionType: string;
  startedAt: string;
  endedAt?: string;
  completionStatus?: string;
  exitPosition?: string;
  breakCount?: number;
  proactiveAdjustmentsCount?: number;
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

/** The consent gate's answer. Consented unless a test says otherwise. */
const consentGate = (status: string) => ({
  studentId: "user-1",
  granted: status === "confirmed",
  blocked: false,
  requiredType: "data_processing",
  status,
});
const myConsentGate = vi.fn();
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return { ...actual, consentsApi: { ...actual.consentsApi, myConsentGate } };
});

const { useSignals } = await import("./useSignals");
const { ApiError } = await import("@/lib/api");
const { clearSession, setSession } = await import("@/lib/auth/session");
const { holdSignals } = await import("@/lib/signals/outbox");

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
  myConsentGate.mockReset();
  myConsentGate.mockResolvedValue(consentGate("confirmed"));
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

/*
 * A BACKLOG IS SENT IN PIECES THE CONTRACT TAKES. `SignalBatchRequest.events`
 * is `maxItems: 100`; a held queue holds 200, and the whole queue went as one
 * batch - so a 422 dropped every event in it.
 */
describe("a backlog larger than one request", () => {
  it("goes in requests of at most 100, and all of it goes", async () => {
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));

    // Signed out, so it is held - up to the held cap.
    act(() => {
      for (let i = 0; i < 180; i++)
        result.current.trackEvent("time_on_segment", { i });
    });
    signIn();
    await act(async () => {
      result.current.flush();
    });

    const sizes = submitBatch.mock.calls.map(([, events]) => events.length);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    const sent = submitBatch.mock.calls.flatMap(([, events]) => events);
    expect(sent.filter((e) => e.type === "time_on_segment")).toHaveLength(180);
  });
});

/*
 * WHAT A PAGE THAT IS GOING AWAY STILL OWES. The queue is a ref: backgrounding
 * and closing unmount nothing, an offline exit re-queued into a ref nothing
 * would flush again, and a 401 cleared the token and left the page.
 */
describe("signals that outlive their screen", () => {
  const OUTBOX = "nevo.signals.outbox";
  const held = () =>
    JSON.parse(window.localStorage.getItem(OUTBOX) ?? "[]") as {
      userId: string;
      events: Event[];
    }[];

  it("sends as the tab is hidden, on a request that can outlive it", async () => {
    signIn();
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    act(() => result.current.trackEvent("time_on_segment", { step: 1 }));

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    try {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }

    expect(submitBatch).toHaveBeenCalledTimes(1);
    expect(submitBatch.mock.calls[0]).toContainEqual({ keepalive: true });
  });

  it("keeps a batch that failed offline after the lesson has gone", async () => {
    signIn();
    submitBatch.mockRejectedValueOnce(new ApiError(0, "offline"));
    const { result, unmount } = renderHook(() =>
      useSignals(UUID, LESSON, "lesson"),
    );
    act(() => result.current.trackEvent("time_on_segment", { last: true }));

    unmount();
    await act(async () => {});

    const [entry] = held();
    expect(entry?.userId).toBe("user-1");
    expect(entry?.events.some((e) => e.payload?.last === true)).toBe(true);
  });

  it("keeps what a dying session could not send, for the same child", async () => {
    signIn();
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    act(() => result.current.trackEvent("time_on_segment", { first: true }));
    await act(async () => {
      result.current.flush();
    });

    // A 401 elsewhere: the token is cleared and the page is leaving.
    act(() => result.current.trackEvent("time_on_segment", { stranded: true }));
    clearSession();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    const [entry] = held();
    expect(entry?.userId).toBe("user-1");
    expect(entry?.events.some((e) => e.payload?.stranded === true)).toBe(true);
  });

  it("holds a batch the server refused with 401, rather than dropping it", async () => {
    signIn();
    submitBatch.mockRejectedValueOnce(new ApiError(401, "expired"));
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    act(() => result.current.trackEvent("time_on_segment", { late: true }));

    await act(async () => {
      result.current.flush();
    });

    expect(held()[0]?.events.some((e) => e.payload?.late === true)).toBe(true);
  });

  it("still drops a batch the contract refused", async () => {
    signIn();
    submitBatch.mockRejectedValueOnce(new ApiError(422, "invalid"));
    const { result, unmount } = renderHook(() =>
      useSignals(UUID, LESSON, "lesson"),
    );
    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });
    unmount();
    await act(async () => {});

    expect(held()).toEqual([]);
  });
});

/*
 * THE ENVELOPE SAYS HOW THE SESSION ENDED. It carried four fields, so every
 * batch - the last one included - went with the contract's defaults:
 * `in_progress` and no breaks, for a lesson finished after two of them.
 */
describe("the session envelope", () => {
  it("reports a completed session, when it ended and its breaks", async () => {
    signIn();
    const { result, rerender } = renderHook(
      ({ outcome }: { outcome: SessionOutcome | null }) =>
        useSignals(UUID, LESSON, "lesson", outcome),
      { initialProps: { outcome: null as SessionOutcome | null } },
    );
    act(() => {
      result.current.trackEvent("break_start", {});
      result.current.trackEvent("break_end", {});
    });
    rerender({ outcome: { completionStatus: "completed" } });
    await act(async () => {
      result.current.flush();
    });

    const [envelope] = submitBatch.mock.calls[0]!;
    expect(envelope.completionStatus).toBe("completed");
    expect(envelope.endedAt).toEqual(expect.any(String));
    expect(envelope.breakCount).toBe(1);
  });

  it("says where a child who left was", async () => {
    signIn();
    const { result, rerender } = renderHook(
      ({ outcome }: { outcome: SessionOutcome | null }) =>
        useSignals(UUID, LESSON, "lesson", outcome),
      { initialProps: { outcome: null as SessionOutcome | null } },
    );
    act(() => result.current.trackEvent("exit_attempt", {}));
    rerender({
      outcome: { completionStatus: "exited", exitPosition: "seg-3" },
    });
    await act(async () => {
      result.current.flush();
    });

    const [envelope] = submitBatch.mock.calls[0]!;
    expect(envelope.completionStatus).toBe("exited");
    expect(envelope.exitPosition).toBe("seg-3");
  });

  it("claims no ending while the session is still going", async () => {
    signIn();
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });

    const [envelope] = submitBatch.mock.calls[0]!;
    expect(envelope.completionStatus).toBeUndefined();
    expect(envelope.endedAt).toBeUndefined();
  });

  it("carries the adaptations the child saw applied, as counted when it is sent (B42)", async () => {
    signIn();
    const applied = { current: { count: 0 } };
    const { result } = renderHook(() =>
      useSignals(UUID, LESSON, "lesson", null, applied),
    );
    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });
    // None yet is left to the contract's 0, not claimed.
    expect(submitBatch.mock.calls[0]![0]).not.toHaveProperty(
      "proactiveAdjustmentsCount",
    );

    applied.current.count = 2;
    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });

    expect(submitBatch.mock.calls[1]![0].proactiveAdjustmentsCount).toBe(2);
  });
});

describe("the session's interpretation context", () => {
  const contextOf = async (setup: () => void) => {
    signIn();
    setup();
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });
    return submitBatch.mock.calls[0]![1].find(
      (e) => e.type === "session_context",
    )?.payload;
  };

  it("tags a 1024px touch tablet as a tablet", async () => {
    const payload = await contextOf(() => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (q: string) =>
          ({ matches: q === "(pointer: coarse)", media: q }) as MediaQueryList,
      );
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    });
    expect(payload?.formFactor).toBe("tablet");
  });

  it("counts the child's own reduced-motion switch, not only the OS's", async () => {
    document.documentElement.dataset.reducedMotion = "true";
    try {
      const payload = await contextOf(() => {});
      expect(payload?.reducedMotion).toBe(true);
    } finally {
      delete document.documentElement.dataset.reducedMotion;
    }
  });

  it("carries the contract's two keys and nothing else", async () => {
    const payload = await contextOf(() => {});
    expect(Object.keys(payload ?? {}).sort()).toEqual([
      "formFactor",
      "reducedMotion",
    ]);
  });

  /*
   * FIRST IN THE STREAM, EVEN FOR A LESSON. A lesson's session id lands after
   * its first events, and the context was keyed on the id: "no id" matched "no
   * id", nothing was queued, and the context went in after the id arrived -
   * behind the events it was meant to frame.
   */
  it("comes first when events were tracked before the session id landed", async () => {
    signIn();
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSignals(id, LESSON, "lesson"),
      { initialProps: { id: null as string | null } },
    );
    act(() => result.current.trackEvent("time_on_segment", { n: 1 }));
    rerender({ id: UUID });
    act(() => result.current.trackEvent("time_on_segment", { n: 2 }));
    await act(async () => {
      result.current.flush();
    });

    const types = submitBatch.mock.calls[0]![1].map((e) => e.type);
    expect(types).toEqual([
      "session_context",
      "time_on_segment",
      "time_on_segment",
    ]);
  });

  it("is sent once per session, and again for a new one", async () => {
    const OTHER = "0b8f3a52-5c1e-4d6a-9f00-112233445566";
    signIn();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSignals(id, LESSON, "lesson"),
      { initialProps: { id: UUID } },
    );
    act(() => {
      result.current.trackEvent("time_on_segment", {});
      result.current.trackEvent("time_on_segment", {});
    });
    await act(async () => {
      result.current.flush();
    });
    rerender({ id: OTHER });
    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });

    const contexts = (call: number) =>
      submitBatch.mock.calls[call]![1].filter(
        (e) => e.type === "session_context",
      ).length;
    expect(contexts(0)).toBe(1);
    expect(contexts(1)).toBe(1);
    expect(submitBatch.mock.calls[1]![0].sessionId).toBe(OTHER);
  });
});

/*
 * A GUARDIAN'S WITHDRAWAL STOPS THE STREAM. SCRUM-80: a withdrawal, and only a
 * withdrawal, stops processing - and only the baseline and the warm-up asked,
 * so a lesson went on sending for a child whose guardian had withdrawn.
 *
 * Each test signs in as its own child: the outbox remembers a withdrawal for
 * the life of the page, which in a test file is every test after it.
 */
describe("a withdrawn consent", () => {
  const OUTBOX = "nevo.signals.outbox";
  const held = () =>
    JSON.parse(window.localStorage.getItem(OUTBOX) ?? "[]") as {
      userId: string;
    }[];
  const signInAs = (userId: string) =>
    setSession({
      token: "tok-test",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId,
      role: "student",
    });
  /** Let the gate's answer, and anything it set off, settle. */
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

  it("sends nothing more once the gate reports it", async () => {
    signInAs("child-w1");
    myConsentGate.mockResolvedValue(consentGate("withdrawn"));
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    await settle();

    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });

    expect(submitBatch).not.toHaveBeenCalled();
  });

  it("drops what was queued before the answer came, and keeps none of it", async () => {
    signInAs("child-w2");
    let answer!: (gate: unknown) => void;
    myConsentGate.mockReturnValue(new Promise((r) => (answer = r)));
    const { result, unmount } = renderHook(() =>
      useSignals(UUID, LESSON, "lesson"),
    );
    act(() => result.current.trackEvent("time_on_segment", { early: true }));

    answer(consentGate("withdrawn"));
    await settle();
    await act(async () => {
      result.current.flush();
    });
    unmount();
    await act(async () => {});

    expect(submitBatch).not.toHaveBeenCalled();
    expect(held()).toEqual([]);
  });

  it("deletes what the outbox held for that child, and nobody else's", async () => {
    const env = {
      sessionId: UUID,
      lessonId: LESSON,
      sessionType: "lesson" as const,
      startedAt: "2026-10-01T09:00:00.000Z",
    };
    const one = [{ type: "time_on_segment" as const, timestamp: env.startedAt }];
    holdSignals("child-w3", env, one);
    holdSignals("someone-else", env, one);
    // Offline, so the delivery the hook starts on mount keeps them held.
    submitBatch.mockRejectedValueOnce(new ApiError(0, "offline"));
    signInAs("child-w3");
    myConsentGate.mockResolvedValue(consentGate("withdrawn"));

    renderHook(() => useSignals(UUID, LESSON, "lesson"));
    await settle();

    expect(held().map((h) => h.userId)).toEqual(["someone-else"]);
  });

  it.each(["not_sent", "pending"])(
    "is not what consent %s is, which stops nothing (SCRUM-121)",
    async (status) => {
      signInAs(`child-${status}`);
      myConsentGate.mockResolvedValue(consentGate(status));
      const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
      await settle();

      act(() => result.current.trackEvent("time_on_segment", {}));
      await act(async () => {
        result.current.flush();
      });

      expect(submitBatch).toHaveBeenCalledTimes(1);
    },
  );

  it("is not what a failed read is, which stops nothing either", async () => {
    signInAs("child-unread");
    myConsentGate.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useSignals(UUID, LESSON, "lesson"));
    await settle();

    act(() => result.current.trackEvent("time_on_segment", {}));
    await act(async () => {
      result.current.flush();
    });

    expect(submitBatch).toHaveBeenCalledTimes(1);
  });
});
