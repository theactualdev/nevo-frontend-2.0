import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HomeDashboard } from "./HomeDashboard";
import { SAMPLE_ATTR } from "@/lib/sampleData";
import { clearSession, setSession } from "@/lib/auth/session";
import { markWarmUpDone } from "@/lib/profiling/warmUpDone";

/**
 * The sample mark has to be right in BOTH directions, and this screen had it
 * backwards.
 *
 * Home builds `cont` and `today` from the live read when there is a session and
 * from the fixtures when there is not, then rendered one body through a single
 * return that was wrapped in `<SampleRegion>`. So a signed-in child whose
 * dashboard loaded perfectly had their own week stamped `student:home`.
 *
 * That is the more dangerous direction. The end-to-end assertion this mark
 * exists for is "no sample marks once signed in" - it would have failed on a
 * healthy Home, and the obvious way to make a test like that pass is to delete
 * the mark that was telling the truth everywhere else.
 *
 * So: one test per direction, and neither is redundant.
 */

const dashboard = vi.hoisted(() => ({ useStudentDashboard: vi.fn() }));
vi.mock("@/hooks/useStudentDashboard", () => dashboard);

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  // Every other hook on this screen reads the network; none of them decides
  // the mark. Failing fast keeps them in their catch instead of pending.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));
  dashboard.useStudentDashboard.mockReset();
  clearSession();
  // The warm-up's done-flag lives in localStorage and outlives a test by
  // design - it is a device memory. Leaving it set would have one test's child
  // arrive already done in the next.
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearSession();
});

describe("HomeDashboard sample marking", () => {
  it("does not mark a signed-in child's own dashboard as sample data", async () => {
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: { assignments: [], recentProgress: [] },
      failed: false,
      loading: false,
    });

    const { container } = render(<HomeDashboard />);

    // Wait past the hydration gate, which renders the skeleton first.
    await waitFor(() =>
      expect(container.querySelector(".animate-pulse")).toBeNull(),
    );
    expect(container.querySelector(`[${SAMPLE_ATTR}]`)).toBeNull();
  });

  it("marks the signed-out walkthrough, which is a fictional child's week", async () => {
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: false,
      loading: false,
    });

    const { container } = render(<HomeDashboard />);

    await waitFor(() =>
      expect(container.querySelector(`[${SAMPLE_ATTR}]`)).not.toBeNull(),
    );
    expect(
      container.querySelector(`[${SAMPLE_ATTR}]`)?.getAttribute(SAMPLE_ATTR),
    ).toBe("student:home");
  });

  it("shows a signed-in child nothing rather than sample data while the read is in flight", async () => {
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: false,
      loading: true,
    });

    const { container } = render(<HomeDashboard />);

    // The loading branch is the one that used to leak: `data === null` covers
    // in-flight as well as signed-out, so a slow read rendered the fixtures.
    await waitFor(() =>
      expect(container.querySelector(".animate-pulse")).not.toBeNull(),
    );
    expect(container.querySelector(`[${SAMPLE_ATTR}]`)).toBeNull();
  });
});

/**
 * A lesson a teacher called off stayed on the child's Home — and the worse of
 * the two lists PROMOTED it.
 *
 * Home builds two things from `live.assignments`. Today's lessons had a filter
 * that looked real and was not (`a.status !== "completed"`, against an enum
 * with no "completed" member). The Pick Back Up card had no filter at all, and
 * because Today's list excludes whatever is on that card BY ID, a cancelled
 * lesson a child had already started did not merely survive — it left the small
 * grid and became the single biggest card on the screen.
 *
 * So both lists are built from one filtered array. A fix applied to only the
 * grid would leave the continue card standing, which is what the second test
 * below exists to catch.
 */
describe("Home does not offer work a teacher called off", () => {
  const live = (assignments: unknown[], recentProgress: unknown[] = []) =>
    dashboard.useStudentDashboard.mockReturnValue({
      data: { assignments, recentProgress },
      failed: false,
      loading: false,
    });

  const lesson = (id: string, title: string) => ({
    id,
    title,
    segmentCount: 4,
  });

  const settled = async (container: HTMLElement) =>
    waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());

  it("keeps a cancelled lesson off Today's lessons", async () => {
    signIn();
    live([
      {
        id: "a-1",
        status: "cancelled",
        availableFrom: null,
        lesson: lesson("off-1", "Cancelled Fractions"),
      },
      {
        id: "a-2",
        status: "assigned",
        availableFrom: null,
        lesson: lesson("keep-1", "Ordinary Fractions"),
      },
    ]);

    const { container, queryByText } = render(<HomeDashboard />);
    await settled(container);

    expect(queryByText("Cancelled Fractions")).toBeNull();
    expect(queryByText("Ordinary Fractions")).not.toBeNull();
  });

  it("does not promote a cancelled lesson onto the Pick Back Up card", async () => {
    /*
     * THE ONE THAT CATCHES A HALF-FIX. The child had started this lesson before
     * the teacher cancelled it, so it has a progress row — which is exactly
     * what puts a lesson on the continue card. Filter only the grid and this
     * assertion fails while the one above passes.
     */
    signIn();
    live(
      [
        {
          id: "a-1",
          status: "cancelled",
          availableFrom: null,
          lesson: lesson("off-1", "Cancelled Fractions"),
        },
      ],
      [
        {
          lessonId: "off-1",
          status: "in_progress",
          segmentPosition: 2,
          updatedAt: new Date().toISOString(),
        },
      ],
    );

    const { container, queryByText } = render(<HomeDashboard />);
    await settled(container);

    expect(queryByText("Cancelled Fractions")).toBeNull();
  });

  it("keeps a lesson that opens on Friday off Home until Friday", async () => {
    signIn();
    live([
      {
        id: "a-1",
        status: "assigned",
        availableFrom: new Date(Date.now() + 86_400_000).toISOString(),
        lesson: lesson("friday-1", "Friday Fractions"),
      },
    ]);

    const { container, queryByText } = render(<HomeDashboard />);
    await settled(container);

    expect(queryByText("Friday Fractions")).toBeNull();
  });

  it("still shows an ordinary assigned lesson", async () => {
    // Without this, a filter that emptied Home would pass all three above.
    signIn();
    live([
      {
        id: "a-1",
        status: "assigned",
        availableFrom: null,
        lesson: lesson("open-1", "Todays Fractions"),
      },
    ]);

    const { container, queryByText } = render(<HomeDashboard />);
    await settled(container);

    expect(queryByText("Todays Fractions")).not.toBeNull();
  });
});

describe("the daily warm-up card", () => {
  /**
   * A dashboard with something on it.
   *
   * The card only renders when the child has work queued - an empty week shows
   * the "nothing waiting right now" state instead, and there is no warm-up
   * card on it to assert about.
   */
  const live = () =>
    dashboard.useStudentDashboard.mockReturnValue({
      data: {
        assignments: [
          {
            id: "a-1",
            status: "assigned",
            availableFrom: null,
            dueAt: null,
            note: null,
            lesson: { id: "l-1", title: "Fractions", segmentCount: 4 },
          },
        ],
        recentProgress: [],
      },
      failed: false,
      loading: false,
    });

  /** Past the hydration gate, which renders the skeleton first. */
  const settled = async (container: HTMLElement) =>
    waitFor(() =>
      expect(container.querySelector(".animate-pulse")).toBeNull(),
    );

  it("offers the warm-up when today's has not been done", async () => {
    signIn();
    live();

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.getByText(/A quick warm-up to begin/i)).toBeInTheDocument();
  });

  it("says it is done once this child has done today's", async () => {
    /*
     * THE WIRING, WHICH NOTHING COVERED. `WarmUpCard`'s own tests take `done`
     * as a prop, so a mutation that hard-coded `done={false}` on this screen
     * passed every one of them - the card was right and never asked.
     *
     * The run became once-a-day on 23 Sep and this card did not: it kept
     * saying "Begin warm-up" and led to a screen saying the opposite.
     */
    signIn();
    live();
    markWarmUpDone("student-1");

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.getByText(/Today's warm-up is done\./)).toBeInTheDocument();
    expect(screen.queryByText(/A quick warm-up to begin/i)).toBeNull();
  });

  it("still offers it to a different child on the same tablet", async () => {
    // The device remembers up to six. This card is one of the few things on
    // the dashboard addressed to the child in front of it.
    markWarmUpDone("someone-else");
    signIn();
    live();

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.getByText(/A quick warm-up to begin/i)).toBeInTheDocument();
  });
});
