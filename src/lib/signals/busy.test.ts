import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUSY_REASON } from "@/lib/constants";
import { openBusyWindow } from "./busy";

/**
 * A wait the system owns, as the catalogue takes it: one `system_busy`,
 * `{ reason, durationMs }`, sent as the wait ends. It went up as a start and an
 * end, each `{ reason, phase }` - two events, a key the catalogue does not
 * declare, and no length on either.
 */

let now = 0;
beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a busy window", () => {
  it("sends nothing while it is open", () => {
    const track = vi.fn();

    openBusyWindow(track, BUSY_REASON.TRANSITION_SCREEN);

    expect(track).not.toHaveBeenCalled();
  });

  it("goes up once, as it closes, with how long it ran", () => {
    const track = vi.fn();
    now = 1_000;
    const close = openBusyWindow(track, BUSY_REASON.TRANSITION_SCREEN);

    now = 2_600;
    close();

    expect(track.mock.calls).toEqual([
      ["system_busy", { reason: "transition_screen", durationMs: 1_600 }],
    ]);
  });

  it("is timed on the monotonic clock, not the wall clock", () => {
    // Rule 4. A tablet correcting its clock mid-wait moves Date.now(), and the
    // length this sends would move with it.
    const track = vi.fn();
    const close = openBusyWindow(track, BUSY_REASON.AUTH_PENDING);
    vi.spyOn(Date, "now").mockReturnValue(10_000_000);

    now = 250;
    close();

    expect(track.mock.calls[0][1]).toEqual({
      reason: "auth_pending",
      durationMs: 250,
    });
  });

  it("goes up once however many times it is closed", () => {
    // An effect's cleanup and an unmount can both reach the same close.
    const track = vi.fn();
    const close = openBusyWindow(track, BUSY_REASON.CONTENT_LOADING);

    close();
    close();

    expect(track).toHaveBeenCalledTimes(1);
  });

  it("is quiet when there is nowhere to send it", () => {
    const close = openBusyWindow(undefined, BUSY_REASON.CONTENT_LOADING);

    expect(() => close()).not.toThrow();
  });
});
