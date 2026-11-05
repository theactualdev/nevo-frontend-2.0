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
  it("reports the first section once the sitting is known, and no time", async () => {
    const { rerender } = mount({ sessionId: null });
    await settle();
    expect(report).not.toHaveBeenCalled();

    rerender({ on: true, sessionId: SESSION, segmentId: SEG_A });
    await settle();

    expect(report).toHaveBeenCalledOnce();
    const [session, body, options] = report.mock.calls[0];
    expect(session).toBe(SESSION);
    // The server stamps the transition: nothing here is a time.
    expect(Object.keys(body as object).sort()).toEqual([
      "action",
      "clientEventId",
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
    expect(report.mock.calls[1][1]).toEqual(report.mock.calls[0][1]);
  });

  it("sends at once when the device is back online", async () => {
    report.mockRejectedValueOnce(new ApiError(503, "unavailable"));
    mount();
    await settle();

    window.dispatchEvent(new Event("online"));
    await settle();

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1][1]).toEqual(report.mock.calls[0][1]);
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
 * AN ABSENCE WHOSE AWAY COULD NOT GO AS IT HAPPENED (Teslim, e5a0544; the
 * Hub, 4 Nov; case 13 of the device tests). Its return carries the length,
 * measured here with `performance.now()`; nothing else from the device clock,
 * and nothing for an away that went live.
 */
describe("the length of an absence the server could not stamp", () => {
  let clock = 0;
  beforeEach(() => {
    clock = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  const bodies = () =>
    report.mock.calls.map(([, r]) => r as Record<string, unknown>);

  it("sends none for an away that went as it happened", async () => {
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
    expect(bodies().every((b) => !("clientAwayDurationMs" in b))).toBe(true);
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

  it("starts each absence afresh: a later one that went live carries none", async () => {
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
    expect(returns.at(-1)).not.toHaveProperty("clientAwayDurationMs");
  });
});
