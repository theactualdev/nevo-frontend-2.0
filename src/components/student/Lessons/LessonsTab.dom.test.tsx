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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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
});

describe("the empty state names what is actually narrowing the list", () => {
  it("blames the search when there is a search", () => {
    render(<LessonsTab />);

    fireEvent.change(screen.getByPlaceholderText("Search lessons"), {
      target: { value: "zzzzz" },
    });

    expect(body()).toMatch(/No lessons match your search/i);
  });

  it("does not blame a search the child never made", () => {
    /*
     * The case the old copy got wrong. Nothing typed, a chip on, no matches -
     * and the screen said the search found nothing.
     */
    render(<LessonsTab />);

    fireEvent.click(screen.getByRole("button", { name: "Completed" }));

    expect(body()).not.toMatch(/your search/i);
    expect(body()).toMatch(/Nothing in that group yet/i);
  });

  it("restores the list from a chip, not just from a query", () => {
    // The half that made the old button look broken: it cleared the query and
    // left the chip, so tapping it changed nothing a child could see.
    render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.queryByText("Adding Fractions")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all lessons" }));

    expect(screen.getByText("Adding Fractions")).toBeInTheDocument();
  });

  it("restores the list when both a search and a chip are narrowing it", () => {
    render(<LessonsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    fireEvent.change(screen.getByPlaceholderText("Search lessons"), {
      target: { value: "zzzzz" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Show all lessons" }));

    expect(screen.getByText("Adding Fractions")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search lessons")).toHaveValue("");
  });
});
