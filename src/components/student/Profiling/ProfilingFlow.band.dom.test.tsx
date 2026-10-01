import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ProfilingFlow } from "./ProfilingFlow";
import type { GridSpanConfig } from "@/lib/profiling/bands";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THE ROSTER'S BAND, BEFORE ANY QUESTION (D13 and B5, 1 Oct).
 *
 * The intro asked "How old are you?" whenever onboarding had no age, on the
 * belief that nothing a signed-in child can read carries one. The dashboard's
 * `student.ageBand` now does - a closed set derived from the date of birth -
 * so a signed-in child with a band is never asked, and the question is left
 * for the case that really has none.
 *
 * The one thing that must not happen is reading it for the wrong child. Only
 * the SSO path is signed in during this run; anyone else's session on the
 * device may be the previous child's, so nothing is read for them.
 */

const { myDashboard } = vi.hoisted(() => ({ myDashboard: vi.fn() }));
vi.mock("@/lib/api/students", () => ({ studentsApi: { myDashboard } }));

// Tile memory reduced to the size it was handed.
vi.mock("./GridSpanModule", () => ({
  GridSpanModule: ({ config }: { config: GridSpanConfig }) => (
    <p>grid {config.n}</p>
  ),
}));

const signIn = (userId: string) =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });
const dashboardFor = (id: string, ageBand: string | null) => ({
  student: { id, firstName: "Ada", lastName: null, ageBand },
  assignments: [],
  recentProgress: [],
});
const letsGo = () => screen.getByRole("button", { name: /let's go/i });

beforeEach(() => {
  clearOnboardingDraft();
  clearSession();
  myDashboard.mockReset();
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
  clearSession();
});

describe("a signed-in child the roster has a band for", () => {
  it("is not asked their age", async () => {
    signIn("child-1");
    myDashboard.mockResolvedValue(dashboardFor("child-1", "senior_secondary"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    await waitFor(() => expect(letsGo()).not.toBeDisabled());
    expect(screen.queryByText(/how old are you/i)).toBeNull();
  });

  it("sits the band's own baseline", async () => {
    signIn("child-1");
    myDashboard.mockResolvedValue(dashboardFor("child-1", "senior_secondary"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);
    await waitFor(() => expect(letsGo()).not.toBeDisabled());
    fireEvent.click(letsGo());

    // SS is tile memory's 5x5 band.
    expect(screen.getByText("grid 5")).toBeInTheDocument();
  });

  it("is banded by the roster over a stale Step 1 age", async () => {
    signIn("child-1");
    mergeOnboardingDraft({ age: 7 });
    myDashboard.mockResolvedValue(dashboardFor("child-1", "junior_secondary"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);
    // Held until the roster answers, even with an age in hand.
    expect(letsGo()).toBeDisabled();
    await waitFor(() => expect(letsGo()).not.toBeDisabled());
    fireEvent.click(letsGo());

    // JSS, not the seven-year-old's 3x3.
    expect(screen.getByText("grid 5")).toBeInTheDocument();
  });
});

describe("before the roster answers", () => {
  it("neither asks nor starts", () => {
    signIn("child-1");
    myDashboard.mockReturnValue(new Promise(() => {}));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    expect(screen.queryByText(/how old are you/i)).toBeNull();
    expect(letsGo()).toBeDisabled();
  });
});

describe("when the roster has no band to give", () => {
  it("asks, when the row has no date of birth", async () => {
    signIn("child-1");
    myDashboard.mockResolvedValue(dashboardFor("child-1", null));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    expect(await screen.findByText(/how old are you/i)).toBeInTheDocument();
    expect(letsGo()).toBeDisabled();
  });

  it("asks, when the read fails - a flaky network is not a band", async () => {
    signIn("child-1");
    myDashboard.mockRejectedValue(new Error("503"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    expect(await screen.findByText(/how old are you/i)).toBeInTheDocument();
  });

  it("does not take another child's band", async () => {
    // The answer came back for someone else - a session that changed under
    // the read. It is not this child's.
    signIn("child-1");
    myDashboard.mockResolvedValue(dashboardFor("child-2", "senior_secondary"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    expect(await screen.findByText(/how old are you/i)).toBeInTheDocument();
  });
});

describe("a child with no account yet, on a tablet still holding a session", () => {
  it("reads nothing, so the previous child's band cannot decide", async () => {
    // The class-code path: no owner, because their account is made at the
    // PIN step after this. The session here is somebody else's.
    signIn("previous-child");
    myDashboard.mockResolvedValue(
      dashboardFor("previous-child", "senior_secondary"),
    );
    mergeOnboardingDraft({ name: "Amara", age: 9 });

    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(letsGo());

    expect(myDashboard).not.toHaveBeenCalled();
    // Their own Step 1 age: nine is Primary 4-6, the 4x4 band.
    expect(screen.getByText("grid 4")).toBeInTheDocument();
  });
});
