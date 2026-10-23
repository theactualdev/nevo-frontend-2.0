import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import type { WarmUpPrompt } from "@/hooks/useWarmUpDimension";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * NOT KNOWING IS NOT PERMISSION (19 Oct browser-storage audit; rule 5).
 *
 * The warm-up captured from the moment its task appeared, and a consent read
 * that failed came back "not withdrawn" - so a device that could not say
 * whether it was allowed kept a child's taps as though it had been told yes.
 * The task now waits for an answer, and without one there is no task: the
 * loading state while it is asked, the nothing-state when it cannot be had.
 * Both keep the way Home, so no child is left on the screen.
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

const attention: WarmUpPrompt = {
  state: "ready",
  dimension: "attention",
  live: true,
  item: null,
};
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => attention,
}));
vi.mock("@/hooks/useRosterBand", () => ({
  useRosterBand: () => ({ band: null, settled: true }),
}));

const consent = vi.hoisted(() => ({
  withdrawn: false,
  known: false,
  unreadable: false,
}));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ ...consent }),
}));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const settle = async (ms = 1000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const task = () => screen.queryByRole("button", { name: "Right" });
const asking = () => screen.queryByText("Getting your warm-up ready");

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  submit.mockResolvedValue(true);
  answerPrompt.mockReset();
  deviceTaskDone.mockReset();
  deviceTaskDone.mockResolvedValue(true);
  holdBaseline.mockReset();
  push.mockReset();
  Object.assign(consent, { withdrawn: false, known: false, unreadable: false });
  window.localStorage.clear();
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
  clearSession();
});

describe("WarmUpRun — before consent has answered", () => {
  it("runs no task, and says it is getting one ready, with its way Home", () => {
    render(<WarmUpRun />);

    expect(task()).toBeNull();
    expect(asking()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });

  it("starts once the answer allows it, and sends the run it then captured", async () => {
    const { rerender } = render(<WarmUpRun />);
    expect(task()).toBeNull();

    consent.known = true;
    rerender(<WarmUpRun />);
    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    await settle();

    expect(submit).toHaveBeenCalledTimes(1);
    const [, trials, context] = submit.mock.calls[0];
    expect(trials).toEqual([
      expect.objectContaining({ dimension: "attention" }),
    ]);
    // The start was recorded once consent allowed it, so the run says what
    // it was sat on (B76).
    expect(context).toEqual({ formFactor: "desktop_cursor" });
  });
});

describe("WarmUpRun — when consent cannot be read", () => {
  it("runs no task: the nothing-state, and Home", async () => {
    consent.unreadable = true;
    render(<WarmUpRun />);
    await settle();

    expect(task()).toBeNull();
    expect(asking()).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(push).toHaveBeenCalledWith("/student/dashboard");
    expect(submit).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
  });

  it("takes away a task already running, and sends and keeps nothing of it", async () => {
    consent.known = true;
    const { rerender } = render(<WarmUpRun />);
    expect(task()).not.toBeNull();

    // Signed out under the run: nobody's consent to read any more.
    Object.assign(consent, { known: false, unreadable: true });
    rerender(<WarmUpRun />);
    await settle();

    expect(task()).toBeNull();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
  });
});
