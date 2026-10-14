import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * ASKING IS NOT THE SAME AS TOLD NOTHING (D169, 13 Oct).
 *
 * While the engine was asked what today's task is, the screen showed the
 * nothing-state, a lone Home button, which design said "reads as nothing
 * today" for the first few seconds. The wait now has its own state, the
 * working spinner and "Getting your warm-up ready".
 *
 * The risk in a loading state is the one that has bitten here before: a read
 * that fails being shown as still loading. So these run the REAL prompt and
 * roster hooks against a mocked API, and assert that each read's failure moves
 * the screen on rather than holding it.
 */

const api = vi.hoisted(() => ({
  recalibratePrompt: vi.fn(),
  myDashboard: vi.fn(),
  submitTrials: vi.fn(),
}));
vi.mock("@/lib/api/baseline", () => ({
  baselineApi: { recalibratePrompt: api.recalibratePrompt },
}));
vi.mock("@/lib/api", () => ({
  baselineApi: { submitTrials: api.submitTrials },
}));
vi.mock("@/lib/api/students", () => ({
  studentsApi: { myDashboard: api.myDashboard },
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline: vi.fn() }));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: false, known: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const LOADING = "Getting your warm-up ready";
const TASK = "Which way is the middle arrow pointing?";
const never = () => new Promise<never>(() => {});

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "child-1",
    role: "student",
  });

beforeEach(() => {
  api.recalibratePrompt.mockReset();
  api.myDashboard.mockReset();
  api.submitTrials.mockReset();
  api.submitTrials.mockResolvedValue(true);
  window.localStorage.clear();
  clearSession();
  signIn();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("WarmUpRun while the engine is asked", () => {
  it("says it is getting the warm-up ready, with the spinner in the badge's spot", () => {
    api.recalibratePrompt.mockReturnValue(never());
    api.myDashboard.mockReturnValue(never());
    render(<WarmUpRun />);

    const title = screen.getByRole("heading", { name: LOADING });
    const spot = title.parentElement!.previousElementSibling!;
    expect(spot).toBe(screen.getByTestId("warmup-loading-mark"));
    // The frame's `spinBadge`: the badge's size, a 4px ring.
    expect(spot.className).toMatch(/(^| )size-16( |$)/);
    expect(spot.className).toContain("sm:size-20");
    expect(spot.className).toMatch(/(^| )border-4( |$)/);
    expect(spot.className).toContain("motion-safe:animate-spin");
    // No task, and no header: the header heads a task.
    expect(screen.queryByText(TASK)).toBeNull();
    expect(screen.queryByText("DAILY WARM-UP")).toBeNull();
  });

  it("keeps the way Home under it, since a read that stalls has no timeout", () => {
    // The frame draws no button here. Held, as Q12 holds "Go on" while the
    // warm-up saves: nothing else leaves this full-screen route.
    api.recalibratePrompt.mockReturnValue(never());
    api.myDashboard.mockReturnValue(never());
    render(<WarmUpRun />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
  });

  it("holds while a named task waits on the band, then runs it", async () => {
    let answer!: (v: unknown) => void;
    api.recalibratePrompt.mockResolvedValue({ dimension: "attention" });
    api.myDashboard.mockReturnValue(new Promise((r) => (answer = r)));
    render(<WarmUpRun />);

    // The prompt has answered; the band has not.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(api.recalibratePrompt).toHaveBeenCalled();
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(TASK)).toBeNull();

    await act(async () => answer({ student: { id: "child-1", ageBand: null } }));

    expect(await screen.findByText(TASK)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).toBeNull();
  });
});

describe("WarmUpRun when a read fails", () => {
  it("moves to the nothing-state when the prompt read fails, never holding the spinner", async () => {
    api.recalibratePrompt.mockRejectedValue(new Error("503"));
    api.myDashboard.mockReturnValue(never());
    render(<WarmUpRun />);

    await waitFor(() => expect(screen.queryByText(LOADING)).toBeNull());
    expect(screen.queryByTestId("warmup-loading-mark")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByText(TASK)).toBeNull();
  });

  it("does not wait on the band when the engine names nothing", async () => {
    // The roster read is still out, but there is no task for it to size.
    api.recalibratePrompt.mockResolvedValue({});
    api.myDashboard.mockReturnValue(never());
    render(<WarmUpRun />);

    await waitFor(() => expect(screen.queryByText(LOADING)).toBeNull());
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
  });

  it("runs the named task when the roster read fails, rather than holding", async () => {
    api.recalibratePrompt.mockResolvedValue({ dimension: "attention" });
    api.myDashboard.mockRejectedValue(new Error("503"));
    render(<WarmUpRun />);

    expect(await screen.findByText(TASK)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).toBeNull();
  });
});
