import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MOTOR_ORDER, MotorStep, motorStepRuns } from "./MotorStep";
import { BaselineCapture } from "@/lib/profiling/capture";
import type { AgeBand } from "@/lib/profiling/bands";

/**
 * 08a, the motor-speed step (SCRUM-214, design D12).
 *
 * Eight taps on one target at a time, so the engine can subtract how long the
 * physical reach takes from every timed activity after it. Without it a child
 * unfamiliar with touchscreens is measured as cognitively slow.
 *
 * Two things are easy to get wrong and both are pinned here: the sample must
 * start on the frame the target is PAINTED, or every measurement is
 * inflated; and nothing on the device may compute the baseline - the
 * practice taps travel flagged, not dropped, and no median is taken.
 */

let now = 0;
let frames: (FrameRequestCallback | null)[] = [];

/** Run the animation frame(s) waiting: the frame that paints the target. */
const paint = () =>
  act(() => {
    const due = frames;
    frames = [];
    due.forEach((cb) => cb?.(now));
  });

const target = () => screen.queryByTestId("motor-target");

const step = (
  band: AgeBand = "p46",
  capture = new BaselineCapture("run-1"),
  onComplete = vi.fn(),
) => {
  render(
    <MotorStep
      band={band}
      formFactor="tablet"
      capture={capture}
      onComplete={onComplete}
    />,
  );
  return { capture, onComplete };
};

/** Paint the target, wait `ms`, tap it. */
const tapAfter = (ms: number) => {
  paint();
  now += ms;
  fireEvent.pointerDown(target()!);
};

beforeEach(() => {
  now = 1000;
  frames = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = null;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the samples", () => {
  it("flags the first two taps as practice, and keeps all eight", () => {
    const { capture, onComplete } = step();

    for (let i = 0; i < 8; i++) tapAfter(400 + i);

    const taps = capture.ofKind("motor_tap").map((e) => e.payload);
    expect(taps).toHaveLength(8);
    expect(taps.map((t) => t?.practice)).toEqual([
      true, true, false, false, false, false, false, false,
    ]);
    // Every one carries the device it was taken on (D12).
    expect(taps.every((t) => t?.formFactor === "tablet")).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(capture.ofKind("motor_end")[0].payload).toEqual({
      reason: "complete",
      grid: 4,
      formFactor: "tablet",
    });
  });

  it("times from the painted frame, so the time before it is not counted", () => {
    const { capture } = step();

    // Rendered at 1000; the frame that paints it comes at 1016.
    now = 1016;
    paint();
    now = 1416;
    fireEvent.pointerDown(target()!);

    expect(capture.ofKind("motor_tap")[0].payload?.latencyMs).toBe(400);

    // The next target's clock starts at ITS frame, not at the tap before it.
    now = 1433;
    paint();
    now = 1733;
    fireEvent.pointerDown(target()!);

    expect(capture.ofKind("motor_tap")[1].payload?.latencyMs).toBe(300);
  });

  it("takes no tap on a target that has not been painted yet", () => {
    const { capture } = step();

    fireEvent.pointerDown(target()!);

    expect(capture.ofKind("motor_tap")).toHaveLength(0);
    expect(target()).toHaveAttribute("data-cell", "5");
  });

  it("uses the same eight cells, in the same order, for every child in a band", () => {
    for (const [band, n] of [
      ["p13", 3],
      ["p46", 4],
      ["ss", 5],
    ] as const) {
      const { capture } = step(band);
      for (let i = 0; i < 8; i++) tapAfter(500);
      expect(capture.ofKind("motor_tap").map((e) => e.payload?.cell)).toEqual(
        MOTOR_ORDER[n],
      );
      cleanup();
    }
  });

  it("computes nothing: no median, no mean, no count", () => {
    const { capture } = step();
    for (let i = 0; i < 8; i++) tapAfter(500);

    const kept = JSON.stringify(capture.stream);
    expect(kept).not.toMatch(/median|mean|baseline_ms|motorBaseline|average/i);
  });
});

describe("a miss", () => {
  it("leaves the target where it is and records nothing", () => {
    const { capture } = step();
    paint();

    // The ground, not the target.
    fireEvent.pointerDown(target()!.parentElement!);

    expect(target()).toHaveAttribute("data-cell", "5");
    expect(capture.ofKind("motor_tap")).toHaveLength(0);
  });
});

describe("a child who stops", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("ends the step quietly after ten seconds, with the samples it has", () => {
    const { capture, onComplete } = step();
    tapAfter(500);
    tapAfter(500);
    paint();

    // A miss is not a tap on the target: it does not hold the step open.
    fireEvent.pointerDown(target()!.parentElement!);
    act(() => vi.advanceTimersByTime(9_999));
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(capture.ofKind("motor_tap")).toHaveLength(2);
    expect(capture.ofKind("motor_end")[0].payload?.reason).toBe("idle");
    expect(target()).toBeNull();
  });

  it("counts the ten seconds from the target being painted", () => {
    const { onComplete } = step();

    // Nothing painted yet, so nothing has been waited for.
    act(() => vi.advanceTimersByTime(20_000));
    expect(onComplete).not.toHaveBeenCalled();

    paint();
    act(() => vi.advanceTimersByTime(10_000));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("starts the ten seconds again for each new target", () => {
    const { onComplete } = step();
    paint();
    act(() => vi.advanceTimersByTime(9_000));
    now += 9_000;
    fireEvent.pointerDown(target()!);
    paint();

    act(() => vi.advanceTimersByTime(9_000));
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("what the child sees", () => {
  it("is one line, a ground and a target: no count, timer, score or praise", () => {
    const { onComplete } = step();
    for (let i = 0; i < 3; i++) tapAfter(500);
    paint();

    expect(document.body.textContent).toBe(
      "Tap the square each time you see it.",
    );
    expect(document.body.textContent).not.toMatch(/\d|fast|quick|great|well done/i);
    for (const role of ["progressbar", "timer", "status", "button"]) {
      expect(screen.queryAllByRole(role)).toHaveLength(0);
    }

    // And nothing after: the end is a straight cut, no summary.
    for (let i = 3; i < 8; i++) tapAfter(500);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toBe(
      "Tap the square each time you see it.",
    );
  });

  it("does not move: no entry animation, nothing to reduce", () => {
    step();
    paint();

    expect(target()!.className).not.toMatch(/animate|transition|duration/);
  });
});

describe("Primary 1-3", () => {
  let spoken: { text: string; onend: (() => void) | null }[] = [];

  beforeEach(() => {
    spoken = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        rate = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      speak: (u: { text: string; onend: (() => void) | null }) =>
        spoken.push(u),
    });
  });

  it("hears the line once, reads nothing, and gets the target when the voice ends", () => {
    step("p13");

    expect(spoken.map((u) => u.text)).toEqual([
      "Touch the square each time you see it.",
    ]);
    expect(document.body.textContent).toBe("");
    expect(target()).toBeNull();

    act(() => spoken[0].onend?.());
    expect(target()).toHaveAttribute("data-cell", "4");
  });

  it("is never left waiting on a voice that does not finish", () => {
    step("p13");

    act(() => vi.advanceTimersByTime(8_000));

    expect(target()).not.toBeNull();
  });

  it("still reads nothing on a device that cannot speak, and gets the target at once", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    step("p13");

    expect(document.body.textContent).toBe("");
    expect(target()).not.toBeNull();
  });
});

describe("where it runs", () => {
  it("runs on touch, and not on a cursor device", () => {
    expect(motorStepRuns("mobile")).toBe(true);
    expect(motorStepRuns("tablet")).toBe(true);
    expect(motorStepRuns("desktop")).toBe(false);
  });
});
