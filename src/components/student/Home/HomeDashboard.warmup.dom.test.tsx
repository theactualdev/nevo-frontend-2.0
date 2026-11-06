import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HomeDashboard } from "./HomeDashboard";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A WARM-UP IS NOT CONDITIONAL ON THERE BEING WORK WAITING (D18, 1 Oct).
 *
 * The card sat inside the branch that renders lessons, so a child with
 * nothing queued - or whose lessons read failed - never saw it, and its run
 * then led into "today's lesson" that did not exist. Design: "The warm-up
 * shows whether or not lessons are queued."
 */

const dashboard = vi.hoisted(() => ({ useStudentDashboard: vi.fn() }));
vi.mock("@/hooks/useStudentDashboard", () => dashboard);
// Today's warm-up as the engine names it: a task, so Home offers it. The card
// is offered only for a run that can happen (Lydia, 4 Nov), and a read that
// fails offers none - tested in `HomeDashboard.warmup.dom.test.tsx`.
const warmUp = vi.hoisted(() => ({ prompt: vi.fn() }));
vi.mock("@/lib/api/baseline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/baseline")>();
  return {
    ...actual,
    baselineApi: { ...actual.baselineApi, recalibratePrompt: warmUp.prompt },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  // The warm-up prompt and the rest read the network; failing fast keeps them
  // in their catch instead of pending.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));
  warmUp.prompt.mockReset().mockResolvedValue({ dimension: "wmc" });
  dashboard.useStudentDashboard.mockReset();
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearSession();
});

/*
 * OFFERED ONLY FOR A RUN THAT CAN HAPPEN (Lydia, 4 Nov: "the product
 * asserting a state that is not true ... is worse than any missing feature";
 * audit, 2 Nov, backlog 7). "Begin warm-up" led to a screen with only Home on
 * it on a day the engine named nothing, on a motor day on a desktop, and when
 * the prompt could not be read.
 */
describe("the warm-up card, when no run can happen", () => {
  const home = async () => {
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: { student: {}, assignments: [], recentProgress: [] },
      failed: false,
      loading: false,
    });
    render(<HomeDashboard />);
    await screen.findByText(/first lesson/i);
    // The prompt's answer, and anything it set off.
    await new Promise((r) => setTimeout(r, 0));
  };

  it.each([
    ["the prompt could not be read", () => warmUp.prompt.mockRejectedValue(new Error("offline"))],
    ["the engine named no task", () => warmUp.prompt.mockResolvedValue({ dimension: null })],
    [
      "it is a motor day on a device that cannot run the step",
      () => warmUp.prompt.mockResolvedValue({ dimension: "motor_speed", motorTask: { sampleCount: 8 } }),
    ],
  ])("is not offered when %s", async (_, given) => {
    given();
    await home();

    expect(screen.queryByText(/A quick warm-up to begin/i)).toBeNull();
    expect(screen.queryByRole("link", { name: "Begin warm-up" })).toBeNull();
  });

  it("still says a done day is done, whatever the prompt", async () => {
    warmUp.prompt.mockResolvedValue({ dimension: null, doneToday: true });
    await home();

    expect(await screen.findByText("Today's warm-up is done.")).toBeInTheDocument();
  });
});

describe("the warm-up card on Home", () => {
  it("shows for a child with no lessons at all", async () => {
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: { student: {}, assignments: [], recentProgress: [] },
      failed: false,
      loading: false,
    });

    render(<HomeDashboard />);

    expect(
      await screen.findByText("Your teacher is setting up your first lesson"),
    ).toBeInTheDocument();
    expect(screen.getByText(/A quick warm-up to begin/i)).toBeInTheDocument();
  });

  it("shows when the lessons could not be read", async () => {
    // The warm-up has its own read; a failed lessons read says nothing about it.
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: true,
      loading: false,
    });

    render(<HomeDashboard />);

    await waitFor(() =>
      expect(
        screen.getByText(/We couldn.t load your lessons just now/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/A quick warm-up to begin/i)).toBeInTheDocument();
  });
});
