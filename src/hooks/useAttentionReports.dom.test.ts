import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";
import {
  resetAttentionReports,
  useAttentionReports,
} from "./useAttentionReports";

/**
 * FOCUS EVENTS (Teslim, 8ab10c5; Lydia's rollout order, 1 Nov). The server
 * closes an away only with a return for the same section, and an interval it
 * cannot close leaves the rest of the sitting unestablished - so every case
 * here is about the sitting staying coherent: in order, the same event on a
 * retry, the right section after a reload, nothing sent where no section is.
 */

const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/attention", () => ({
  attentionApi: {
    report: (...a: unknown[]) => report(...a),
  },
}));

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_A = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_B = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

type Props = { on: boolean; sessionId: string | null; segmentId: string | null };
const mount = (props: Partial<Props> = {}) =>
  renderHook((p: Props) => useAttentionReports(p), {
    initialProps: { on: true, sessionId: SESSION, segmentId: SEG_A, ...props },
  });

/** Each call as `[action, segmentId]`. */
const sent = () =>
  report.mock.calls.map(([, r]) => [
    (r as { action: string }).action,
    (r as { segmentId: string }).segmentId,
  ]);
const settle = () => act(async () => {});
/**
 * A call's event: what is queued and kept, without the time on screen that
 * each try measures afresh.
 */
const eventOf = (call: unknown[]) => {
  const event = { ...(call[1] as Record<string, unknown>) };
  delete event.clientVisibleForMs;
  return event;
};

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  visibility = "visible";
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });
  report.mockReset().mockResolvedValue({ state: "returned" });
});

afterEach(() => {
  resetAttentionReports();
  clearSession();
  vi.useRealTimers();
});

describe("what is sent", () => {
  it("reports the first section once the sitting is known, with how long it has been on screen", async () => {
    const { rerender } = mount({ sessionId: null });
    await settle();
    expect(report).not.toHaveBeenCalled();

    rerender({ on: true, sessionId: SESSION, segmentId: SEG_A });
    await settle();

    expect(report).toHaveBeenCalledOnce();
    const [session, body, options] = report.mock.calls[0];
    expect(session).toBe(SESSION);
    // No absence before it, so no length - only its time on screen.
    expect(Object.keys(body as object).sort()).toEqual([
      "action",
      "clientEventId",
      "clientVisibleForMs",
      "segmentId",
    ]);
    expect(body).toMatchObject({ action: "return", segmentId: SEG_A });
    expect((body as { clientEventId: string }).clientEventId).toMatch(UUID);
    expect(options).toEqual({ keepalive: false });
  });

  it("reports each section as it comes on screen, once", async () => {
    const { rerender } = mount();
    await settle();
    rerender({ on: true, sessionId: SESSION, segmentId: SEG_B });
    await settle();
    rerender({ on: true, sessionId: SESSION, segmentId: SEG_B });
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["return", SEG_B],
    ]);
  });

  it("sends away when hidden and return when visible, both for the section on screen", async () => {
    mount({ segmentId: SEG_B });
    await settle();

    setVisibility("hidden");
    await settle();
    // The page may not run again: the away is let outlive it.
    expect(report.mock.calls[1][2]).toEqual({ keepalive: true });
    setVisibility("visible");
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_B],
      ["away", SEG_B],
      ["return", SEG_B],
    ]);
  });

  it("sends one away for a page hidden and then closed", async () => {
    mount();
    await settle();

    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["away", SEG_A],
    ]);
  });

  it("sends nothing while no section is on screen - no away nothing would close", async () => {
    const { rerender } = mount();
    await settle();
    // The after-lesson questions, or the finished lesson.
    rerender({ on: true, sessionId: SESSION, segmentId: null });
    await settle();

    setVisibility("hidden");
    setVisibility("visible");
    await settle();

    expect(sent()).toEqual([["return", SEG_A]]);
  });

  it("sends nothing when off, or with nobody signed in", async () => {
    mount({ on: false });
    await settle();
    clearSession();
    mount();
    await settle();

    expect(report).not.toHaveBeenCalled();
  });
});

describe("one coherent sitting", () => {
  it("never sends a return before its away has landed", async () => {
    mount();
    await settle();
    let land: () => void = () => {};
    report.mockImplementationOnce(
      () => new Promise((resolve) => (land = () => resolve({}))),
    );

    setVisibility("hidden");
    setVisibility("visible");
    await settle();
    expect(sent()).toEqual([
      ["return", SEG_A],
      ["away", SEG_A],
    ]);

    land();
    await settle();
    expect(sent()).toEqual([
      ["return", SEG_A],
      ["away", SEG_A],
      ["return", SEG_A],
    ]);
  });

  it("tries a failed send again as the same event", async () => {
    vi.useFakeTimers();
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    mount();
    await settle();
    expect(report).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(report).toHaveBeenCalledTimes(2);
    expect(eventOf(report.mock.calls[1])).toEqual(eventOf(report.mock.calls[0]));
  });

  it("sends at once when the device is back online", async () => {
    report.mockRejectedValueOnce(new ApiError(503, "unavailable"));
    mount();
    await settle();

    window.dispatchEvent(new Event("online"));
    await settle();

    expect(report).toHaveBeenCalledTimes(2);
    expect(eventOf(report.mock.calls[1])).toEqual(eventOf(report.mock.calls[0]));
  });

  it("sends nothing more for a sitting the server no longer holds", async () => {
    vi.useFakeTimers();
    report.mockRejectedValueOnce(
      new ApiError(404, "gone", { detail: { code: "active_session_not_found" } }),
    );
    const { rerender } = mount();
    await settle();

    rerender({ on: true, sessionId: SESSION, segmentId: SEG_B });
    setVisibility("hidden");
    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(report).toHaveBeenCalledOnce();
  });

  it("drops only the event for a section that is not the lesson's", async () => {
    report.mockRejectedValueOnce(
      new ApiError(404, "no section", { detail: { code: "lesson_section_not_found" } }),
    );
    const { rerender } = mount();
    await settle();

    rerender({ on: true, sessionId: SESSION, segmentId: SEG_B });
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["return", SEG_B],
    ]);
  });

  it("after a reload, returns the section that went away first", async () => {
    const first = mount();
    await settle();
    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    first.unmount();

    // A new page: nothing in memory, the child's shelf in storage.
    resetAttentionReports();
    report.mockClear();
    setVisibility("visible");
    mount({ segmentId: SEG_B });
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["return", SEG_B],
    ]);
  });

  it("sends what the last page could not, first and as the same events", async () => {
    report.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(0, "offline"));
    const first = mount();
    await settle();
    setVisibility("hidden");
    await settle();
    const away = report.mock.calls[1][1];
    first.unmount();

    resetAttentionReports();
    report.mockClear().mockResolvedValue({});
    setVisibility("visible");
    mount();
    await settle();

    expect(sent()).toEqual([
      ["away", SEG_A],
      ["return", SEG_A],
    ]);
    expect(report.mock.calls[0][1]).toEqual(away);
  });

  it("sends an away when the lesson is left, and none when it is straight back", async () => {
    const first = mount();
    await settle();
    // A remount - Strict Mode's, or the same lesson again at once.
    first.unmount();
    const again = mount();
    await settle();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(sent()).toEqual([["return", SEG_A]]);

    again.unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["away", SEG_A],
    ]);
  });
});

/*
 * THE LENGTH OF EVERY ABSENCE THIS PAGE SAW BEGIN (Teslim, 9 Nov; the 9 Nov
 * desktop run, where an away that left late or slowly was recorded 15.8 s
 * and 6.8 s short by its arrival). Its return carries the length, measured
 * here with `performance.now()` from going away to coming back; nothing
 * else from the device clock, and nothing for an absence a reload split.
 */
describe("the length of every absence this page saw", () => {
  let clock = 0;
  beforeEach(() => {
    clock = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  const bodies = () =>
    report.mock.calls.map(([, r]) => r as Record<string, unknown>);

  it("puts it on the return for an away that went as it happened too", async () => {
    mount();
    await settle();
    setVisibility("hidden");
    await settle();
    clock += 120_000;
    setVisibility("visible");
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["away", SEG_A],
      ["return", SEG_A],
    ]);
    const [first, away, back] = bodies();
    expect(first).not.toHaveProperty("clientAwayDurationMs");
    expect(away).not.toHaveProperty("clientAwayDurationMs");
    expect(back.clientAwayDurationMs).toBe(120_000);
  });

  it("measures it as the child comes back, not when the return can go", async () => {
    mount();
    await settle();
    // The away is slow to land (17.8 s in flight on 9 Nov).
    let land: () => void = () => {};
    report.mockImplementationOnce(
      () => new Promise((resolve) => (land = () => resolve({}))),
    );
    setVisibility("hidden");
    await settle();
    clock += 30_000;
    setVisibility("visible");
    await settle();
    clock += 10_000;
    land();
    await settle();

    expect(bodies().at(-1)).toMatchObject({
      action: "return",
      clientAwayDurationMs: 30_000,
    });
  });

  it("puts the measured length on the return when the away could not go, and on nothing else", async () => {
    mount();
    await settle();
    // The network is gone as the page goes away.
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    setVisibility("hidden");
    await settle();
    clock += 120_000;
    setVisibility("visible");
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["away", SEG_A],
      ["away", SEG_A],
      ["return", SEG_A],
    ]);
    const [, away, awayAgain, back] = bodies();
    expect(away).not.toHaveProperty("clientAwayDurationMs");
    expect(awayAgain).toEqual(away);
    expect(back.clientAwayDurationMs).toBe(120_000);
  });

  it("measures it when an away went late but before the child was back", async () => {
    mount();
    await settle();
    report.mockRejectedValueOnce(new ApiError(503, "unavailable"));
    setVisibility("hidden");
    await settle();
    clock += 30_000;
    window.dispatchEvent(new Event("online"));
    await settle();
    clock += 45_000;
    setVisibility("visible");
    await settle();

    expect(bodies().at(-1)).toMatchObject({
      action: "return",
      clientAwayDurationMs: 75_000,
    });
  });

  it("counts an away held up behind an event that could not go as late too", async () => {
    // The first section's return cannot go, and again as the page goes away,
    // so the away waits behind it.
    report
      .mockRejectedValueOnce(new ApiError(0, "offline"))
      .mockRejectedValueOnce(new ApiError(0, "offline"));
    mount();
    await settle();
    setVisibility("hidden");
    await settle();
    clock += 60_000;
    setVisibility("visible");
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(bodies().at(-1)).toMatchObject({
      action: "return",
      clientAwayDurationMs: 60_000,
    });
  });

  it("sends none for an absence this page did not see begin - after a reload", async () => {
    const first = mount();
    await settle();
    report.mockRejectedValue(new ApiError(0, "offline"));
    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    first.unmount();

    resetAttentionReports();
    report.mockReset().mockResolvedValue({});
    clock = 500;
    setVisibility("visible");
    mount();
    await settle();

    expect(sent()).toEqual([
      ["away", SEG_A],
      ["return", SEG_A],
    ]);
    expect(bodies().every((b) => !("clientAwayDurationMs" in b))).toBe(true);
  });

  it("sends none after a reload even when the old away fails again before the child is back", async () => {
    const first = mount();
    await settle();
    report.mockRejectedValue(new ApiError(0, "offline"));
    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    first.unmount();

    // A new page, opened while still hidden: the old away tries and fails.
    resetAttentionReports();
    report.mockReset().mockRejectedValueOnce(new ApiError(0, "offline"));
    report.mockResolvedValue({});
    clock = 90_000;
    mount();
    window.dispatchEvent(new Event("online"));
    await settle();
    clock += 30_000;
    setVisibility("visible");
    await settle();

    expect(sent()).toEqual([
      ["away", SEG_A],
      ["away", SEG_A],
      ["return", SEG_A],
    ]);
    expect(bodies().every((b) => !("clientAwayDurationMs" in b))).toBe(true);
  });

  it("sends none over the server's ten-hour bound", async () => {
    mount();
    await settle();
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    setVisibility("hidden");
    await settle();
    clock += 36_000_001;
    setVisibility("visible");
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(bodies().at(-1)).toMatchObject({ action: "return" });
    expect(bodies().at(-1)).not.toHaveProperty("clientAwayDurationMs");
  });

  it("measures each absence afresh", async () => {
    mount();
    await settle();
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    setVisibility("hidden");
    await settle();
    clock += 10_000;
    setVisibility("visible");
    window.dispatchEvent(new Event("online"));
    await settle();
    setVisibility("hidden");
    await settle();
    clock += 20_000;
    setVisibility("visible");
    await settle();

    const returns = bodies().filter((b) => b.action === "return");
    expect(returns.at(-2)?.clientAwayDurationMs).toBe(10_000);
    expect(returns.at(-1)?.clientAwayDurationMs).toBe(20_000);
  });
});

/*
 * HOW LONG THE SECTION HAS BEEN ON SCREEN WHEN ITS RETURN GOES (Teslim,
 * 9 Nov: `clientVisibleForMs`, "I'll date the return as arrival minus
 * that"; live 10 Nov). After a reload or a reopen the return waited 8 to
 * 12 s for the sitting, and the server stamped it then. Measured here and
 * sent with every return this page queued - never on an away, which the
 * server refuses.
 */
describe("how long the section has been on screen when its return goes", () => {
  let clock = 0;
  beforeEach(() => {
    clock = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  /** Each call, as `[action, clientVisibleForMs]`. */
  const visibleFor = () =>
    report.mock.calls.map(([, r]) => [
      (r as { action: string }).action,
      (r as { clientVisibleForMs?: number }).clientVisibleForMs,
    ]);

  it("never puts it on an away, sent live or tried again: the server refuses it there", async () => {
    mount();
    await settle();
    setVisibility("hidden");
    await settle();
    clock += 5_000;
    setVisibility("visible");
    await settle();
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    setVisibility("hidden");
    await settle();
    clock += 30_000;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(visibleFor()).toEqual([
      ["return", 0],
      ["away", undefined],
      ["return", 0],
      ["away", undefined],
      ["away", undefined],
    ]);
    for (const [, r] of report.mock.calls) {
      if ((r as { action: string }).action === "away") {
        expect(r).not.toHaveProperty("clientVisibleForMs");
      }
    }
  });

  it("counts from when the section came on screen, not from when the sitting was known", async () => {
    const { rerender } = mount({ sessionId: null });
    await settle();
    clock += 8_000;
    rerender({ on: true, sessionId: SESSION, segmentId: SEG_A });
    await settle();

    expect(visibleFor()).toEqual([["return", 8_000]]);
  });

  it("counts from the page coming back, where it was hidden in between", async () => {
    const { rerender } = mount({ sessionId: null });
    await settle();
    clock += 2_000;
    setVisibility("hidden");
    clock += 8_000;
    setVisibility("visible");
    clock += 5_000;
    rerender({ on: true, sessionId: SESSION, segmentId: SEG_A });
    await settle();

    expect(visibleFor()).toEqual([["return", 5_000]]);
  });

  it("counts a new section from when it came on screen", async () => {
    const { rerender } = mount();
    await settle();
    clock += 40_000;
    rerender({ on: true, sessionId: SESSION, segmentId: SEG_B });
    await settle();

    expect(visibleFor()).toEqual([
      ["return", 0],
      ["return", 0],
    ]);
  });

  it("counts the wait behind an away still on its way, and nothing on the away", async () => {
    mount();
    await settle();
    let land: () => void = () => {};
    report.mockImplementationOnce(
      () => new Promise((resolve) => (land = () => resolve({}))),
    );
    setVisibility("hidden");
    clock += 20_000;
    setVisibility("visible");
    await settle();
    clock += 4_000;
    land();
    await settle();

    expect(visibleFor()).toEqual([
      ["return", 0],
      ["away", undefined],
      ["return", 4_000],
    ]);
  });

  it("measures each try again, so a retried return still dates itself", async () => {
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    mount();
    await settle();
    clock += 30_000;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(visibleFor()).toEqual([
      ["return", 0],
      ["return", 30_000],
    ]);
  });

  it("after a reload, counts the return that closes the old away from the section on screen", async () => {
    const first = mount();
    await settle();
    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    first.unmount();

    resetAttentionReports();
    report.mockClear();
    clock = 3_000;
    setVisibility("visible");
    const page = mount({ sessionId: null });
    await settle();
    clock = 12_000;
    page.rerender({ on: true, sessionId: SESSION, segmentId: SEG_A });
    await settle();

    expect(visibleFor()).toEqual([["return", 9_000]]);
  });

  it("measures nothing for a return the last page queued", async () => {
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    const first = mount();
    await settle();
    first.unmount();

    resetAttentionReports();
    report.mockClear().mockResolvedValue({});
    mount();
    await settle();

    expect(visibleFor()).toEqual([
      ["return", undefined],
      ["return", 0],
    ]);
  });

  it("measures nothing past ten hours", async () => {
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    mount();
    await settle();
    clock += 36_000_001;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(visibleFor().at(-1)).toEqual(["return", undefined]);
  });
});

/*
 * THE SITTING ENDS HERE (Teslim, 9 Nov; case 11 of the 9 Nov run). "Leave
 * for now" ends the sitting, and the page then sent one more event for it,
 * answered 404 `active_session_not_found`. Once the player has ended the
 * sitting, nothing more goes for it.
 */
describe("when the player ends the sitting", () => {
  const pause = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

  it("sends nothing more for it: no away as the lesson goes, no return", async () => {
    const { result, unmount } = mount();
    await settle();

    act(() => result.current());
    setVisibility("hidden");
    setVisibility("visible");
    unmount();
    await pause();

    expect(sent()).toEqual([["return", SEG_A]]);
  });

  it("drops what had not gone yet, and clears it from the shelf", async () => {
    vi.useFakeTimers();
    report.mockRejectedValueOnce(new ApiError(0, "offline"));
    const { result } = mount();
    await settle();
    expect(window.localStorage.getItem("nevo.attention.v1.stu-1")).not.toBeNull();

    act(() => result.current());
    window.dispatchEvent(new Event("online"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(report).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("nevo.attention.v1.stu-1")).toBeNull();
  });

  it("leaves a sitting this page opens again to report afresh", async () => {
    const first = mount();
    await settle();
    act(() => first.result.current());
    first.unmount();
    await pause();

    mount();
    await settle();

    expect(sent()).toEqual([
      ["return", SEG_A],
      ["return", SEG_A],
    ]);
  });
});
