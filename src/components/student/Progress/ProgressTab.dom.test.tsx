import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressTab, textureFor } from "./ProgressTab";
import { subjectSlug } from "@/hooks/useStudentProgress";

/**
 * Three things the Progress tab told a child that were not so.
 *
 * 1. Every card drew the same rising curve, so every child read every subject
 *    as going up. SCRUM-144 replaced it with a per-subject texture a child
 *    cannot read as trend, improvement or decline.
 * 2. A child with finished lessons was told there was nothing to show, because
 *    the gate looked at subject-bearing concepts and nothing else.
 * 3. Subjects differing only in case shared one link, and a non-ASCII name was
 *    stripped to nonsense ("Yorùbá" -> "yor-b-").
 */

const progress = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/hooks/useStudentProgress", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useStudentProgress")>()),
  useStudentProgress: () => progress.state,
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));

const subject = (name: string, concepts = ["Fractions"]) => ({
  slug: subjectSlug(name),
  name,
  concepts: concepts.map((c, i) => ({
    conceptId: `${name}-${i}`,
    name: c,
    understanding: 0.5,
    practiceCount: 1,
  })),
});

const state = (over: Record<string, unknown>) => {
  progress.state = {
    subjects: [],
    lessons: [],
    reflection: null,
    highlights: [],
    loading: false,
    failed: false,
    live: true,
    ...over,
  };
};

const LESSON = {
  lessonId: "l-1",
  title: "Adding Fractions",
  status: "completed",
  modulePosition: 0,
  segmentPosition: 3,
  updatedAt: new Date().toISOString(),
};

beforeEach(() => state({}));

describe("who is told there is nothing to show", () => {
  it("a child who has done nothing yet, in the frame's words", () => {
    render(<ProgressTab />);

    expect(
      screen.getByText("Your progress will show here as you complete lessons"),
    ).toBeInTheDocument();
  });

  it("not a child with finished lessons, even with no subject on them", () => {
    state({
      lessons: [LESSON],
      reflection: "You finished a whole lesson this week.",
    });

    render(<ProgressTab />);

    expect(screen.queryByText(/Your progress will show here/)).toBeNull();
    expect(
      screen.getByText("You finished a whole lesson this week."),
    ).toBeInTheDocument();
  });

  it("does not introduce cards that are not there", () => {
    // The claim-free fallback line points at the cards below it.
    state({ lessons: [LESSON], reflection: "" });

    render(<ProgressTab />);

    expect(screen.queryByText(/Here’s what you’ve been working on/)).toBeNull();
  });
});

describe("the subject card's band", () => {
  it("draws no rising line", () => {
    state({ subjects: [subject("Mathematics")] });

    const { container } = render(<ProgressTab />);

    // The old curve: one fixed upward cubic on every card.
    expect(container.innerHTML).not.toMatch(/C70 94 100 60 140 52/);
    expect(container.querySelector("[data-texture]")).not.toBeNull();
  });

  it("is the subject's, not the child's - the same whatever the work", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    const first = render(<ProgressTab />);
    const a = first.container
      .querySelector("[data-texture]")
      ?.getAttribute("data-texture");
    first.unmount();

    state({
      subjects: [subject("Mathematics", ["Decimals", "Ratios", "Angles"])],
    });
    const second = render(<ProgressTab />);
    const b = second.container
      .querySelector("[data-texture]")
      ?.getAttribute("data-texture");

    expect(a).toBe(b);
    const t = textureFor("Mathematics");
    expect(a).toBe(`${t.motif}-${t.family}`);
  });
});

describe("the subject grid and its links", () => {
  it("is one column on a phone, never a sideways scroller", () => {
    state({ subjects: [subject("Mathematics"), subject("English")] });

    const { container } = render(<ProgressTab />);

    const grid = screen.getAllByRole("link")[0].parentElement!;
    expect(grid.className).toMatch(/\bgrid-cols-1\b/);
    expect(container.innerHTML).not.toMatch(/overflow-x-auto/);
  });

  it("gives subjects that differ only in case their own pages", () => {
    state({ subjects: [subject("Mathematics"), subject("mathematics")] });

    render(<ProgressTab />);

    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(2);
  });

  it("keeps a name with accents whole", () => {
    state({ subjects: [subject("Yorùbá")] });

    render(<ProgressTab />);

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      `/student/progress/${encodeURIComponent("Yorùbá")}`,
    );
  });
});
