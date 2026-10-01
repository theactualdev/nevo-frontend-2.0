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

/** Each card's own narrowed read, keyed by the subject it was asked for. */
const narrowed = vi.hoisted(() => ({
  bySubject: {} as Record<string, { note: string | null; loading?: boolean; failed?: boolean }>,
  asked: [] as (string | null)[],
}));
vi.mock("@/hooks/useSubjectProgress", () => ({
  useSubjectProgress: (subject: string | null) => {
    narrowed.asked.push(subject);
    const own = (subject && narrowed.bySubject[subject]) || { note: null };
    return {
      reflection: null,
      lessons: [],
      note: own.note,
      loading: own.loading ?? false,
      failed: own.failed ?? false,
    };
  },
}));

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

beforeEach(() => {
  state({});
  narrowed.bySubject = {};
  narrowed.asked = [];
});

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

/**
 * Backend B29 and design D42, 1 Oct. The frame draws a short note per subject
 * card and the contract had only a paragraph, so the cards carried concept
 * names. `note` now arrives, written short; a card shows its own subject's,
 * and the names where the backend wrote none.
 */
describe("the line under each subject", () => {
  it("is the backend's note for that subject, as written", () => {
    state({
      subjects: [subject("Mathematics", ["Fractions"]), subject("English", ["Verbs"])],
    });
    narrowed.bySubject = {
      Mathematics: { note: "Getting quicker with fractions" },
      English: { note: "Reading longer stories" },
    };

    render(<ProgressTab />);

    expect(screen.getByText("Getting quicker with fractions")).toBeInTheDocument();
    expect(screen.getByText("Reading longer stories")).toBeInTheDocument();
    // Read per subject, from the narrowed route - the whole-student note is
    // about everything, not about one card.
    expect(narrowed.asked).toEqual(
      expect.arrayContaining(["Mathematics", "English"]),
    );
    expect(screen.queryByText("Fractions")).toBeNull();
  });

  it("falls back to concept names when there is no note", () => {
    state({ subjects: [subject("Mathematics", ["Fractions", "Decimals"])] });
    narrowed.bySubject = { Mathematics: { note: null } };

    render(<ProgressTab />);

    expect(screen.getByText("Fractions · Decimals")).toBeInTheDocument();
  });

  it("falls back to concept names when the subject's read fails", () => {
    // The names are already here and true; a failed read is not "no note".
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = { Mathematics: { note: null, failed: true } };

    render(<ProgressTab />);

    expect(screen.getByText("Fractions")).toBeInTheDocument();
  });

  it("holds the line rather than showing names that a note will replace", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = { Mathematics: { note: null, loading: true } };

    render(<ProgressTab />);

    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Fractions")).toBeNull();
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
