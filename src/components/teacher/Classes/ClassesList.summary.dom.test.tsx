import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  classes: vi.fn(),
  summaries: vi.fn(),
  home: vi.fn(),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses: h.classes }));
vi.mock("@/hooks/useClassSummaries", () => ({ useClassSummaries: h.summaries }));
vi.mock("@/hooks/useTeacherHome", () => ({ useTeacherHome: h.home }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));

import { ClassesList } from "./ClassesList";

/**
 * C05's live class cards (backlog item 6, 2 Nov audit): one per class, the
 * subjects and headcount, and the summary row the class page's own header
 * counts give - including who can't sign in, which Home counts too since 7 Nov.
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

const counts = (glance: number, flagged: number, cantSignIn: number) => ({ glance, flagged, cantSignIn });

beforeEach(() => {
  h.classes.mockReturnValue({
    classes: [],
    liveClasses: [
      assignment("c-1", "JSS 2A", "Mathematics"),
      assignment("c-1", "JSS 2A", "English"),
      assignment("c-2", "JSS 2B", null),
    ],
    options: [],
    live: true,
    sample: false,
    loading: false,
  });
  h.home.mockReturnValue({ pulse: [{ classId: "c-1", studentCount: 16 }] });
  h.summaries.mockReturnValue({ counts: new Map(), loading: false });
});

describe("ClassesList - one card per class", () => {
  it("shows a class taught for two subjects once, with its subjects and headcount", () => {
    render(<ClassesList />);

    // Desktop grid and tablet stack are both in the DOM under jsdom.
    expect(screen.getAllByText("JSS 2A")).toHaveLength(2);
    expect(screen.getByText("Mathematics · English")).toBeInTheDocument();
    expect(screen.getByText("Mathematics · English · 16 students")).toBeInTheDocument();
    expect(h.summaries).toHaveBeenLastCalledWith(["c-1", "c-2"]);
  });

  it("keeps the quiet line for a class with neither subjects nor a headcount", () => {
    render(<ClassesList />);

    expect(screen.getAllByText("Synced from your school")).toHaveLength(2);
  });
});

describe("ClassesList - the summary row", () => {
  it("counts each state on its own, can't sign in included", () => {
    h.summaries.mockReturnValue({ counts: new Map([["c-1", counts(2, 0, 3)]]), loading: false });
    render(<ClassesList />);

    expect(screen.getAllByText("2 worth a glance · 3 can’t sign in")).toHaveLength(2);
  });

  it("says Everyone on track when the class was counted and nothing is open", () => {
    h.summaries.mockReturnValue({ counts: new Map([["c-2", counts(0, 0, 0)]]), loading: false });
    render(<ClassesList />);

    expect(screen.getAllByText("Everyone on track")).toHaveLength(2);
  });

  it("draws no summary for a class that couldn't be counted", () => {
    render(<ClassesList />);

    expect(screen.queryByText(/on track|worth a glance|can’t sign in/)).toBeNull();
  });
});
