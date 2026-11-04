import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ useLessonLibrary: vi.fn(), useLibraryTotals: vi.fn() }));
vi.mock("@/hooks/useLessonLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useLessonLibrary")>();
  return { ...actual, useLessonLibrary: h.useLessonLibrary, useLibraryTotals: h.useLibraryTotals };
});

import { LessonLibrary } from "./LessonLibrary";

/**
 * C06's stat cards (backlog item 13): the SERVER's own totals across the
 * whole library (SCRUM-245), never summed from the cards on screen, and
 * absent over a read that did not come back.
 */

const card = {
  id: "l-1",
  title: "Fractions 3",
  subject: "Mathematics",
  status: "Ready" as const,
  kind: "normal" as const,
  needsReview: false,
  meta: "6 sections · PDF",
  footer: "Not yet assigned",
};

beforeEach(() => {
  h.useLessonLibrary.mockReturnValue({
    cards: [card],
    live: true,
    sample: false,
    loading: false,
    slow: false,
    capped: false,
  });
});

describe("the library's stat cards", () => {
  it("shows the server's three totals, whatever is on screen", () => {
    h.useLibraryTotals.mockReturnValue({ lessonsUploaded: 214, liveToClasses: 37, inReview: 5 });
    render(<LessonLibrary />);

    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.getByText("Lessons uploaded")).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("Live to classes")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
  });

  it("draws no cards over totals that did not come back", () => {
    h.useLibraryTotals.mockReturnValue(null);
    render(<LessonLibrary />);

    expect(screen.queryByText("Lessons uploaded")).not.toBeInTheDocument();
  });
});
