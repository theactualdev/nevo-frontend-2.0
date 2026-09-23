import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markWarmUpDone, warmUpDoneToday } from "./warmUpDone";

/**
 * A note that an activity happened, on a device up to six children share.
 *
 * The two properties that matter are both about not getting the WRONG child:
 * a flag keyed to the device alone would tell the second child of the morning
 * they had already done a warm-up they have never seen, and a flag that never
 * expired would tell every child it was done for ever.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("remembering one child's day", () => {
  it("is not done until it is", () => {
    expect(warmUpDoneToday("child-1")).toBe(false);
  });

  it("is done once marked", () => {
    markWarmUpDone("child-1");

    expect(warmUpDoneToday("child-1")).toBe(true);
  });

  it("survives a reload, which is the whole point", () => {
    // The run is re-sittable precisely because nothing outlived the page.
    markWarmUpDone("child-1");

    expect(window.localStorage.getItem("nevo.warmup.done")).toContain(
      "child-1",
    );
    expect(warmUpDoneToday("child-1")).toBe(true);
  });
});

describe("a tablet six children share", () => {
  it("does not answer for a child who has not done it", () => {
    /*
     * THE DECISIVE ONE. A device-wide flag would tell the second child of the
     * morning that they had already done a warm-up they have never seen - and
     * the warm-up is the one thing on the dashboard addressed to them.
     */
    markWarmUpDone("child-1");

    expect(warmUpDoneToday("child-2")).toBe(false);
  });

  it("keeps the others when one more finishes", () => {
    markWarmUpDone("child-1");
    markWarmUpDone("child-2");

    expect(warmUpDoneToday("child-1")).toBe(true);
    expect(warmUpDoneToday("child-2")).toBe(true);
  });
});

describe("tomorrow", () => {
  it("is a new warm-up", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T09:00:00"));
    markWarmUpDone("child-1");
    expect(warmUpDoneToday("child-1")).toBe(true);

    vi.setSystemTime(new Date("2026-09-24T07:30:00"));

    expect(warmUpDoneToday("child-1")).toBe(false);
  });

  it("is still the same day late in the evening", () => {
    // The day a child means is the local calendar one, not 24 hours elapsed.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T08:05:00"));
    markWarmUpDone("child-1");

    vi.setSystemTime(new Date("2026-09-23T23:55:00"));

    expect(warmUpDoneToday("child-1")).toBe(true);
  });

  it("prunes yesterday's children rather than accumulating them", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T09:00:00"));
    markWarmUpDone("child-1");
    markWarmUpDone("child-2");

    vi.setSystemTime(new Date("2026-09-24T09:00:00"));
    markWarmUpDone("child-3");

    const raw = window.localStorage.getItem("nevo.warmup.done") ?? "";

    expect(raw).toContain("child-3");
    expect(raw).not.toContain("child-1");
    expect(raw).not.toContain("child-2");
  });
});

describe("when there is nobody to remember", () => {
  it("answers false for a visitor with no session", () => {
    // The designed walkthrough. Nothing is stored and nothing is claimed.
    expect(warmUpDoneToday(null)).toBe(false);
    expect(warmUpDoneToday(undefined)).toBe(false);

    markWarmUpDone(null);

    expect(window.localStorage.getItem("nevo.warmup.done")).toBeNull();
  });
});

describe("when the device will not remember", () => {
  it("offers the warm-up rather than locking a child out", () => {
    /*
     * Private mode, blocked storage, a corrupt value. The failure has to fall
     * on the side of a child being able to do their warm-up twice, never on
     * the side of being told they already did one they did not.
     */
    window.localStorage.setItem("nevo.warmup.done", "{not json");

    expect(warmUpDoneToday("child-1")).toBe(false);
  });

  it("does not throw when writing is refused", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => markWarmUpDone("child-1")).not.toThrow();

    setItem.mockRestore();
  });
});
