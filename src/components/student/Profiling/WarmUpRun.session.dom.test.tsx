import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A WARM-UP GOES AS THE CHILD WHO SAT IT, OR NOT AT ALL (19 Oct
 * browser-storage audit).
 *
 * A session lapsed mid-task, and nothing noticed until the child answered:
 * the finish sent the trials with no Authorization at all, took the refusal
 * as a failed write, and parked them with no owner - after the sign-out's
 * clean-up had run, so they sat on the device for a week, claimable by
 * nobody. Now the finish asks first. Not the child the run was started for,
 * or no token: nothing is sent, nothing is parked, the raw stream goes, and
 * nothing claims the warm-up was done. The shell's lapse watch takes the
 * child to the session-ended door.
 */

const { submit, answerPrompt, deviceTaskDone } = vi.hoisted(() => ({
  submit: vi.fn(),
  answerPrompt: vi.fn(),
  deviceTaskDone: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  baselineApi: { submitTrials: submit, answerPrompt, deviceTaskDone },
}));
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => ({
    state: "ready",
    dimension: "attention",
    live: true,
    item: null,
  }),
}));
vi.mock("@/hooks/useRosterBand", () => ({
  useRosterBand: () => ({ band: null, settled: true }),
}));
// Consent has answered and allows the run: what is under test is whose it is.
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: false, known: true, unreadable: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const signInAs = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });
const answer = () =>
  fireEvent.click(screen.getByRole("button", { name: "Right" }));
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of [submit, answerPrompt, deviceTaskDone, holdBaseline]) {
    fn.mockReset();
  }
  submit.mockResolvedValue(true);
  deviceTaskDone.mockResolvedValue(true);
  window.localStorage.clear();
  signInAs("child-1");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearSession();
});

describe("WarmUpRun — the child who sat it, at the finish", () => {
  it("sends the run as that child while they are still signed in", async () => {
    render(<WarmUpRun />);

    answer();
    await settle();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(deviceTaskDone).toHaveBeenCalledWith("child-1");
  });

  it("sends and parks nothing when their session ended mid-task", async () => {
    render(<WarmUpRun />);

    // The session lapses, or a 401 elsewhere ends it, before they answer.
    clearSession();
    answer();
    await settle();

    expect(submit).not.toHaveBeenCalled();
    expect(deviceTaskDone).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
    // Nor is the warm-up claimed done, for them or anyone.
    expect(screen.queryByText("That's it for today")).toBeNull();
    expect(window.localStorage.getItem("nevo.warmup.done")).toBeNull();
  });

  it("sends nothing as the next child when another signs in over them", async () => {
    render(<WarmUpRun />);

    signInAs("child-2");
    answer();
    await settle();

    expect(submit).not.toHaveBeenCalled();
    expect(deviceTaskDone).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
  });
});
