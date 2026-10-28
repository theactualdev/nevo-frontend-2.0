import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { HomeDashboard } from "./HomeDashboard";
import { lessonsApi } from "@/lib/api/lessons";
import {
  flushPendingProgress,
  holdProgress,
} from "@/lib/lessons/pendingProgress";
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

// The child's full assignment list, finished ones included - which the
// dashboard leaves out. Unread (failed) unless a test says otherwise.
const assignments = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/assignments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/assignments")>();
  return {
    ...actual,
    assignmentsApi: { ...actual.assignmentsApi, list: assignments.list },
  };
});

// Today's cards open the lesson preview, whose Start navigates.
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: router.push, replace: vi.fn(), back: vi.fn() }),
}));

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
  assignments.list.mockReset();
  assignments.list.mockRejectedValue(new Error("no network"));
  router.push.mockReset();
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

  it("does not model the retired how-far-in phrase in the walkthrough either", async () => {
    // Design D19 covers the fixtures: they show what a real card looks like.
    // A real card now draws its ring (B51), so the walkthrough does too.
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: false,
      loading: false,
    });

    const { container } = render(<HomeDashboard />);

    await waitFor(() =>
      expect(container.querySelector(`[${SAMPLE_ATTR}]`)).not.toBeNull(),
    );
    const pickup = screen.getByRole("region", {
      name: /Pick up where you left off/,
    });
    expect(pickup.textContent).not.toMatch(
      /almost there|halfway|getting started|nearly/i,
    );
    expect(pickup.querySelectorAll("[data-pickup-ring]")).toHaveLength(3);
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

  it("shows no note in the walkthrough while its lessons are part-way", async () => {
    /*
     * Design D98, 6 Oct: Home draws no note while work is outstanding. The
     * walkthrough is what a real child's Home looks like, so its three
     * part-way lessons leave the note out, as a real child's would.
     */
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
      screen.getByRole("region", { name: /Pick up where you left off/ }),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/showing up this week/);
    expect(text).not.toMatch(/caught up/);
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
 * Home builds two things from `live.assignments`: Today's lessons, and the
 * lessons a child has started. Only the first was ever filtered, so a
 * cancelled lesson a child had already started did not merely survive — it
 * became the single biggest card on the screen.
 *
 * So both lists are built from one filtered array. A fix applied to only the
 * grid would leave the started list standing, which is what the second test
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

  it("does not promote a cancelled lesson onto Pick up where you left off", async () => {
    /*
     * THE ONE THAT CATCHES A HALF-FIX. The child had started this lesson before
     * the teacher cancelled it, so it has a progress row — which is exactly
     * what puts a lesson on the started list. Filter only the grid and this
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
   * A dashboard with something on it. The card shows without one too, since
   * 1 Oct (D18) - see HomeDashboard.warmup.
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

/**
 * SCRUM-146: Today's lessons carries only work not yet started; unfinished
 * lessons move to "Pick up where you left off" (up to five, lesson + subject +
 * how far in, never a date); finished ones leave Home altogether.
 *
 * The screen it replaced drew one "Pick back up" card ABOVE Today, kept
 * finished lessons in Today and counted them in "N ready" (it believed
 * `completed` could not occur), and dated Today's cards "Due 3 Oct" while the
 * payload carried the time estimate the frame draws.
 */
describe("Home's two lists", () => {
  const NOW = Date.now();
  const at = (minutesAgo: number) =>
    new Date(NOW - minutesAgo * 60_000).toISOString();

  const assignment = (
    id: string,
    title: string,
    over: Record<string, unknown> = {},
    lesson: Record<string, unknown> = {},
  ) => ({
    id: `as-${id}`,
    status: "assigned",
    availableFrom: null,
    dueAt: null,
    note: null,
    lesson: { id, title, segmentCount: 4, ...lesson },
    ...over,
  });

  const row = (
    lessonId: string,
    status: string,
    minutesAgo = 5,
    pos = 2,
    over: Record<string, unknown> = {},
  ) => ({
    lessonId,
    status,
    segmentPosition: pos,
    updatedAt: at(minutesAgo),
    ...over,
  });

  const live = (assignments: unknown[], recentProgress: unknown[] = []) =>
    dashboard.useStudentDashboard.mockReturnValue({
      data: { assignments, recentProgress },
      failed: false,
      loading: false,
    });

  const settled = async (container: HTMLElement) =>
    waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());

  const section = (name: RegExp) =>
    screen.getByRole("region", { name }) as HTMLElement;

  it("keeps a finished lesson out of Today and out of its count", async () => {
    signIn();
    live([
      assignment("done", "Finished Fractions", { status: "completed" }),
      assignment("new", "New Decimals"),
    ]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Finished Fractions")).toBeNull();
    expect(screen.getByText("1 ready")).toBeInTheDocument();
  });

  it("treats a completed progress row as finished even if the assignment lags", async () => {
    signIn();
    live(
      [assignment("done", "Finished Fractions"), assignment("new", "New Decimals")],
      [row("done", "completed")],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Finished Fractions")).toBeNull();
    expect(screen.getByText("1 ready")).toBeInTheDocument();
  });

  it("moves a started lesson from Today to Pick up where you left off", async () => {
    signIn();
    live(
      [
        assignment("mid", "Halfway Fractions", {}, { subject: "Mathematics" }),
        assignment("new", "New Decimals"),
      ],
      [row("mid", "in_progress")],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const today = section(/Today's lessons/);
    const pickup = section(/Pick up where you left off/);
    expect(within(today).queryByText("Halfway Fractions")).toBeNull();
    expect(within(pickup).getByText("Halfway Fractions")).toBeInTheDocument();
    // Lesson and subject, as the frame draws it.
    expect(within(pickup).getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("1 ready")).toBeInTheDocument();
  });

  it("counts a lesson the child left as part-way, not as new", async () => {
    // `exited` records HOW they left, not whether they are done.
    signIn();
    live([assignment("left", "Left Fractions")], [row("left", "exited")]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(
      within(section(/Pick up where you left off/)).getByText("Left Fractions"),
    ).toBeInTheDocument();
  });

  /*
   * TESLIM, 21 OCT: THE ROW CARRIES `completedAt`. Reopening a finished lesson
   * set its row back to `in_progress` at the last segment, so it came back
   * here as unfinished work to pick up (RUN21 finding 3). It leaves the list,
   * and nothing more: where finished work goes is SCRUM-146's.
   */
  it("leaves a finished lesson off Pick up where you left off, though its row says in progress", async () => {
    signIn();
    live(
      [
        assignment("done", "Finished Fractions"),
        assignment("mid", "Halfway Fractions"),
      ],
      [
        row("done", "in_progress", 2, 3, { completedAt: at(60) }),
        row("mid", "in_progress", 5),
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    expect(within(pickup).getByText("Halfway Fractions")).toBeInTheDocument();
    expect(screen.queryByText("Finished Fractions")).toBeNull();
  });

  it("leaves a finished library lesson off the same way", async () => {
    signIn();
    live(
      [],
      [
        row("lib", "in_progress", 2, 4, {
          title: "Volcanoes",
          completedAt: at(60),
        }),
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Volcanoes")).toBeNull();
  });

  it("still lists a part-way lesson with no completedAt, a finish with nothing marked included", async () => {
    // `not_attempted` stays in progress on the server, with no completedAt.
    signIn();
    live(
      [assignment("mid", "Halfway Fractions")],
      [row("mid", "in_progress", 5, 3, { completedAt: null })],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(
      within(section(/Pick up where you left off/)).getByText(
        "Halfway Fractions",
      ),
    ).toBeInTheDocument();
  });

  /*
   * A COMPLETION HELD ON THIS DEVICE CAN LAND AFTER HOME HAS READ (24 Oct
   * production run, Chidi on Photosynthesis). The shell flushes as Home first
   * reads, so that first answer can be older than the server already is.
   */
  it("reads again once held progress lands, so a lesson finished by it leaves Pick up", async () => {
    signIn();
    const before = {
      assignments: [assignment("photo", "Photosynthesis")],
      recentProgress: [row("photo", "in_progress", 5, 3)],
    };
    // The dashboard leaves a finished assignment out.
    const after = {
      assignments: [],
      recentProgress: [row("photo", "completed", 0, 3, { completedAt: at(0) })],
    };
    dashboard.useStudentDashboard.mockImplementation(() => {
      const [landed, setLanded] = useState(false);
      return {
        data: landed ? after : before,
        failed: false,
        loading: false,
        refresh: () => setLanded(true),
      };
    });
    const save = vi
      .spyOn(lessonsApi, "saveProgress")
      .mockResolvedValue({} as never);
    holdProgress("photo", {
      sessionId: "sess-1",
      status: "completed" as never,
      segment: 3,
    });

    const { container } = render(<HomeDashboard />);
    await settled(container);
    expect(
      within(section(/Pick up where you left off/)).getByText("Photosynthesis"),
    ).toBeInTheDocument();

    await act(() => flushPendingProgress());

    expect(save).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Photosynthesis")).toBeNull());
    save.mockRestore();
  });

  it("does not tell a child whose only lesson is finished that a first one is coming", async () => {
    // It left Pick up, so it must still count as set work finished - as a
    // `completed` row already did - or Home would say nothing was ever set.
    signIn();
    live(
      [assignment("done", "Finished Fractions")],
      [row("done", "in_progress", 2, 3, { completedAt: at(60) })],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText(/your first lesson/)).toBeNull();
  });

  it("shows at most five, the most recently touched first", async () => {
    signIn();
    const ids = ["a", "b", "c", "d", "e", "f"];
    live(
      ids.map((id) => assignment(id, `Lesson ${id.toUpperCase()}`)),
      // "a" is the oldest, "f" the newest.
      ids.map((id, i) => row(id, "in_progress", 60 - i)),
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const titles = within(section(/Pick up where you left off/))
      .getAllByRole("link")
      .map((a) => a.textContent ?? "");
    expect(titles).toHaveLength(5);
    expect(titles[0]).toMatch(/Lesson F/);
    expect(titles.join(" ")).not.toMatch(/Lesson A/);
  });

  it("goes straight back in, with the assignment riding the link", async () => {
    signIn();
    live([assignment("mid", "Halfway Fractions")], [row("mid", "in_progress")]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(
      within(section(/Pick up where you left off/))
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/student/lessons/mid?assignment=as-mid");
  });

  it("takes a lesson left in its check straight back in, and says nothing about it (B82)", async () => {
    // The player opens it straight into the check; no label for that is drawn.
    signIn();
    live(
      [assignment("chk", "Ratio Basics")],
      [
        row("chk", "exited", 5, 3, {
          checkPosition: 1,
          checkResumableUntil: at(-60),
        }),
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    expect(within(pickup).getByRole("link").getAttribute("href")).toBe(
      "/student/lessons/chk?assignment=as-chk",
    );
    expect(pickup.textContent).not.toMatch(/check|question|quiz/i);
  });

  it("says nothing about how far in - no phrase, no number, no date", async () => {
    /*
     * Design D19, 1 Oct. The card cut the fraction at one third and two thirds
     * into "Just getting started", "About halfway in" and "Almost there" - a
     * threshold we chose. The backend sends no phrase, so the card shows none.
     * At 3 of 4 this read "Almost there".
     */
    signIn();
    live(
      [assignment("mid", "Adding Fractions", { dueAt: at(-60 * 24 * 3) })],
      [row("mid", "in_progress", 5, 3)],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const text = section(/Pick up where you left off/).textContent ?? "";
    expect(text).toMatch(/Adding Fractions/);
    expect(text).not.toMatch(/almost there|halfway|getting started|nearly/i);
    expect(text).not.toMatch(/\d/);
  });

  it("draws the ring to the child's own place, read out in words", async () => {
    /*
     * Backend B51, 5 Oct: `segmentPosition` is a ZERO-based cursor and
     * `segmentCount` is every segment, so position 2 of 10 is "segment 3 of
     * 10" and the arc runs a fifth of the way. Design D21 allowed the ring
     * back once the true fraction was on the wire.
     */
    signIn();
    live(
      [assignment("mid", "Halfway Fractions")],
      [row("mid", "in_progress", 5, 2, { segmentCount: 10 })],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    const ring = within(pickup).getByRole("img", { name: "Segment 3 of 10" });
    const arc = ring.querySelectorAll("circle")[1];
    const length = 2 * Math.PI * 24;
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      length * 0.8,
    );
    // Never a percentage, on screen or in the words.
    expect(pickup.textContent).not.toMatch(/%|\d/);
  });

  it("draws two lessons at two places as two different rings", async () => {
    signIn();
    live(
      [assignment("early", "Early Fractions"), assignment("late", "Late Fractions")],
      [
        row("early", "in_progress", 5, 1, { segmentCount: 4 }),
        row("late", "in_progress", 6, 3, { segmentCount: 4 }),
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    expect(within(pickup).getByRole("img", { name: "Segment 2 of 4" })).toBeInTheDocument();
    expect(within(pickup).getByRole("img", { name: "Segment 4 of 4" })).toBeInTheDocument();
  });

  it("never subtracts the segments flagged for review from the count", async () => {
    // `reviewSegmentCount` is a subset of `segmentCount` (B51), not a second
    // kind of segment - the row's own count is the whole lesson.
    signIn();
    live(
      [assignment("mid", "Halfway Fractions", {}, { segmentCount: 10, reviewSegmentCount: 3 })],
      [row("mid", "in_progress", 5, 2, { segmentCount: 10 })],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(
      within(section(/Pick up where you left off/)).getByRole("img", {
        name: "Segment 3 of 10",
      }),
    ).toBeInTheDocument();
  });

  it("wears the plain mark when the row does not say how far in", async () => {
    /*
     * Design D21. No count on the row (or the schema's default of 0) is no
     * fraction, and a ring drawn without one is an amount we composed. Two
     * such lessons at different places draw identical marks, and no arc.
     */
    signIn();
    live(
      [assignment("early", "Early Fractions"), assignment("late", "Late Fractions")],
      [
        row("early", "in_progress", 5, 0),
        row("late", "in_progress", 6, 3, { segmentCount: 0 }),
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    const marks = [...pickup.querySelectorAll("[data-pickup-mark]")];
    expect(marks).toHaveLength(2);
    expect(marks[0].outerHTML).toBe(marks[1].outerHTML);
    expect(pickup.innerHTML).not.toMatch(/stroke-dashoffset|conic-gradient/);
  });

  it("does not draw a place the count cannot hold", async () => {
    signIn();
    live(
      [assignment("odd", "Odd Fractions")],
      [row("odd", "in_progress", 5, 4, { segmentCount: 4 })],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    expect(pickup.querySelector("[data-pickup-ring]")).toBeNull();
    expect(pickup.querySelector("[data-pickup-mark]")).not.toBeNull();
  });

  it("lists a lesson started from the library, with no assignment on its link", async () => {
    /*
     * Backend B52, 5 Oct: the progress row carries the lesson's title and
     * subject, so a lesson no teacher set can sit here too. It is not set
     * work, so it opens bare - an `?assignment=` would file the child's own
     * reading under a teacher's name.
     */
    signIn();
    live(
      [assignment("set", "Set Fractions")],
      [
        row("set", "in_progress", 10),
        row("lib", "in_progress", 2, 1, {
          title: "Volcanoes",
          subject: "Geography",
          segmentCount: 5,
        }),
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const pickup = section(/Pick up where you left off/);
    const links = within(pickup).getAllByRole("link");
    // Newest first, whichever door it came in by.
    expect(links[0].textContent).toMatch(/Volcanoes/);
    expect(links[0].getAttribute("href")).toBe("/student/lessons/lib");
    expect(within(pickup).getByText("Geography")).toBeInTheDocument();
    expect(
      within(pickup).getByRole("img", { name: "Segment 2 of 5" }),
    ).toBeInTheDocument();
    expect(links[1].getAttribute("href")).toBe(
      "/student/lessons/set?assignment=as-set",
    );
  });

  it("leaves off a library lesson the row gives no title", async () => {
    signIn();
    live([], [row("lib", "in_progress", 2, 1, { title: "  " })]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Pick up where you left off")).toBeNull();
  });

  it("does not bring a cancelled lesson back in as a library one", async () => {
    // The row names a lesson an assignment names: that is set work, and the
    // teacher called it off. Its title on the row is no way back in.
    signIn();
    live(
      [assignment("off", "Called Off", { status: "cancelled" })],
      [row("off", "in_progress", 2, 1, { title: "Called Off" })],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Called Off")).toBeNull();
  });

  it("leaves a finished library lesson off", async () => {
    signIn();
    live([], [row("lib", "completed", 2, 4, { title: "Volcanoes" })]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Volcanoes")).toBeNull();
  });

  it("shows a part-way lesson with no Today heading and no caught-up line when nothing new is open", async () => {
    /*
     * Design D99, 6 Oct: "The part-way lesson appears in
     * continue-where-you-left-off". No Today heading over an empty grid
     * (D20), and no empty state telling the child their lessons are still to
     * come. The caught-up state D99 put below it waits on a status the
     * backend sends (Lydia, 21 Oct, SCRUM-146).
     */
    signIn();
    live([assignment("mid", "Halfway Fractions")], [row("mid", "in_progress")]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText(/Today's lessons/)).toBeNull();
    expect(screen.queryByText("Your lessons will show up here soon")).toBeNull();
    expect(screen.queryByText(/your first lesson/)).toBeNull();
    const pickUp = section(/Pick up where you left off/);
    expect(within(pickUp).getByText("Halfway Fractions")).toBeInTheDocument();
    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  it("keeps Today's lessons when something new is open, with no empty state and no note", async () => {
    signIn();
    live(
      [assignment("mid", "Halfway Fractions"), assignment("new", "New Decimals")],
      [row("mid", "in_progress")],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(section(/Today's lessons/)).toBeInTheDocument();
    expect(screen.queryByText("Your lessons will show up here soon")).toBeNull();
    // New and part-way work both waiting: D98's no-note state.
    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  it("counts a lesson opening later today as not today's yet", async () => {
    // "Today" is open from today (`availableFrom`), never "due today".
    signIn();
    live(
      [
        assignment("mid", "Halfway Fractions"),
        assignment("later", "Later Decimals", {
          availableFrom: new Date(NOW + 60 * 60_000).toISOString(),
          dueAt: new Date(NOW + 2 * 60 * 60_000).toISOString(),
        }),
      ],
      [row("mid", "in_progress")],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Later Decimals")).toBeNull();
    expect(screen.queryByText(/Today's lessons/)).toBeNull();
    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  it("is absent entirely when nothing is part-way", async () => {
    signIn();
    live([assignment("new", "New Decimals")]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText("Pick up where you left off")).toBeNull();
  });

  it("dates nothing on Today's cards and says the time instead", async () => {
    signIn();
    live([
      assignment(
        "new",
        "New Decimals",
        { dueAt: new Date(NOW + 86_400_000 * 2).toISOString() },
        { estimatedMinutes: 12 },
      ),
    ]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const today = section(/Today's lessons/);
    expect(today.textContent).toMatch(/About 12 min/);
    expect(today.textContent).not.toMatch(/Due/);
  });
});

describe("Today's cards open the lesson preview", () => {
  const live = (lesson: Record<string, unknown>) =>
    dashboard.useStudentDashboard.mockReturnValue({
      data: {
        assignments: [
          {
            id: "as-1",
            status: "assigned",
            availableFrom: null,
            dueAt: null,
            note: null,
            lesson: { id: "l-1", title: "New Decimals", segmentCount: 4, ...lesson },
          },
        ],
        recentProgress: [],
      },
      failed: false,
      loading: false,
    });

  const settled = async (container: HTMLElement) =>
    waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());

  it("opens the preview rather than the player", async () => {
    signIn();
    live({ description: "Find decimals on a number line." });

    const { container } = render(<HomeDashboard />);
    await settled(container);
    fireEvent.click(screen.getByRole("button", { name: /New Decimals/ }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("New Decimals")).toBeInTheDocument();
    expect(
      within(sheet).getByText("Find decimals on a number line."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("starts the lesson with the assignment it came from", async () => {
    // Home's cards linked with `?assignment=`; routing them through the
    // preview must not lose it.
    signIn();
    live({});

    const { container } = render(<HomeDashboard />);
    await settled(container);
    fireEvent.click(screen.getByRole("button", { name: /New Decimals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(router.push).toHaveBeenCalledWith(
      "/student/lessons/l-1?assignment=as-1",
    );
  });
});

describe("what Home says when there is nothing, or nothing left", () => {
  const settled = async (container: HTMLElement) =>
    waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());

  const live = (assignments: unknown[], recentProgress: unknown[] = []) =>
    dashboard.useStudentDashboard.mockReturnValue({
      data: { assignments, recentProgress },
      failed: false,
      loading: false,
    });

  const done = {
    id: "as-done",
    status: "completed",
    availableFrom: null,
    dueAt: null,
    note: null,
    lesson: { id: "l-done", title: "Finished Fractions", segmentCount: 4 },
  };

  it("uses the frame's line for a child with nothing set, and praises nothing", async () => {
    signIn();
    live([]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(
      screen.getByText("Your teacher is setting up your first lesson"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Nice work/);
  });

  it("does not tell a child who finished everything that a first lesson is coming", async () => {
    signIn();
    live([done]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText(/your first lesson/)).toBeNull();
    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  /*
   * 22 OCT PRODUCTION RUN: AMINA FINISHED OSMOSIS, HER ONLY LESSON, and Home
   * told her "Your teacher is setting up your first lesson". The dashboard
   * leaves completed assignments out, so it had none to show. Her row said
   * `completed` with a `completedAt`, and `GET /api/v1/assignments` listed
   * the assignment completed. Home draws no lesson area for her and says
   * nothing about it: where finished work goes is SCRUM-146's.
   */
  describe("when the dashboard leaves the finished lesson out", () => {
    const osmosis = { ...done, id: "as-osmosis", lesson: { id: "l-osmosis", title: "Osmosis", segmentCount: 9 } };
    const finishedRow = {
      lessonId: "l-osmosis",
      status: "completed",
      segmentPosition: 8,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      title: "Osmosis",
    };
    const noLessonArea = () => {
      expect(screen.queryByText(/your first lesson/)).toBeNull();
      expect(screen.queryByText(/Today's lessons/)).toBeNull();
      expect(screen.queryByText("Pick up where you left off")).toBeNull();
      expect(screen.queryByText("Osmosis")).toBeNull();
    };

    it("does not say a first lesson is coming, from the full list and her row", async () => {
      signIn();
      live([], [finishedRow]);
      assignments.list.mockResolvedValue([osmosis]);

      const { container } = render(<HomeDashboard />);
      await settled(container);
      await waitFor(() =>
        expect(screen.queryByText(/your first lesson/)).toBeNull(),
      );

      noLessonArea();
      expect(assignments.list).toHaveBeenCalled();
    });

    it("nor from the full list alone, once her row has aged out of the feed", async () => {
      signIn();
      live([], []);
      assignments.list.mockResolvedValue([osmosis]);

      const { container } = render(<HomeDashboard />);
      await settled(container);

      await waitFor(() =>
        expect(screen.queryByText(/your first lesson/)).toBeNull(),
      );
      noLessonArea();
    });

    it("nor from her row alone, when the full list cannot be read", async () => {
      signIn();
      live([], [finishedRow]);

      const { container } = render(<HomeDashboard />);
      await settled(container);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      noLessonArea();
    });

    it("still says it for a child whose only assignment was cancelled", async () => {
      signIn();
      live([], []);
      assignments.list.mockResolvedValue([{ ...osmosis, status: "cancelled" }]);

      const { container } = render(<HomeDashboard />);
      await settled(container);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(
        screen.getByText("Your teacher is setting up your first lesson"),
      ).toBeInTheDocument();
    });
  });

  it("says nothing about being caught up beside a ready lesson, with nothing part-way", async () => {
    /*
     * 20 Oct production run: a new lesson in Today's lessons, nothing
     * started, and "You're all caught up" under it. The frame's toggle reads
     * part-way work alone; the line is untrue beside a lesson ready to start.
     */
    signIn();
    live([{ ...done, id: "as-new", status: "assigned" }]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(
      screen.getByRole("region", { name: /Today's lessons/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pick up where you left off")).toBeNull();
    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  it("says nothing about being caught up without a read that shows it", async () => {
    // Signed in, and no dashboard to read: nothing here can see that
    // nothing new is waiting.
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: false,
      loading: false,
    });

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  it("says nothing about being caught up once everything set is finished, until the backend says so", async () => {
    // "All caught up" is a status the backend sends, not one Home works out
    // from its lists (Lydia, 21 Oct, SCRUM-146).
    signIn();
    live([done], [
      {
        lessonId: "l-done",
        status: "completed",
        segmentPosition: 4,
        updatedAt: new Date().toISOString(),
      },
    ]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.queryByText(/Today's lessons/)).toBeNull();
    expect(screen.queryByText("Pick up where you left off")).toBeNull();
    expect(screen.queryByText(/caught up/)).toBeNull();
  });

  it("says nothing about the child's week while work is outstanding", async () => {
    /*
     * The frame's line for this state ("You've been showing up this week")
     * was a claim nothing verifies, and the one that replaced it was in no
     * frame at all. Design ruled for absence (D98, 6 Oct). Outstanding is the
     * frame's state: something new today AND something part-way.
     */
    signIn();
    live(
      [
        { ...done, id: "as-mid", status: "assigned" },
        {
          ...done,
          id: "as-new",
          status: "assigned",
          lesson: { id: "l-new", title: "New Decimals", segmentCount: 4 },
        },
      ],
      [
        {
          lessonId: "l-done",
          status: "in_progress",
          segmentPosition: 1,
          updatedAt: new Date().toISOString(),
        },
      ],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/caught up/);
    expect(text).not.toMatch(/showing up this week/);
    expect(text).not.toMatch(/Nevo keeps up with you/);
  });
});

describe("no date over the greeting", () => {
  /*
   * Nevo Home Frame, 13 Oct: the "TUESDAY · 3 JULY" eyebrow is removed and
   * the greeting is first. Home drew today's date over "Welcome back" in
   * every state, including the failed read.
   */
  const today = () =>
    new RegExp(
      new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(
        new Date(),
      ),
      "i",
    );

  it("puts the greeting first, with no date over it", async () => {
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: false,
      loading: false,
    });

    render(<HomeDashboard />);

    const greeting = await screen.findByRole("heading", {
      level: 1,
      name: /Welcome back/,
    });
    expect(greeting.previousElementSibling).toBeNull();
    expect(document.body.textContent).not.toMatch(today());
  });

  it("dates nothing when the lessons could not be read either", async () => {
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: null,
      failed: true,
      loading: false,
    });

    render(<HomeDashboard />);

    expect(
      await screen.findByText("We couldn't load your lessons just now"),
    ).toBeInTheDocument();
    const greeting = screen.getByRole("heading", {
      level: 1,
      name: /Welcome back/,
    });
    expect(greeting.previousElementSibling).toBeNull();
    expect(document.body.textContent).not.toMatch(today());
  });
});

describe("Home with nothing set, on a short screen", () => {
  /*
   * 29 drew the figure alone at 290 on a phone; Home stacks it under the
   * greeting and the warm-up card, and at full height it pushed the only line
   * on the screen past the bottom of a phone and of a 1280x832 desktop. So
   * the figure gives way: the page is the screen's height (`basis-0`,
   * `min-h-0` down the chain) and the figure may shrink (`min-h-0`), drawn
   * whole (`object-contain`). 29 now draws Home's own stack (13 Oct), with
   * the figure at 190 / 300 / 250, and the rule that it gives way stands.
   * Below 80px it goes rather than sit over the line as a 13px speck: its
   * box is a size container and the figure hides under that height.
   * jsdom lays nothing out, so the chain is pinned here.
   */
  it("lets the figure shrink so the line stays on screen", async () => {
    signIn();
    dashboard.useStudentDashboard.mockReturnValue({
      data: { assignments: [], recentProgress: [] },
      failed: false,
      loading: false,
    });

    const { container } = render(<HomeDashboard />);
    const line = await screen.findByText(
      "Your teacher is setting up your first lesson",
    );

    const block = line.parentElement!;
    const figure = block.querySelector("img")!;
    const art = figure.parentElement!;
    expect(art.parentElement).toBe(block);
    expect(art).toHaveClass(
      "min-h-0",
      "[container-type:size]",
      "h-[190px]",
      "md:h-[300px]",
      "lg:h-[250px]",
    );
    expect(art).not.toHaveClass("shrink-0");
    expect(figure).toHaveClass(
      "size-full",
      "object-contain",
      "[@container(max-height:80px)]:hidden",
    );
    expect(line).toHaveClass("shrink-0");
    // Every box from the figure's block up to the page is the screen's
    // height, not its content's.
    for (
      let box: HTMLElement | null = block;
      box && box !== container;
      box = box.parentElement
    ) {
      expect(box).toHaveClass("min-h-0", "basis-0", "flex-1");
    }
  });
});

