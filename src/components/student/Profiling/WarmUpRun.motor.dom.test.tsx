import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import type { WarmUpPrompt } from "@/hooks/useWarmUpDimension";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THE MOTOR-SPEED WARM-UP DAY (Teslim, ed123cb; Hub, 29 Oct, provisional
 * pending Lydia).
 *
 * "On a motor_speed warm-up day, the read returns motorTask: {sampleCount: 8,
 * practiceCount: 2}. Send the eight timings as motorSamplesMs with formFactor
 * to the warm-up response route; the server stores the median of the six
 * scored taps." It runs as onboarding's motor step (08a), full-screen with no
 * warm-up header, so the reach timed is onboarding's. A step ended early, or
 * a cursor device, goes as skipped - the route's own word.
 */

const { submit, answerPrompt, deviceTaskDone, motorTaskDone } = vi.hoisted(() => ({
  submit: vi.fn(),
  answerPrompt: vi.fn(),
  deviceTaskDone: vi.fn(),
  motorTaskDone: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  baselineApi: { submitTrials: submit, answerPrompt, deviceTaskDone, motorTaskDone },
}));
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

const engine = vi.hoisted(() => ({
  prompt: { state: "waiting" } as WarmUpPrompt,
}));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => engine.prompt,
}));
vi.mock("@/hooks/useRosterBand", () => ({
  useRosterBand: () => ({ band: null, settled: true }),
}));
const consent = vi.hoisted(() => ({ withdrawn: false, known: true }));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: consent.withdrawn, known: consent.known }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let now = 0;
let frames: (FrameRequestCallback | null)[] = [];
/** Run the frame that paints the target. */
const paint = () =>
  act(() => {
    const due = frames;
    frames = [];
    due.forEach((cb) => cb?.(now));
  });
const target = () => screen.queryByTestId("motor-target");
/** Paint the target, wait `ms`, tap it. */
const tapAfter = (ms: number) => {
  paint();
  now += ms;
  fireEvent.pointerDown(target()!);
};

/** A phone or tablet: the primary pointer is a finger. */
const onTouch = (touch: boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: touch && query.includes("pointer: coarse"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );

const MOTOR_DAY: WarmUpPrompt = { state: "motor", sampleCount: 8, doneToday: false };

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
  for (const fn of [submit, answerPrompt, deviceTaskDone, motorTaskDone]) {
    fn.mockReset();
    fn.mockResolvedValue(true);
  }
  holdBaseline.mockReset();
  consent.withdrawn = false;
  consent.known = true;
  engine.prompt = MOTOR_DAY;
  window.localStorage.clear();
  clearSession();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "child-1",
    role: "student",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSession();
});

describe("a motor-speed warm-up day, on a touch device", () => {
  it("is onboarding's motor step, full-screen, with no warm-up header over it", async () => {
    onTouch(true);
    render(<WarmUpRun />);

    await waitFor(() => expect(screen.getByTestId("motor-ground")).toBeInTheDocument());
    expect(screen.getByText("Tap the square each time you see it.")).toBeInTheDocument();
    expect(screen.queryByText("DAILY WARM-UP")).toBeNull();
  });

  it("sends the eight timings in order, with the device, to the prompt's route - and nothing to /trials", async () => {
    onTouch(true);
    render(<WarmUpRun />);
    await waitFor(() => expect(screen.getByTestId("motor-ground")).toBeInTheDocument());

    const waits = [700, 650, 520, 480, 510, 495, 530, 505];
    for (const ms of waits) tapAfter(ms);

    await waitFor(() => expect(motorTaskDone).toHaveBeenCalledTimes(1));
    expect(motorTaskDone).toHaveBeenCalledWith("child-1", {
      motorSamplesMs: waits,
      formFactor: "tablet_touch",
    });
    expect(submit).not.toHaveBeenCalled();
    expect(deviceTaskDone).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
    // Then the warm-up's own done state.
    expect(await screen.findByText("That's it for today")).toBeInTheDocument();
  });

  it("says it did not save when the route never took it (D126)", async () => {
    onTouch(true);
    motorTaskDone.mockResolvedValue(false);
    render(<WarmUpRun />);
    await waitFor(() => expect(screen.getByTestId("motor-ground")).toBeInTheDocument());
    for (let i = 0; i < 8; i++) tapAfter(500);

    expect(await screen.findByText(/Today's warm-up didn't save/)).toBeInTheDocument();
  });

  it("goes as skipped when a target was left untapped and the step ended early, then the done state", async () => {
    onTouch(true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<WarmUpRun />);
    await act(async () => {});
    expect(screen.getByTestId("motor-ground")).toBeInTheDocument();

    tapAfter(600);
    tapAfter(600);
    paint();
    // 08a: ten seconds on a painted target ends the step.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await act(async () => {});

    expect(motorTaskDone).toHaveBeenCalledWith("child-1", { motorStepSkipped: true });
    expect(screen.getByText("That's it for today")).toBeInTheDocument();
  });

  it("sends nothing for a withdrawn guardian's child, who still finishes on the done state", async () => {
    // As every warm-up task does: the capture is stopped, nothing goes up.
    onTouch(true);
    consent.withdrawn = true;
    render(<WarmUpRun />);
    await waitFor(() => expect(screen.getByTestId("motor-ground")).toBeInTheDocument());
    for (let i = 0; i < 8; i++) tapAfter(500);

    expect(await screen.findByText("That's it for today")).toBeInTheDocument();
    expect(motorTaskDone).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("a motor-speed warm-up day, on a cursor device", () => {
  it("does not run the step (08a: a click is not a reach): the nothing-state, and the day sent as skipped", async () => {
    onTouch(false);
    render(<WarmUpRun />);

    await waitFor(() =>
      expect(motorTaskDone).toHaveBeenCalledWith("child-1", { motorStepSkipped: true }),
    );
    expect(motorTaskDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("motor-ground")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Home"]);
    expect(submit).not.toHaveBeenCalled();
  });
});
