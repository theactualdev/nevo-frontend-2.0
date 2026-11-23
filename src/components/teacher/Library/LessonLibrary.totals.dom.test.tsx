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

  /*
   * C06 at each width (SCRUM-347, item 5): desktop caps the row at 640 with 16
   * between; a tablet runs it the full width at 12, with its smaller card.
   */
  it("sits the row as the frame does at each width", () => {
    h.useLibraryTotals.mockReturnValue({ lessonsUploaded: 214, liveToClasses: 37, inReview: 5 });
    render(<LessonLibrary />);

    const card = screen.getByText("Lessons uploaded").parentElement!;
    const row = card.parentElement!.className.split(" ");
    expect(row).toEqual(expect.arrayContaining(["grid-cols-3", "gap-3", "xl:max-w-[640px]", "xl:gap-4"]));
    expect(row.some((c) => c.startsWith("max-w-"))).toBe(false);
    expect(card.className.split(" ")).toEqual(
      expect.arrayContaining(["p-4", "gap-[5px]", "xl:px-[22px]", "xl:py-5", "xl:gap-1.5"]),
    );
    expect(screen.getByText("214").className.split(" ")).toEqual(
      expect.arrayContaining(["text-[28px]", "xl:text-[34px]"]),
    );
  });

  it("draws no cards over totals that did not come back", () => {
    h.useLibraryTotals.mockReturnValue(null);
    render(<LessonLibrary />);

    expect(screen.queryByText("Lessons uploaded")).not.toBeInTheDocument();
  });
});
