import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilingFlow } from "./ProfilingFlow";
import { BaselineCapture } from "@/lib/profiling/capture";
import catalogue from "@/lib/api/signals.catalogue.json";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";

/**
 * What the end of the baseline does with what it measured.
 *
 * Two defects, both at the moment the run finishes:
 *
 *  - An SSO child's vector was parked with no owner. Only the run's own PIN
 *    step can claim an ownerless vector, and an SSO child skips it, so their
 *    baseline sat on the device until it expired. It is parked under their id
 *    now, which is what lets it be delivered.
 *  - A withdrawn guardian's run purged once and kept recording. The capture is
 *    STOPPED now, and nothing is parked.
 *
 * The three modules and the pauses are stubbed: this is about the flow's
 * ends, not about any one activity.
 */

const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

const consent = vi.hoisted(() => ({ withdrawn: false }));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: consent.withdrawn, known: true }),
}));

/**
 * A screen reduced to one button that moves the flow on. A module records one
 * answer on the way, as the real ones do, so there is a run to park.
 */
const { next } = vi.hoisted(() => ({
  next: (label: string) =>
    function Stub({
      onComplete,
      onDone,
      capture,
    }: {
      onComplete?: () => void;
      onDone?: () => void;
      capture?: BaselineCapture;
    }) {
      return (
        <button
          type="button"
          onClick={() => {
            capture?.record("trial_pick", {
              module: label,
              act: "pattern",
              choice: 0,
              rtMs: 500,
              pair: "same",
              correct: true,
            });
            (onComplete ?? onDone)?.();
          }}
        >
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
vi.mock("./StretchInterstitial", () => ({
  StretchInterstitial: next("pause"),
}));

/** Every screen from the intro to the completion. */
function sitTheWholeRun() {
  fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
  for (const step of ["m1", "pause", "m2", "pause", "m3"]) {
    fireEvent.click(screen.getByRole("button", { name: step }));
  }
}

beforeEach(() => {
  holdBaseline.mockReset();
  consent.withdrawn = false;
  clearOnboardingDraft();
  mergeOnboardingDraft({ name: "Amara", age: 9 });
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
  vi.restoreAllMocks();
});

describe("ProfilingFlow — whose baseline it is", () => {
  it("parks an SSO child's vector under their own id", () => {
    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-sso" />);

    sitTheWholeRun();

    expect(holdBaseline).toHaveBeenCalledTimes(1);
    expect(holdBaseline.mock.calls[0][2]).toBe("child-sso");
  });

  it("parks everyone else's for the account the run goes on to create", () => {
    // No owner yet: the PIN step proves the vector by this run's id.
    render(<ProfilingFlow onDone={vi.fn()} />);

    sitTheWholeRun();

    expect(holdBaseline.mock.calls[0][2]).toBeNull();
  });

  it("hands back the run it parked, so the flush can prove it", () => {
    const onDone = vi.fn();
    render(<ProfilingFlow onDone={onDone} ownerUserId="child-sso" />);
    sitTheWholeRun();

    fireEvent.click(screen.getByRole("button", { name: /first lesson/i }));

    expect(onDone).toHaveBeenCalledWith(holdBaseline.mock.calls[0][0]);
  });
});

describe("ProfilingFlow — what it parks (B9)", () => {
  it("parks the trials as they happened, with nothing reduced", () => {
    // It parked a feature vector: a mean response time, an accuracy and a
    // longest span per module, computed here. Now one trial per answer.
    render(<ProfilingFlow onDone={vi.fn()} />);

    sitTheWholeRun();

    const trials = holdBaseline.mock.calls[0][1];
    expect(trials).toHaveLength(3);
    for (const trial of trials) {
      expect(Object.keys(trial).sort()).toEqual([
        "condition",
        "correct",
        "dimension",
        "probeItemId",
        "response",
        "responseTimeMs",
      ]);
    }
    expect(JSON.stringify(trials)).not.toMatch(/mean|accuracy|span|module/i);
  });

  it("parks them under the id it was given, the profiling stream's", () => {
    // So the trials and the run's markers name the same session.
    const onDone = vi.fn();
    render(<ProfilingFlow onDone={onDone} runId="profiling-session-1" />);
    sitTheWholeRun();

    fireEvent.click(screen.getByRole("button", { name: /first lesson/i }));

    expect(holdBaseline.mock.calls[0][0]).toBe("profiling-session-1");
    expect(onDone).toHaveBeenCalledWith("profiling-session-1");
  });
});

describe("ProfilingFlow — what it tells the signal stream", () => {
  it("does not say the baseline was submitted when it has only been parked", () => {
    /*
     * It tracked `baseline_submitted` right here, on parking, and since 1 Oct
     * that event reaches the engine - true only if the later submit landed.
     * The deliverer tracks it now, once the submit has succeeded.
     */
    const track = vi.fn();
    render(<ProfilingFlow onDone={vi.fn()} track={track} />);

    sitTheWholeRun();

    expect(holdBaseline).toHaveBeenCalledTimes(1);
    expect(track.mock.calls.map(([type]) => type)).not.toContain(
      "baseline_submitted",
    );
  });

  it("still marks each module's start and end", () => {
    const track = vi.fn();
    render(<ProfilingFlow onDone={vi.fn()} track={track} />);

    sitTheWholeRun();

    const types = track.mock.calls.map(([type]) => type);
    expect(types.filter((t) => t === "baseline_module_start")).toHaveLength(3);
    expect(types.filter((t) => t === "baseline_module_complete")).toHaveLength(
      3,
    );
  });

  it("marks them with exactly the catalogue's keys", () => {
    // The catalogue declares `moduleId` for both. They sent `module`, and the
    // start an undeclared `band`, which goes beside the trials now (B76).
    const track = vi.fn();
    render(<ProfilingFlow onDone={vi.fn()} track={track} />);

    sitTheWholeRun();

    const declared = (type: string) =>
      [...(catalogue.find((e) => e.eventType === type)?.payload ?? [])].sort();
    const marks = track.mock.calls.filter(([type]) =>
      String(type).startsWith("baseline_module_"),
    );
    expect(marks).toHaveLength(6);
    for (const [type, payload] of marks) {
      expect(Object.keys(payload).sort()).toEqual(declared(type));
    }
    expect(
      marks
        .filter(([type]) => type === "baseline_module_start")
        .map(([, payload]) => payload.moduleId),
    ).toEqual(["grid_span", "pattern_flanker", "sentence_dot"]);
  });
});

describe("ProfilingFlow — the domain probe has nothing to ask (SCRUM-175/176)", () => {
  /*
   * It asked questions from a bank on this device and marked them against a
   * key on this device. Backend owns the probe bank now, and nothing can
   * serve this run from it: the child has no account yet, and no subject id.
   * So the module is not presented, rather than mimed.
   */
  it("goes from Module 3 straight to the end, with no pause and no probe", () => {
    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
    for (const step of ["m1", "pause", "m2", "pause"]) {
      fireEvent.click(screen.getByRole("button", { name: step }));
    }

    fireEvent.click(screen.getByRole("button", { name: "m3" }));

    expect(screen.queryByRole("button", { name: "pause" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /first lesson/i }),
    ).toBeInTheDocument();
    expect(holdBaseline).toHaveBeenCalledTimes(1);
  });

  it("maps the three modules it presents, and fills all three at the end (design, 9 Oct)", () => {
    // "A child who will do three sees three segments." It was four whatever
    // the run held, the fourth filling at the end for a module never shown.
    render(<ProfilingFlow onDone={vi.fn()} />);
    const map = () => screen.getByRole("progressbar");

    expect(map()).toHaveAttribute("aria-valuemax", "3");
    expect(map().lastElementChild!.children).toHaveLength(3);

    sitTheWholeRun();

    expect(map()).toHaveAttribute("aria-valuemax", "3");
    expect(map()).toHaveAttribute("aria-valuenow", "3");
  });

  it("marks no start or end for a module it never presented", () => {
    const track = vi.fn();
    render(<ProfilingFlow onDone={vi.fn()} track={track} />);

    sitTheWholeRun();

    expect(JSON.stringify(track.mock.calls)).not.toMatch(/domain_probe/);
  });
});

describe("ProfilingFlow — a withdrawn guardian", () => {
  it("stops the capture rather than only emptying it", () => {
    consent.withdrawn = true;
    const stop = vi.spyOn(BaselineCapture.prototype, "stop");
    const purge = vi.spyOn(BaselineCapture.prototype, "purge");

    render(<ProfilingFlow onDone={vi.fn()} />);

    expect(stop).toHaveBeenCalled();
    // `stop` purges as part of it; a bare purge alone is the old behaviour.
    expect(purge.mock.calls.length).toBe(stop.mock.calls.length);
  });

  it("parks nothing at the end", () => {
    consent.withdrawn = true;
    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-sso" />);

    sitTheWholeRun();

    expect(holdBaseline).not.toHaveBeenCalled();
  });
});
