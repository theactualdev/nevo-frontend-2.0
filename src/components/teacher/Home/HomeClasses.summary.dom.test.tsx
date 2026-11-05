import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  classes: vi.fn(),
  summaries: vi.fn(),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses: h.classes }));
vi.mock("@/hooks/useClassSummaries", () => ({ useClassSummaries: h.summaries }));

import { HomeClasses } from "./HomeClasses";

/**
 * C03's class trio with live data (backlog item 5, 2 Nov audit): one card per
 * class, its subjects, and the status line the class page's own counts give.
 */

const assignment = (classId: string, className: string, subject: string | null) => ({
  assignmentId: `${classId}-${subject}`,
  classId,
  className,
  classCode: null,
  role: "primary",
  assignedAt: "2026-10-08T09:00:00Z",
  subject,
});

const live = (liveClasses: ReturnType<typeof assignment>[]) => ({
  classes: [],
  liveClasses,
  options: [],
  live: true,
  sample: false,
  loading: false,
});

const counts = (glance: number, flagged: number, cantSignIn: number) => ({ glance, flagged, cantSignIn });

beforeEach(() => {
  h.classes.mockReturnValue(
    live([
      assignment("c-1", "JSS 2A", "Mathematics"),
      assignment("c-1", "JSS 2A", "English"),
      assignment("c-2", "SSS 1", "Biology"),
    ]),
  );
  h.summaries.mockReturnValue({ counts: new Map(), loading: false });
});

describe("HomeClasses - one card per class", () => {
  it("shows a class taught for two subjects once, naming both", () => {
    render(<HomeClasses />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Mathematics · English")).toBeInTheDocument();
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(h.summaries).toHaveBeenLastCalledWith(["c-1", "c-2"]);
  });
});

describe("HomeClasses - the status line", () => {
  it("says who is worth a glance, in the frame's long and short words", () => {
    h.summaries.mockReturnValue({ counts: new Map([["c-1", counts(3, 0, 0)]]), loading: false });
    render(<HomeClasses />);

    expect(screen.getByText("3 worth a glance")).toBeInTheDocument();
    expect(screen.getByText("3 to glance")).toBeInTheDocument();
  });

  it("names a sudden change as flagged rather than calling the class on track", () => {
    h.summaries.mockReturnValue({ counts: new Map([["c-1", counts(0, 1, 0)]]), loading: false });
    render(<HomeClasses />);

    expect(screen.getAllByText("1 flagged")).toHaveLength(2);
    expect(screen.queryByText("All on track")).toBeNull();
  });

  it("says All on track when the class was counted and nothing is open", () => {
    h.summaries.mockReturnValue({ counts: new Map([["c-1", counts(0, 0, 0)]]), loading: false });
    render(<HomeClasses />);

    expect(screen.getByText("All on track")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it("keeps the quiet line, not a status, for a class that couldn't be counted", () => {
    h.summaries.mockReturnValue({ counts: new Map([["c-1", counts(0, 0, 0)]]), loading: false });
    render(<HomeClasses />);

    // SSS 1 has no entry: it says nothing about how the class is doing.
    expect(screen.getAllByText("All on track")).toHaveLength(1);
    expect(screen.getByText("Synced from your school")).toBeInTheDocument();
  });

  it("holds the line while the counts are still coming", () => {
    h.summaries.mockReturnValue({ counts: new Map(), loading: true });
    render(<HomeClasses />);

    expect(screen.queryByText("Synced from your school")).toBeNull();
    expect(screen.queryByText(/on track/i)).toBeNull();
  });
});
