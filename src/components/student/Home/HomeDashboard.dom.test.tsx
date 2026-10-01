import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

  const row = (lessonId: string, status: string, minutesAgo = 5, pos = 2) => ({
    lessonId,
    status,
    segmentPosition: pos,
    updatedAt: at(minutesAgo),
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

  it("says how far in as words, never a number or a date", async () => {
    signIn();
    live(
      [assignment("mid", "Halfway Fractions", { dueAt: at(-60 * 24 * 3) })],
      [row("mid", "in_progress", 5, 3)],
    );

    const { container } = render(<HomeDashboard />);
    await settled(container);

    const text = section(/Pick up where you left off/).textContent ?? "";
    expect(text).toMatch(/Almost there/);
    expect(text).not.toMatch(/\d/);
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
    expect(
      screen.getByText(/You're all caught up\. Nice and steady/),
    ).toBeInTheDocument();
  });

  it("shows the caught-up line when nothing is part-way", async () => {
    signIn();
    live([{ ...done, id: "as-new", status: "assigned" }]);

    const { container } = render(<HomeDashboard />);
    await settled(container);

    expect(screen.getByText(/You're all caught up/)).toBeInTheDocument();
  });

  it("says nothing about the child's week while work is outstanding", async () => {
    /*
     * The frame's line for this state ("You've been showing up this week")
     * is a claim nothing verifies, and the one that replaced it was in no
     * frame at all. Absence until design rules.
     */
    signIn();
    live(
      [{ ...done, id: "as-mid", status: "assigned" }],
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
