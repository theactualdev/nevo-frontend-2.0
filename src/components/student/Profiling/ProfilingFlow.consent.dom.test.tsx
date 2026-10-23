import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilingFlow } from "./ProfilingFlow";
import { BaselineCapture } from "@/lib/profiling/capture";
import {
  clearOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * NOT KNOWING IS NOT PERMISSION (19 Oct browser-storage audit; rule 5).
 *
 * The baseline captured from its first tap - raw taps, and where they landed
 * - and stopped only on a withdrawal; a consent read that failed came back
 * "not withdrawn". So a device that could not say whether it was allowed
 * captured as though it had been told yes. The run now holds until consent
 * is known to allow it:
 *
 *  - a child with no account yet runs on 05 Entry's answer, the only consent
 *    read there is before the PIN step;
 *  - a signed-in child (SSO, finishing onboarding) on the consent gate's;
 *  - still asking, "Let's go" says "Nearly ready." (D211);
 *  - no answer to be had, the hold a door uses for it: the unchecked hold
 *    for a signed-in child (D69), 05 Entry for one with no account.
 */

const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

const consent = vi.hoisted(() => ({
  withdrawn: false,
  known: false,
  unreadable: false,
}));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ ...consent }),
}));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

// The band is ProfilingFlow.band's subject; here the roster gives none.
vi.mock("@/hooks/useRosterBand", () => ({
  useRosterBand: () => ({ band: null, settled: true }),
}));

/** A screen reduced to one button; a module records one answer on the way. */
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

const letsGo = () => screen.getByRole("button", { name: /let's go/i });
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
/** What the run parked at its end: its trials. */
const parked = () => holdBaseline.mock.calls[0]?.[1] as unknown[] | undefined;

beforeEach(() => {
  holdBaseline.mockReset();
  replace.mockReset();
  Object.assign(consent, { withdrawn: false, known: false, unreadable: false });
  clearOnboardingDraft();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
  clearSession();
});

describe("ProfilingFlow — a signed-in child (SSO, or finishing onboarding)", () => {
  beforeEach(() => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId: "child-1",
      role: "student",
    });
  });

  it("starts nothing while consent is still being asked", () => {
    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    fireEvent.click(letsGo());

    expect(screen.getByText("Nearly ready.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "m1" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("runs once consent answers, and parks what it captured from then", () => {
    const { rerender } = render(
      <ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />,
    );

    consent.known = true;
    rerender(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);
    fireEvent.click(letsGo());
    for (const step of ["m1", "pause", "m2", "pause", "m3"]) press(step);

    expect(parked()).toHaveLength(3);
  });

  it("goes to the unchecked hold when consent cannot be read, with the way back here", () => {
    consent.unreadable = true;

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    expect(replace).toHaveBeenCalledWith(
      `/student/unchecked?next=${encodeURIComponent(window.location.pathname)}`,
    );
    // And it does not start in the moment before it leaves.
    fireEvent.click(letsGo());
    expect(screen.queryByRole("button", { name: "m1" })).toBeNull();
  });

  it("lets go of what it captured when the answer is lost mid-run, and parks none of it", () => {
    consent.known = true;
    const { rerender } = render(
      <ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />,
    );
    fireEvent.click(letsGo());
    press("m1");

    Object.assign(consent, { known: false, unreadable: true });
    rerender(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);
    for (const step of ["pause", "m2", "pause", "m3"]) press(step);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(parked() ?? []).toEqual([]);
  });
});

describe("ProfilingFlow — a child with no account yet", () => {
  const matched = {
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
    name: "Amara",
  };

  it("runs on 05 Entry's answer, with no session to ask the gate with", () => {
    startOnboardingDraft({ ...matched, consent: "given" });
    consent.unreadable = true;

    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(letsGo());
    for (const step of ["m1", "pause", "m2", "pause", "m3"]) press(step);

    expect(replace).not.toHaveBeenCalled();
    expect(parked()).toHaveLength(3);
  });

  it("goes back to 05 Entry, where consent is read, when 05 gave no answer", () => {
    startOnboardingDraft(matched);
    consent.unreadable = true;

    render(<ProfilingFlow onDone={vi.fn()} />);

    expect(replace).toHaveBeenCalledWith("/student/onboarding/school");
    fireEvent.click(letsGo());
    expect(screen.queryByRole("button", { name: "m1" })).toBeNull();
  });

  it("still stops for good on a withdrawal the device reports", () => {
    startOnboardingDraft({ ...matched, consent: "given" });
    Object.assign(consent, { withdrawn: true, known: true });

    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(letsGo());
    for (const step of ["m1", "pause", "m2", "pause", "m3"]) press(step);

    expect(holdBaseline).not.toHaveBeenCalled();
  });
});
