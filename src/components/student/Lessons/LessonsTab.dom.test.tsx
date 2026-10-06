import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonsTab } from "./LessonsTab";

/**
 * TWO THINGS THE LESSONS TAB KNEW AND DID NOT SAY.
 *
 * `subject` has been on the nested lesson summary since 31 Aug and
 * `estimatedMinutes` since 1 Sep, checked against the deployed spec. The hook's
 * own docblock said the contract carried neither - written before they shipped
 * and never revisited - so a signed-in child's list was ungrouped and said
 * "6 sections" where the designed one says "About 12 min".
 *
 * And the empty state offered "Clear search", which cleared the query alone. A
 * status chip empties the list just as easily, so with no query typed the copy
 * blamed a search the child never made - and tapping the one control offered
 * restored nothing, because the chip was still on. That reads as a broken
 * button rather than as a filter still being applied.
 */

const lessons = vi.hoisted(() => ({
  value: [] as Record<string, unknown>[],
}));
vi.mock("@/hooks/useStudentLessons", () => ({
  useStudentLessons: () => ({
    lessons: lessons.value,
    live: true,
    loading: false,
    failed: false,
  }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: router.push, replace: vi.fn(), back: vi.fn() }),
}));

const lesson = (over: Record<string, unknown> = {}) => ({
  id: "l-1",
  lessonId: "l-1",
  title: "Adding Fractions",
  timeEstimate: "About 12 min",
  subject: "Mathematics",
  status: "not_started",
  ...over,
});

const body = () => document.body.textContent ?? "";

beforeEach(() => {
  lessons.value = [lesson()];
  router.push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("what a live lesson row says", () => {
  it("groups under the subject the lesson carries", () => {
    lessons.value = [
      lesson(),
      lesson({ id: "l-2", lessonId: "l-2", title: "The Lighthouse", subject: "English" }),
    ];

    render(<LessonsTab />);

    expect(screen.getByRole("heading", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "English" })).toBeInTheDocument();
  });

  it("stays ungrouped when a lesson carries no subject", () => {
    // Free text from the staged upload routes only, so plenty of lessons have
    // none - and a heading invented for them would name a subject nobody set.
    lessons.value = [lesson({ subject: undefined })];

    render(<LessonsTab />);

    expect(screen.getByText("Adding Fractions")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mathematics" })).toBeNull();
  });

  it("says how long the lesson is", () => {
    render(<LessonsTab />);

    expect(body()).toMatch(/About 12 min/);
  });

  it("marks a lesson in progress as a state when the row says no more", () => {
    /*
     * Design D21. Every in-progress card drew the same conic fill at 55%,
     * which a child reads as how far they are. With no true fraction for this
     * lesson, the mark carries no portion at all.
     */
    lessons.value = [lesson({ status: "in_progress" })];

    const { container } = render(<LessonsTab />);

    const mark = screen.getByRole("img", { name: "In progress" });
    expect(mark).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/conic-gradient|55%/);
  });

  it("fills the in-progress mark to the child's own place, in words aloud", () => {
    /*
     * Backend B51: the true fraction is on the wire, so D21's condition is
     * met and the frame's fill comes back - this child's, not a fixed 55%,
     * and spoken as a position, never a percentage.
     */
    lessons.value = [
      lesson({
        status: "in_progress",
        place: { fraction: 0.2, words: "Segment 3 of 10" },
      }),
    ];

    const { container } = render(<LessonsTab />);

    const mark = screen.getByRole("img", {
      name: "In progress. Segment 3 of 10",
    });
    expect(mark).toHaveAttribute("data-segment-fill");
    expect(container.innerHTML).not.toMatch(/55%|20%/);
  });

  it("draws no fill on a lesson that is not in progress", () => {
    lessons.value = [
      lesson({
        status: "completed",
        place: { fraction: 0.2, words: "Segment 3 of 10" },
      }),
    ];

    render(<LessonsTab />);

    expect(screen.getByRole("img", { name: "Completed" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Segment/ })).toBeNull();
  });
});

describe("the empty state names what is actually narrowing the list", () => {
  /*
   * In the frames' words now (Nevo Lessons Frame for a search, 29 Empty States
   * for a chip), and each control clears exactly what it names.
   */
  it("blames the search when there is a search", () => {
    render(<LessonsTab />);

    fireEvent.change(screen.getByPlaceholderText("Search lessons"), {
      target: { value: "zzzzz" },
    });

    expect(body()).toMatch(/No lessons match your search/i);
    expect(body()).toMatch(
      /Try a different word, or clear the search to see everything./,
    );
  });

  it("does not blame a search the child never made", () => {
    /*
     * The case the old copy got wrong. Nothing typed, a chip on, no matches -
     * and the screen said the search found nothing.
     */
    render(<LessonsTab />);

    fireEvent.click(screen.getByRole("button", { name: "Completed" }));

    expect(body()).not.toMatch(/your search/i);
    expect(body()).toMatch(/No completed lessons yet/);
  });

  it("restores the list from a chip with the control the frame draws", () => {
    // The half that made the old button look broken: it cleared the query and
    // left the chip, so tapping it changed nothing a child could see.
    render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.queryByText("Adding Fractions")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(screen.getByText("Adding Fractions")).toBeInTheDocument();
  });

  it("clears a search without touching a chip the child chose", () => {
    lessons.value = [lesson({ status: "completed" })];
    render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    fireEvent.change(screen.getByPlaceholderText("Search lessons"), {
      target: { value: "zzzzz" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByPlaceholderText("Search lessons")).toHaveValue("");
    expect(screen.getByText("Adding Fractions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Completed" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("never leaves a tap that changes nothing when both are narrowing", () => {
    // Clear search lands on the chip's own empty state, which names the chip
    // and offers to clear it - the screen moves on every tap.
    render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    fireEvent.change(screen.getByPlaceholderText("Search lessons"), {
      target: { value: "zzzzz" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(body()).toMatch(/No completed lessons yet/);

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByText("Adding Fractions")).toBeInTheDocument();
  });
});

describe("a child with nothing assigned yet", () => {
  it("is told in the frame's words, without a promise about what happens next", () => {
    lessons.value = [];

    render(<LessonsTab />);

    expect(body()).toMatch(/Your lessons will show up here soon/);
    expect(body()).not.toMatch(/When your teacher sets one/);
  });
});

describe("starting a lesson from its preview", () => {
  it("carries the assignment the card came from", () => {
    // The player reads `?assignment=` and sends it on every progress write.
    lessons.value = [lesson({ assignmentId: "as-9" })];
    render(<LessonsTab />);

    fireEvent.click(screen.getByRole("button", { name: /Adding Fractions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(router.push).toHaveBeenCalledWith(
      "/student/lessons/l-1?assignment=as-9",
    );
  });

  it("sends a library lesson in bare, which is the truth about it", () => {
    render(<LessonsTab />);

    fireEvent.click(screen.getByRole("button", { name: /Adding Fractions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(router.push).toHaveBeenCalledWith("/student/lessons/l-1");
  });

  it("shows the lesson's own what-you'll-do line, and none when it has none", () => {
    lessons.value = [lesson({ description: "Add fractions with pizza." })];
    const { unmount } = render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: /Adding Fractions/ }));
    expect(screen.getByText("Add fractions with pizza.")).toBeInTheDocument();
    unmount();

    lessons.value = [lesson()];
    render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: /Adding Fractions/ }));
    expect(screen.getByRole("dialog").textContent).not.toMatch(/pizza/);
  });
});
