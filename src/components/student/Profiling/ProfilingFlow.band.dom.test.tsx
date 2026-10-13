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
 * AND NOW NOT EVEN THEN (D153, 8 Oct): "There is no stepper, and we do not ask
 * the child." A child with no band runs Primary 4-6, the band the warm-up runs
 * without one (D139), until a class band reaches the client.
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

  it("is banded by the roster over a stale entry band", async () => {
    signIn("child-1");
    mergeOnboardingDraft({ ageBand: "early_primary" });
    myDashboard.mockResolvedValue(dashboardFor("child-1", "junior_secondary"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);
    // Held until the roster answers, even with a band in hand.
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

describe("when the roster has no band to give (D153)", () => {
  it("is never asked their age, and runs Primary 4-6 when the row has no date of birth", async () => {
    signIn("child-1");
    myDashboard.mockResolvedValue(dashboardFor("child-1", null));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    await waitFor(() => expect(letsGo()).not.toBeDisabled());
    expect(screen.queryByText(/how old are you/i)).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(letsGo());

    // Primary 4-6 is tile memory's 4x4 band.
    expect(screen.getByText("grid 4")).toBeInTheDocument();
  });

  it("runs Primary 4-6 when the read fails - a flaky network is not a band", async () => {
    signIn("child-1");
    myDashboard.mockRejectedValue(new Error("503"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);

    await waitFor(() => expect(letsGo()).not.toBeDisabled());
    expect(screen.queryByText(/how old are you/i)).toBeNull();
    fireEvent.click(letsGo());

    expect(screen.getByText("grid 4")).toBeInTheDocument();
  });

  it("does not take another child's band", async () => {
    // The answer came back for someone else - a session that changed under
    // the read. It is not this child's.
    signIn("child-1");
    myDashboard.mockResolvedValue(dashboardFor("child-2", "senior_secondary"));

    render(<ProfilingFlow onDone={vi.fn()} ownerUserId="child-1" />);
    await waitFor(() => expect(letsGo()).not.toBeDisabled());
    fireEvent.click(letsGo());

    // Primary 4-6, not the other child's SS 5x5.
    expect(screen.getByText("grid 4")).toBeInTheDocument();
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
    mergeOnboardingDraft({ name: "Amara", ageBand: "early_primary" });

    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(letsGo());

    expect(myDashboard).not.toHaveBeenCalled();
    // The entry lookup's own band: Primary 1-3, the 3x3 band - not the 4x4
    // a child with no band runs.
    expect(screen.getByText("grid 3")).toBeInTheDocument();
  });
});

/*
 * BACKEND, 9 OCT: the entry lookup and the dashboard carry `ageBand` from the
 * date of birth or, with none, from the enrolled class year. The band is the
 * server's, and the device works out none of its own.
 */
describe("the entry lookup's band (9 Oct)", () => {
  it("is what a child with no account yet runs, class-derived or not", () => {
    // A child with no date of birth: the server banded them by their class.
    mergeOnboardingDraft({ name: "Amara", ageBand: "senior_secondary" });

    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(letsGo());

    // SS is tile memory's 5x5 band, not the 4x4 fallback.
    expect(screen.getByText("grid 5")).toBeInTheDocument();
  });

  it("falls back to Primary 4-6 only for a band the server did not give", () => {
    // Not one of the spec's four: no band, so the fallback, never a guess.
    mergeOnboardingDraft({ name: "Amara", ageBand: "year_9" });

    render(<ProfilingFlow onDone={vi.fn()} />);
    fireEvent.click(letsGo());

    expect(screen.getByText("grid 4")).toBeInTheDocument();
  });
});
