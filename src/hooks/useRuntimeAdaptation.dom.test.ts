import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
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

const run = (state: RuntimeState = STATE) =>
  renderHook(
    ({ s }: { s: RuntimeState }) =>
      useRuntimeAdaptation(LESSON.id, SEGMENTS as never, true, s, LESSON),
    { initialProps: { s: state } },
  );

/** The `signals` of the nth request. */
const sent = (n = 0) =>
  (getAdaptation.mock.calls[n]![2] as { signals: RuntimeSignals }).signals;

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

    rerender({ s: { ...STATE, replayCountOnSegment: 1 } });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).replayCountOnSegment).toBe(1);
  });

  it("asks again when an offer is turned down", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    rerender({
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
    rerender({ s: { ...STATE, breaksTaken: 1 } });
    // ...and a minute later moves on.
    now += 60_000;
    rerender({ s: { ...STATE, breaksTaken: 1, currentSegmentId: "seg-2" } });

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).continuousMinutes).toBeCloseTo(1, 5);
  });

  it("counts a switch within a segment, not each segment's opening", async () => {
    getAdaptation.mockResolvedValue(answer());
    const { rerender } = run();
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));

    // The next segment opens in its own modality: not a shift.
    rerender({
      s: { ...STATE, currentSegmentId: "seg-2", currentModality: "audio" },
    });
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(sent(1).sessionModalityShiftCount).toBe(0);

    // An offer taken on that segment is.
    rerender({
      s: { ...STATE, currentSegmentId: "seg-2", currentModality: "text" },
    });
    rerender({
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
      useRuntimeAdaptation(LESSON.id, SEGMENTS as never, true, STATE, LESSON, applied),
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
