import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useLessonLibrary } = vi.hoisted(() => ({ useLessonLibrary: vi.fn() }));
vi.mock("@/hooks/useLessonLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useLessonLibrary")>();
  return { ...actual, useLessonLibrary };
});

import { LessonLibrary } from "./LessonLibrary";

/**
 * C06's result line, no-match card and selected pill. The line showed only
 * under a search; the no-match state was our own illustration and words; the
 * selected pill was a solid fill the frame says it must not be.
 */

const card = (id: string, title: string, subject: string) => ({
  id,
  title,
  subject,
  status: "Ready" as const,
  kind: "normal" as const,
  needsReview: false,
  meta: "6 sections · PDF",
  footer: "Not yet assigned",
});
const CARDS = [
  card("l-1", "Fractions 3", "Mathematics"),
  card("l-2", "Photosynthesis", "Science"),
  card("l-3", "Angles", "Mathematics"),
];

const state = (over: Record<string, unknown> = {}) =>
  useLessonLibrary.mockReturnValue({
    cards: CARDS,
    live: true,
    sample: false,
    loading: false,
    slow: false,
    capped: false,
    ...over,
  });

const search = (text: string) =>
  fireEvent.change(screen.getByLabelText("Search lessons"), { target: { value: text } });

beforeEach(() => {
  useLessonLibrary.mockReset();
});

describe("the result line", () => {
  it("says how many are in the library before anything is filtered", () => {
    state();
    render(<LessonLibrary />);

    expect(screen.getByText("3 lessons in your library")).toBeInTheDocument();
  });

  it("says how many, and in what, once a subject is picked", () => {
    state();
    render(<LessonLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Mathematics" }));

    expect(screen.getByText("2 lessons in Mathematics")).toBeInTheDocument();
  });

  it("names the search, and the subject with it", () => {
    state();
    render(<LessonLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Mathematics" }));
    search("angle");

    expect(screen.getByText("1 lesson in Mathematics matching “angle”")).toBeInTheDocument();
  });

  it("claims no library size when the read came back capped", () => {
    state({ capped: true });
    render(<LessonLibrary />);

    expect(screen.queryByText(/in your library$/)).not.toBeInTheDocument();
  });

  it("counts no sample lessons for a signed-in teacher", () => {
    state({ live: false, sample: true });
    render(<LessonLibrary />);

    expect(screen.queryByText(/lessons in your library/)).not.toBeInTheDocument();
  });
});

describe("when nothing matches", () => {
  it("names the search in C06's own words", () => {
    state();
    render(<LessonLibrary />);
    search("volcanoes");

    expect(
      screen.getByText("No lessons match “volcanoes”. Try another subject or clear the search."),
    ).toBeInTheDocument();
  });

  it("names the subject and the search together", () => {
    state();
    render(<LessonLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Science" }));
    search("angle");

    expect(
      screen.getByText("No lessons match “angle” in Science. Try another subject or clear the search."),
    ).toBeInTheDocument();
  });
});

describe("the subject pills", () => {
  it("tints the picked one violet rather than filling it", () => {
    state();
    render(<LessonLibrary />);
    const maths = screen.getByRole("button", { name: "Mathematics" });
    fireEvent.click(maths);

    expect(maths.className).toMatch(/bg-nevo-violet\/28/);
    expect(maths.className).not.toMatch(/bg-nevo-navy\b/);
    expect(screen.getByRole("button", { name: "All" }).className).toMatch(/bg-nevo-cream-elevated/);
  });
});

describe("the search box (C10)", () => {
  it("shows where focus is before anything is typed", () => {
    // `outline-none` took the browser's ring and gave nothing back: an empty
    // box looked the same focused as not.
    state();
    render(<LessonLibrary />);

    expect(screen.getByLabelText("Search lessons").className).toMatch(/\bfocus:border-nevo-navy\b/);
  });
});
