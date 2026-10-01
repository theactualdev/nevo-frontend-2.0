import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilingFlow } from "./ProfilingFlow";
import { BaselineCapture } from "@/lib/profiling/capture";
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
 * The four modules and the pauses are stubbed: this is about the flow's ends,
 * not about any one activity.
 */

const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

const consent = vi.hoisted(() => ({ withdrawn: false }));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: consent.withdrawn, known: true }),
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

/** Every screen from the intro to the completion. */
function sitTheWholeRun() {
  fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
  for (const step of ["m1", "pause", "m2", "pause", "m3", "pause", "m4"]) {
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
