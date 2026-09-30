import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { BreakScreen } from "./BreakScreen";
import { BREAK_TYPES } from "@/lib/constants";

/**
 * A break's length is sent to the engine as `break_end`, so rule 4 applies: the
 * monotonic clock, never the wall clock. A tablet correcting its clock during a
 * break sent a negative duration.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("how long a break is reported to have taken", () => {
  it("is the monotonic time, whatever the wall clock did", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let mono = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => mono);
    const wall = vi.spyOn(Date, "now").mockReturnValue(9_000_000);
    const onEnd = vi.fn();

    render(
      <BreakScreen type={BREAK_TYPES.MICRO} onDone={() => {}} onEnd={onEnd} />,
    );
    // The micro break hands back by itself; the wall clock jumps back first.
    mono = 9_000;
    wall.mockReturnValue(1_000);
    act(() => void vi.advanceTimersByTime(8_000));

    expect(onEnd).toHaveBeenCalledWith(8_000);
  });
});
