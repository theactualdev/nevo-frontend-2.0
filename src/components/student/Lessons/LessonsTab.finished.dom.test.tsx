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
import { LessonsTab } from "./LessonsTab";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A FINISHED LESSON VANISHED FROM THE CHILD'S LIST (22 Oct production run).
 *
 * Amina finished Osmosis, its only assignment. The dashboard leaves completed
 * assignments out, and this tab was built from the dashboard's alone - so her
 * Lessons tab said "Your lessons will show up here soon" while her progress
 * row said `completed` with a `completedAt`, and `GET /api/v1/assignments`
 * listed the assignment `completed`.
 *
 * The real hooks run here. Only the two reads are stood in for: the dashboard,
 * and the child's full assignment list.
 */

const { dashboard, list, push } = vi.hoisted(() => ({
  dashboard: vi.fn(),
  list: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/hooks/useStudentDashboard", () => ({
  useStudentDashboard: dashboard,
}));
vi.mock("@/lib/api/assignments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/assignments")>();
  return { ...actual, assignmentsApi: { ...actual.assignmentsApi, list } };
});
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const OSMOSIS = "4b0d1c2e-0000-4000-8000-00000000a5a5";

const assignment = (
  id: string,
  status: string,
  over: Record<string, unknown> = {},
  lesson: Record<string, unknown> = {},
) => ({
  id,
  status,
  availableFrom: null,
  dueAt: null,
  note: null,
  studentId: "student-1",
  classId: null,
  assignedAt: "2026-10-20T09:00:00Z",
  lesson: {
    id: OSMOSIS,
    title: "Osmosis",
    subject: "Biology",
    segmentCount: 9,
    estimatedMinutes: 14,
    ...lesson,
  },
  ...over,
});

/** Amina's row after she finished: completed, with when. */
const finishedRow = (over: Record<string, unknown> = {}) => ({
  lessonId: OSMOSIS,
  status: "completed",
  segmentPosition: 8,
  segmentCount: 9,
  updatedAt: "2026-10-22T10:05:00Z",
  completedAt: "2026-10-22T10:05:00Z",
  title: "Osmosis",
  subject: "Biology",
  ...over,
});

const dashboardWith = (
  assignments: unknown[],
  recentProgress: unknown[] = [],
) =>
  dashboard.mockReturnValue({
    data: { student: {}, assignments, recentProgress },
    loading: false,
    failed: false,
  });

const card = (name: RegExp) => screen.getByRole("button", { name });
const body = () => document.body.textContent ?? "";
/** Lets both reads answer, whichever of them this code makes. */
const settleReads = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });
});

afterEach(() => {
  cleanup();
  clearSession();
  dashboard.mockReset();
  list.mockReset();
  push.mockReset();
});

describe("a lesson the child finished, which the dashboard leaves out", () => {
  it("stays on the list under Completed, and opens with Look again", async () => {
    dashboardWith([], [finishedRow()]);
    list.mockResolvedValue([assignment("as-osmosis", "completed")]);

    render(<LessonsTab />);

    await waitFor(() => expect(card(/Osmosis/)).toBeInTheDocument());
    expect(body()).not.toMatch(/Your lessons will show up here soon/);
    // Under the Completed chip, with the card's own check.
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(
      within(card(/Osmosis/)).getByRole("img", { name: "Completed" }),
    ).toBeInTheDocument();

    fireEvent.click(card(/Osmosis/));
    fireEvent.click(screen.getByRole("button", { name: "Look again" }));
    expect(push).toHaveBeenCalledWith(
      `/student/lessons/${OSMOSIS}?assignment=as-osmosis`,
    );
  });

  it("is filed under Completed from the child's own row when the full list cannot be read", async () => {
    dashboardWith([], [finishedRow()]);
    list.mockRejectedValue(new Error("no network"));

    render(<LessonsTab />);

    await waitFor(() => expect(card(/Osmosis/)).toBeInTheDocument());
    await settleReads();
    expect(list).toHaveBeenCalled();
    expect(
      within(card(/Osmosis/)).getByRole("img", { name: "Completed" }),
    ).toBeInTheDocument();
    // Its length is the row's own count; no assignment is known to carry.
    expect(within(card(/Osmosis/)).getByText("9 sections")).toBeInTheDocument();
    fireEvent.click(card(/Osmosis/));
    fireEvent.click(screen.getByRole("button", { name: "Look again" }));
    expect(push).toHaveBeenCalledWith(`/student/lessons/${OSMOSIS}`);
  });

  it("files only a finished row, never a part-way one, as Completed", async () => {
    dashboardWith([], [finishedRow({ status: "in_progress", completedAt: null })]);
    list.mockRejectedValue(new Error("no network"));

    render(<LessonsTab />);
    await settleReads();

    expect(body()).toMatch(/Your lessons will show up here soon/);
  });

  it("keeps a cancelled lesson out when only its finished row could say otherwise", async () => {
    // The dashboard still carries a cancelled assignment; the row does not
    // bring the lesson back in past it.
    dashboardWith([assignment("as-osmosis", "cancelled")], [finishedRow()]);
    list.mockRejectedValue(new Error("no network"));

    render(<LessonsTab />);
    await settleReads();

    expect(body()).toMatch(/Your lessons will show up here soon/);
  });

  it("is not made up from a row with no title", async () => {
    dashboardWith([], [finishedRow({ title: "" })]);
    list.mockRejectedValue(new Error("no network"));

    render(<LessonsTab />);
    await settleReads();

    expect(body()).toMatch(/Your lessons will show up here soon/);
  });
});

describe("what the full list must not change", () => {
  it("keeps a cancelled assignment off the list", async () => {
    dashboardWith([], [finishedRow()]);
    list.mockResolvedValue([assignment("as-osmosis", "cancelled")]);

    render(<LessonsTab />);
    await settleReads();

    expect(body()).toMatch(/Your lessons will show up here soon/);
    expect(screen.queryByRole("button", { name: /Osmosis/ })).toBeNull();
  });

  it("keeps one that has not opened yet off it too", async () => {
    dashboardWith([]);
    list.mockResolvedValue([
      assignment("as-later", "assigned", {
        availableFrom: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ]);

    render(<LessonsTab />);
    await settleReads();

    expect(body()).toMatch(/Your lessons will show up here soon/);
  });

  it("shows a lesson once when both reads carry it", async () => {
    // The dashboard's open assignment, and the full list's copy of it beside
    // an earlier, finished setting of the same lesson.
    dashboardWith([assignment("as-new", "assigned")]);
    list.mockResolvedValue([
      assignment("as-new", "assigned"),
      assignment("as-old", "completed"),
    ]);

    render(<LessonsTab />);
    await settleReads();

    expect(screen.getAllByRole("button", { name: /Osmosis/ })).toHaveLength(1);
  });

  it("shows a lesson set twice on the dashboard once", async () => {
    dashboardWith([
      assignment("as-new", "assigned"),
      assignment("as-again", "assigned"),
    ]);
    list.mockRejectedValue(new Error("no network"));

    render(<LessonsTab />);
    await settleReads();

    expect(screen.getAllByRole("button", { name: /Osmosis/ })).toHaveLength(1);
  });

  it("leaves an open assignment exactly as it was", async () => {
    dashboardWith([assignment("as-new", "assigned")]);
    list.mockResolvedValue([assignment("as-new", "assigned")]);

    render(<LessonsTab />);
    await settleReads();

    expect(
      within(card(/Osmosis/)).getByRole("img", { name: "Not started" }),
    ).toBeInTheDocument();
    expect(within(card(/Osmosis/)).getByText("About 14 min")).toBeInTheDocument();
    fireEvent.click(card(/Osmosis/));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(push).toHaveBeenCalledWith(
      `/student/lessons/${OSMOSIS}?assignment=as-new`,
    );
  });

  it("still draws the list from the dashboard while the full list is on its way", () => {
    dashboardWith([assignment("as-new", "assigned")]);
    list.mockReturnValue(new Promise(() => {}));

    render(<LessonsTab />);

    expect(card(/Osmosis/)).toBeInTheDocument();
  });
});
