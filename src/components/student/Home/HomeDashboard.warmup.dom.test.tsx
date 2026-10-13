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
  dashboard.useStudentDashboard.mockReset();
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearSession();
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
