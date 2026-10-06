import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilingFlow } from "./ProfilingFlow";
import type { BaselineCapture } from "@/lib/profiling/capture";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";

/**
 * Where the motor-speed step sits, and what it leaves in the trials (08a, D12).
 *
 * After the intro and before the first timed activity, on every path into
 * the baseline - so the engine can read every later timing against how long
 * the reach takes. Skipped on a cursor device, which 08a does not draw, with
 * no taps to send. And its taps leave as trials, one each, as taken (B9): the
 * median is the engine's, never the device's.
 */

const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: false, known: true }),
}));

/** A screen reduced to one button that moves the flow on. */
const { next } = vi.hoisted(() => ({
  next: (label: string) =>
    function Stub({
      onComplete,
      onDone,
    }: {
      onComplete?: () => void;
      onDone?: () => void;
    }) {
      return (
        <button type="button" onClick={() => (onComplete ?? onDone)?.()}>
          {label}
        </button>
      );
    },
}));
vi.mock("./GridSpanModule", () => ({ GridSpanModule: next("m1") }));
vi.mock("./PatternFlankerModule", () => ({
  PatternFlankerModule: next("m2"),
}));
vi.mock("./SentenceDotModule", () => ({ SentenceDotModule: next("m3") }));
vi.mock("./DomainProbeModule", () => ({ DomainProbeModule: next("m4") }));
vi.mock("./StretchInterstitial", () => ({
  StretchInterstitial: next("pause"),
}));

/*
 * The step itself is tested on its own (MotorStep.dom.test). Here it is a
 * button that records three taps - two of them practice - the way the real
 * one does, and ends.
 */
vi.mock("./MotorStep", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./MotorStep")>();
  return {
    ...actual,
    MotorStep: ({
      capture,
      formFactor,
      onComplete,
    }: {
      capture?: BaselineCapture;
      formFactor: string;
      onComplete: () => void;
    }) => (
      <button
        type="button"
        onClick={() => {
          [412.5, 388.25, 371].forEach((latencyMs, i) =>
            capture?.record("motor_tap", {
              target: i,
              cell: [5, 6, 12][i],
              latencyMs,
              practice: i < 2,
              formFactor,
            }),
          );
          capture?.record("motor_end", { reason: "complete", grid: 4, formFactor });
          onComplete();
        }}
      >
        motor
      </button>
    ),
  };
});

/** A phone or tablet: the primary pointer is a finger. */
const onTouch = () =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("pointer: coarse"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );

const letsGo = () =>
  fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

/** Everything from Module 1 to the completion. */
const sitTheModules = () => {
  for (const s of ["m1", "pause", "m2", "pause", "m3", "pause", "m4"]) press(s);
};

const motorTrials = () =>
  (holdBaseline.mock.calls[0][1] as Record<string, unknown>[]).filter(
    (t) => t.dimension === "motor_speed",
  );

beforeEach(() => {
  holdBaseline.mockReset();
  clearOnboardingDraft();
  mergeOnboardingDraft({ name: "Amara", age: 9 });
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
});

describe("on a touch device", () => {
  it("runs the intro, then the motor step, then Module 1", () => {
    onTouch();
    const track = vi.fn();
    render(<ProfilingFlow onDone={vi.fn()} track={track} />);

    letsGo();
    expect(screen.getByRole("button", { name: "motor" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "m1" })).toBeNull();
    // Module 1 has not started while the step runs, so it is not signalled.
    expect(track).not.toHaveBeenCalled();

    press("motor");
    expect(screen.getByRole("button", { name: "m1" })).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("baseline_module_start", {
      moduleId: "grid_span",
    });
  });

  it("parks every tap as taken, practice flagged, and no median", () => {
    onTouch();
    render(<ProfilingFlow onDone={vi.fn()} />);
    letsGo();
    press("motor");
    sitTheModules();

    const trial = (condition: string | null, response: string, ms: number) => ({
      dimension: "motor_speed",
      condition,
      response,
      correct: null,
      responseTimeMs: ms,
      probeItemId: null,
    });
    // Whole milliseconds, as the contract takes them.
    expect(motorTrials()).toEqual([
      trial("practice", "5", 413),
      trial("practice", "6", 388),
      trial(null, "12", 371),
    ]);
    // The median of the non-practice taps would be 371: it is nowhere.
    expect(JSON.stringify(holdBaseline.mock.calls[0][1])).not.toMatch(
      /median|motor_baseline|motorBaseline/i,
    );
  });
});

describe("on a cursor device", () => {
  it("goes from the intro straight to Module 1", () => {
    // jsdom's matchMedia matches nothing: no coarse pointer, so a cursor.
    render(<ProfilingFlow onDone={vi.fn()} />);

    letsGo();

    expect(screen.queryByRole("button", { name: "motor" })).toBeNull();
    expect(screen.getByRole("button", { name: "m1" })).toBeInTheDocument();
  });

  /*
   * The skip and its reason have no field on a trial; where they go is with
   * backend, beside the run's age band and form factor.
   */
  it("sends no motor trials", () => {
    render(<ProfilingFlow onDone={vi.fn()} />);
    letsGo();
    sitTheModules();

    expect(holdBaseline).toHaveBeenCalledTimes(1);
    expect(motorTrials()).toEqual([]);
  });
});
