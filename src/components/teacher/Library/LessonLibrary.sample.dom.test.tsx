import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useLessonLibrary } = vi.hoisted(() => ({ useLessonLibrary: vi.fn() }));
vi.mock("@/hooks/useLessonLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useLessonLibrary")>();
  return { ...actual, useLessonLibrary };
});

import { LessonLibrary } from "./LessonLibrary";
import { sampleRegions } from "@/lib/sampleData";

/**
 * THE LIBRARY WAS THE ONE TEACHER FALLBACK WITH NO MARK.
 *
 * A failed read put eight invented lessons in front of a signed-in teacher
 * with an italic line and nothing else, and the signed-in end-to-end check on
 * /teacher/lessons - written to catch exactly this - passed, because it
 * counts `data-nevo-sample` and there was none.
 */

const card = (id: string, title: string) => ({
  id,
  title,
  status: "Ready" as const,
  kind: "normal" as const,
  needsReview: false,
  meta: "6 sections · PDF",
  footer: "Not yet assigned",
});
const CARDS = [card("l-1", "Fractions 3"), card("l-2", "Photosynthesis")];

const state = (over: Record<string, unknown> = {}) =>
  useLessonLibrary.mockReturnValue({
    cards: CARDS,
    live: true,
    sample: false,
    loading: false,
    slow: false,
    ...over,
  });

beforeEach(() => {
  useLessonLibrary.mockReset();
});

describe("the lessons on the shelf", () => {
  it("are marked as samples when the read failed", () => {
    state({ live: false, sample: true });
    render(<LessonLibrary />);

    expect(screen.getByText("Fractions 3")).toBeInTheDocument();
    expect(sampleRegions()).toEqual(["teacher:library"]);
  });

  it("are marked on the signed-out walkthrough too", () => {
    state({ live: false, sample: false });
    render(<LessonLibrary />);

    expect(sampleRegions()).toEqual(["teacher:library"]);
  });

  it("carry no mark when they are the teacher's own", () => {
    state();
    render(<LessonLibrary />);

    expect(screen.getByText("Fractions 3")).toBeInTheDocument();
    expect(sampleRegions()).toEqual([]);
  });
});
