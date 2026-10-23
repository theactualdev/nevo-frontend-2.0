import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  useRuntimeAdaptation,
  type AppliedAdaptations,
  type RuntimeState,
} from "./useRuntimeAdaptation";
import type { RuntimeSignals } from "@/lib/api/intelligence";
import type { Lesson } from "@/lib/types";

/**
 * The mid-lesson answer carries the same instruction, hint, questions,
 * scaffolding and suggestion as the load-time one - and only the break
 * suggestion was kept. These pin that the rest now reaches the player.
 */

const { getAdaptation } = vi.hoisted(() => ({ getAdaptation: vi.fn() }));
vi.mock("@/lib/api", () => ({ intelligenceApi: { getAdaptation } }));

const LESSON = {
  id: "9c1e77aa-1111-4222-8333-444455556666",
  title: "Fractions",
  segments: [{ id: "seg-1", modalities: ["text"] }],
} as unknown as Lesson;
const SEGMENTS = [{ segmentId: "seg-1", availableModalities: ["text"] }];

const answer = (over: Record<string, unknown> = {}) => ({
  lessonId: LESSON.id,
  source: "rule_based",
  segments: [{ segmentId: "seg-1", modality: "text", scaffolding: "light" }],
  breakSuggestion: { breakType: null, reason: null },
  proactiveAdjustment: null,
  modalitySuggestion: null,
  ...over,
});

const STATE: RuntimeState = {
  currentSegmentId: "seg-1",
  currentModality: "text",
  availableModalities: ["text"],
  midpointReached: false,
  replayCountOnSegment: 0,
  consecutiveErrors: 0,
  declinedModalities: [],
  sessionDeclineCount: 0,
  sameSegmentSuggestionShown: false,
  segmentsSinceLastSuggestion: null,
  breaksTaken: 0,
};

/** The lesson session `POST /session` issued. */
const SESSION = "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff";

const run = (state: RuntimeState = STATE, session: string | null = SESSION) =>
  renderHook(
    ({ s, id }: { s: RuntimeState; id: string | null }) =>
      useRuntimeAdaptation(LESSON.id, SEGMENTS as never, true, id, s, LESSON),
    { initialProps: { s: state, id: session } },
  );

/** The `signals` of the nth request. */
const sent = (n = 0) =>
  (getAdaptation.mock.calls[n]![2] as { signals: RuntimeSignals }).signals;
/** The options of the nth request, `signals` aside. */
const asked = (n = 0) =>
  getAdaptation.mock.calls[n]![2] as { mode?: string; sessionId?: string };

afterEach(() => {
  cleanup();
  getAdaptation.mockReset();
});

describe("what the engine says mid-lesson", () => {
  it("keeps its instruction, not only its break", async () => {
    getAdaptation.mockResolvedValue(
      answer({
        proactiveAdjustment: {
          action: "offer_hint",
          hint: "Look at the bottom number first.",
        },
      }),
    );

    const { result } = run();

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.plan?.adjustment).toBe("offer_hint");
    expect(result.current.plan?.hint).toBe("Look at the bottom number first.");
  });

  it("says which segment it was asked for, so its hint stays there", async () => {
    // The instruction is lesson-level on the wire; the request is not.
    getAdaptation.mockResolvedValue(
      answer({ proactiveAdjustment: { action: "offer_hint", hint: "Look down." } }),
    );

    const { result } = run();

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.forSegmentId).toBe("seg-1");
  });

  it("gets the load-time clamps - no reasoning crosses", async () => {
    getAdaptation.mockResolvedValue(
      answer({
        proactiveAdjustment: {
          action: "simplify",
          reason: "struggling",
          confidence: 0.8,
        },
      }),
    );

    const { result } = run();

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(JSON.stringify(result.current.plan)).not.toMatch(
      /struggling|confidence/,
    );
  });

  it("is not read as 'the engine now says nothing' when the call fails", async () => {
    getAdaptation.mockRejectedValue(new Error("offline"));

    const { result } = run();

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    expect(result.current.plan).toBeNull();
  });
});

/*
 * WHAT THE REQUEST SAYS, and when it is asked. It sent 8 of 21 fields and was
 * asked only on the way into a segment, so the counts that describe a segment
 * were zero by construction and declines never reached the engine at all.
 */
describe("the mid-lesson request", () => {
  it("tells the engine what the child did, as counts", async () => {
    getAdaptation.mockResolvedValue(answer());

    run({
      ...STATE,
      replayCountOnSegment: 2,
      consecutiveErrors: 3,
      declinedModalities: ["audio"],
      sessionDeclineCount: 1,
      sameSegmentSuggestionShown: true,
      segmentsSinceLastSuggestion: 0,
    });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    expect(sent()).toMatchObject({
      replayCountOnSegment: 2,
      consecutiveErrors: 3,
      declinedModalities: ["audio"],
      sessionDeclineCount: 1,
      sameSegmentSuggestionShown: true,
      segmentsSinceLastSuggestion: 0,
    });
  });

  it("asks again when the child replays, not only at the next segment", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    rerender({ id: SESSION, s: { ...STATE, replayCountOnSegment: 1 } });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).replayCountOnSegment).toBe(1);
  });

  it("asks again when an offer is turned down", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    rerender({
      id: SESSION,
      s: { ...STATE, sessionDeclineCount: 1, declinedModalities: ["audio"] },
    });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).declinedModalities).toEqual(["audio"]);
  });

  it("does not send a 'since last adaptation' it cannot vouch for", async () => {
    getAdaptation.mockResolvedValue(answer());
    run();

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty("secondsSinceLastAdaptation");
  });

  it("starts a new stretch of work after a break", async () => {
    let now = 1;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    // 25 minutes in, the child takes a break and comes back...
    now += 25 * 60_000;
    rerender({ id: SESSION, s: { ...STATE, breaksTaken: 1 } });
    // ...and a minute later moves on.
    now += 60_000;
    rerender({
      id: SESSION,
      s: { ...STATE, breaksTaken: 1, currentSegmentId: "seg-2" },
    });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).continuousMinutes).toBeCloseTo(1, 5);
  });

  it("counts a switch within a segment, not each segment's opening", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    // The next segment opens in its own modality: not a shift.
    rerender({
      id: SESSION,
      s: { ...STATE, currentSegmentId: "seg-2", currentModality: "audio" },
    });
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).sessionModalityShiftCount).toBe(0);

    // An offer taken on that segment is.
    rerender({
      id: SESSION,
      s: { ...STATE, currentSegmentId: "seg-2", currentModality: "text" },
    });
    rerender({
      id: SESSION,
      s: {
        ...STATE,
        currentSegmentId: "seg-2",
        currentModality: "text",
        replayCountOnSegment: 1,
      },
    });
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(3));
    expect(sent(2).sessionModalityShiftCount).toBe(1);
  });

  it("says which segment its answer was about", async () => {
    getAdaptation.mockResolvedValue(
      answer({ breakSuggestion: { breakType: "movement", reason: null } }),
    );
    const { result } = run();

    await waitFor(() => expect(result.current.offeredBreak).toBe("movement"));
    expect(result.current.forSegmentId).toBe("seg-1");
  });
});

/*
 * THE LESSON SESSION, from the 20 Oct production run: the engine refuses an
 * `in_lesson` read 409 `lesson_session_required` without an open sitting, and
 * the first ask went before `POST /session` had answered.
 */
describe("the mid-lesson request and the lesson session", () => {
  it("asks nothing while there is no session, even on a segment", async () => {
    getAdaptation.mockResolvedValue(answer());

    run(STATE, null);
    // The request is built a microtask after the commit.
    await act(async () => {});

    expect(getAdaptation).not.toHaveBeenCalled();
  });

  it("asks as soon as the session lands, for the segment the child is on, naming it", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run(STATE, null);
    await act(async () => {});

    rerender({ id: SESSION, s: STATE });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));
    expect(asked()).toMatchObject({ mode: "in_lesson", sessionId: SESSION });
    expect(sent().currentSegmentId).toBe("seg-1");
  });

  it("names a new session on the next ask", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));
    expect(asked().sessionId).toBe(SESSION);

    // A reroute opens a new sitting.
    const rerouted = "7d2f1e4b-1111-4222-8333-999988887777";
    rerender({ id: rerouted, s: STATE });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(asked(1).sessionId).toBe(rerouted);
  });
});

/*
 * SCRUM-275, the 21 Oct run: the ask after an answer went beside that
 * answer's write, not after it. The engine reads its error streak from the
 * answers it has stored, so it could count one miss where there were two and
 * hold the hint two misses earn. The ask now waits for the writes on their
 * way - and still goes if one fails, so the engine is never left silent.
 */
describe("the mid-lesson request and the answers on their way", () => {
  /** A write the test lands or fails by hand. */
  const deferred = () => {
    let land!: () => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      land = res;
      fail = rej;
    });
    return { promise, land, fail };
  };

  const runWith = (writes: { current: Promise<unknown>[] }) =>
    renderHook(
      ({ s }: { s: RuntimeState }) =>
        useRuntimeAdaptation(
          LESSON.id,
          SEGMENTS as never,
          true,
          SESSION,
          s,
          LESSON,
          null,
          writes,
        ),
      { initialProps: { s: STATE } },
    );

  /** Long enough for any microtask chain to have run. */
  const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

  it("asks after the answer's write has landed, not beside it", async () => {
    const order: string[] = [];
    getAdaptation.mockImplementation(async () => {
      order.push("ask");
      return answer();
    });
    const writes = { current: [] as Promise<unknown>[] };
    const { rerender } = runWith(writes);
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    // The player writes the answer, then counts the miss.
    const write = deferred();
    writes.current.push(write.promise.then(() => order.push("written")));
    rerender({ s: { ...STATE, consecutiveErrors: 1 } });
    await settle();

    expect(getAdaptation).toHaveBeenCalledTimes(1);

    write.land();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(order).toEqual(["ask", "written", "ask"]);
    expect(sent(1).consecutiveErrors).toBe(1);
  });

  it("still asks when the write fails, so the engine is not left silent", async () => {
    getAdaptation.mockResolvedValue(answer());
    const writes = { current: [] as Promise<unknown>[] };
    const { rerender } = runWith(writes);
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    const write = deferred();
    writes.current.push(write.promise);
    rerender({ s: { ...STATE, consecutiveErrors: 1 } });
    await settle();
    expect(getAdaptation).toHaveBeenCalledTimes(1);

    write.fail(new Error("offline"));

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).consecutiveErrors).toBe(1);
  });

  it("waits for every write still on its way, not only the newest", async () => {
    getAdaptation.mockResolvedValue(answer());
    const writes = { current: [] as Promise<unknown>[] };
    const { rerender } = runWith(writes);
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    const first = deferred();
    const second = deferred();
    writes.current.push(first.promise, second.promise);
    rerender({ s: { ...STATE, consecutiveErrors: 2 } });

    second.land();
    await settle();
    expect(getAdaptation).toHaveBeenCalledTimes(1);

    first.land();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
  });

  it("asks once, with the newest count, when a second miss comes before the first write lands", async () => {
    getAdaptation.mockResolvedValue(answer());
    const writes = { current: [] as Promise<unknown>[] };
    const { rerender } = runWith(writes);
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    const first = deferred();
    writes.current.push(first.promise);
    rerender({ s: { ...STATE, consecutiveErrors: 1 } });
    // The first ask is waiting on its write when the second miss comes.
    await settle();
    const second = deferred();
    writes.current.push(second.promise);
    rerender({ s: { ...STATE, consecutiveErrors: 2 } });

    first.land();
    second.land();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    await settle();

    expect(getAdaptation).toHaveBeenCalledTimes(2);
    expect(sent(1).consecutiveErrors).toBe(2);
  });

  it("still asks nothing before the session, whatever is on its way (#837)", async () => {
    getAdaptation.mockResolvedValue(answer());
    const writes = { current: [Promise.resolve()] as Promise<unknown>[] };
    renderHook(() =>
      useRuntimeAdaptation(
        LESSON.id,
        SEGMENTS as never,
        true,
        null,
        STATE,
        LESSON,
        null,
        writes,
      ),
    );
    await settle();

    expect(getAdaptation).not.toHaveBeenCalled();
  });
});

/*
 * B42 AND B46, backend's 5 Oct definitions: the cooldown counts from an
 * adaptation APPLIED ON SCREEN, and the instruction names its own segment.
 */
describe("what the engine is told about adaptations applied", () => {
  let now = 0;
  beforeEach(() => {
    now = 50_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    getAdaptation.mockResolvedValue(answer());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ask = (applied: { current: AppliedAdaptations }) =>
    renderHook(() =>
      useRuntimeAdaptation(
        LESSON.id,
        SEGMENTS as never,
        true,
        SESSION,
        STATE,
        LESSON,
        applied,
      ),
    );

  it("counts the seconds since one was applied, rounded down", async () => {
    ask({ current: { count: 1, lastAt: 37_400 } });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    // 12.6s: the cooldown is never told more time has passed than has.
    expect(sent().secondsSinceLastAdaptation).toBe(12);
  });

  it("says null while none has been applied this session", async () => {
    ask({ current: { count: 0, lastAt: null } });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    expect(sent()).toHaveProperty("secondsSinceLastAdaptation", null);
  });

  it("includes one applied as the child arrives, by the player's own later effect", async () => {
    // The player notes what reached the screen in effects that run after
    // this hook's, in the same commit as the arrival that asks.
    const applied = { current: { count: 0, lastAt: null as number | null } };
    renderHook(() => {
      const result = useRuntimeAdaptation(
        LESSON.id,
        SEGMENTS as never,
        true,
        SESSION,
        STATE,
        LESSON,
        applied,
      );
      useEffect(() => {
        applied.current = { count: 1, lastAt: performance.now() };
      }, []);
      return result;
    });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    expect(sent().secondsSinceLastAdaptation).toBe(0);
  });

  it("takes the segment an instruction is for from the instruction (B46)", async () => {
    getAdaptation.mockResolvedValue(
      answer({
        proactiveAdjustment: {
          action: "offer_hint",
          hint: "Look down.",
          segmentId: "seg-7",
        },
      }),
    );

    const { result } = ask({ current: { count: 0, lastAt: null } });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.forSegmentId).toBe("seg-7");
  });
});
