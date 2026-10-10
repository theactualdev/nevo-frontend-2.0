import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/hooks/useHasSession", () => ({
  useHasSession: () => session.signedIn,
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));

/** Each card's own narrowed read, keyed by the subject it was asked for. */
const narrowed = vi.hoisted(() => ({
  bySubject: {} as Record<
    string,
    {
      note: string | null;
      loading?: boolean;
      failed?: boolean;
      topics?: { done: number; total: number } | null;
      currentTopic?: string | null;
    }
  >,
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
      topics: own.topics ?? null,
      currentTopic: own.currentTopic ?? null,
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
  session.signedIn = true;
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

/**
 * Design D103, 6 Oct: with lessons begun and no subject cards yet, "the
 * reflection stands alone at full width; the subject-card grid is suppressed,
 * not drawn empty." The caps that sized it to sit over cards go with them.
 */
describe("the reflection with no subject cards under it", () => {
  const caps = /max-w-\[(300|560|640)px\]/;

  it("stands alone at full width, with no grid drawn", () => {
    state({
      lessons: [LESSON],
      reflection: "You finished a whole lesson this week.",
    });

    const { container } = render(<ProgressTab />);

    const para = screen.getByText("You finished a whole lesson this week.");
    expect(para.className).not.toMatch(caps);
    expect(container.querySelector(".grid")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps the frame's measure where cards sit below it", () => {
    state({
      subjects: [subject("Mathematics")],
      reflection: "You finished a whole lesson this week.",
    });

    render(<ProgressTab />);

    const para = screen.getByText("You finished a whole lesson this week.");
    expect(para.className).toMatch(/\bmax-w-\[300px\]/);
    expect(para.className).toMatch(/\bsm:max-w-\[560px\]/);
    expect(para.className).toMatch(/\blg:max-w-\[640px\]/);
  });
});

/** The block at the foot of a card that holds its note (33a, D120). */
const footNote = (card: HTMLElement) =>
  card.querySelector("[data-subject-note]") as HTMLElement | null;

/**
 * The signed-out walkthrough still drew the note-per-card layout after the
 * live cards took 33a's topic squares (B53). It is what a real card looks
 * like, so it draws what a real card draws.
 */
describe("the signed-out walkthrough's subject cards", () => {
  const card = (name: string) =>
    screen.getByRole("link", { name: new RegExp(name) }) as HTMLElement;
  const marks = (el: HTMLElement) =>
    [...el.querySelectorAll("[data-topic]")].map((m) =>
      m.getAttribute("data-topic"),
    );

  it("draws 33a's squares and 'Working on' line, as a real card does, and no count", () => {
    session.signedIn = false;

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(
      within(maths).getByText("Working on Equivalent fractions"),
    ).toBeInTheDocument();
    expect(marks(maths)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "open",
      "open",
      "open",
      "open",
    ]);
    // D119: no "3 of 8 topics done", or any count, on the card.
    expect(maths.textContent).not.toMatch(/\d|topics done/);
    // The walkthrough's cards take 33a's lines under the squares too.
    expect(within(maths).getByText("More topics to come")).toBeInTheDocument();
    expect(
      within(card("English")).getByText(
        "New topics appear here when your teacher adds them",
      ),
    ).toBeInTheDocument();
  });

  it("puts the frame's note at the foot of the card, beside a named topic", () => {
    session.signedIn = false;

    render(<ProgressTab />);

    const note = footNote(card("Mathematics"));
    expect(note).toHaveTextContent(
      "Fractions are starting to click. You stayed with a tricky one today before it came.",
    );
  });

  it("draws the names where no topic is named, the squares alone at all done", () => {
    session.signedIn = false;

    render(<ProgressTab />);

    const english = card("English");
    expect(
      within(english).getByText(
        "Rhyming words · Describing words · Story beginnings",
      ),
    ).toBeInTheDocument();
    expect(marks(english)).toEqual(["done", "done", "done", "done", "done"]);
    expect(english.textContent).not.toMatch(/\d|Working on|Everything set/);
    expect(footNote(english)).toHaveTextContent(
      "A really steady run this term. Reading aloud has got noticeably easier.",
    );
  });

  it("draws no note block for the subject the frame gives none", () => {
    session.signedIn = false;

    render(<ProgressTab />);

    expect(footNote(card("Science"))).toBeNull();
  });

  it("shows no percentage, anywhere", () => {
    session.signedIn = false;

    const { container } = render(<ProgressTab />);

    expect(container.textContent).not.toMatch(/%/);
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
 * Backend B29 and design D42, 1 Oct; design D120, 6 Oct. The note arrives
 * written short, and a card shows its own subject's - at the FOOT of the
 * card, below the facts, as 33a was redrawn. It used to be the line under the
 * name, standing in for the concept names; the names keep that line now
 * wherever no topic is named.
 */
describe("the note at the foot of each subject card", () => {
  const card = (name: string) =>
    screen.getByRole("link", { name: new RegExp(name) }) as HTMLElement;

  it("is the backend's note for that subject, as written", () => {
    state({
      subjects: [subject("Mathematics", ["Fractions"]), subject("English", ["Verbs"])],
    });
    narrowed.bySubject = {
      Mathematics: { note: "Getting quicker with fractions" },
      English: { note: "Reading longer stories" },
    };

    render(<ProgressTab />);

    expect(footNote(card("Mathematics"))).toHaveTextContent(
      "Getting quicker with fractions",
    );
    expect(footNote(card("English"))).toHaveTextContent(
      "Reading longer stories",
    );
    // Read per subject, from the narrowed route - the whole-student note is
    // about everything, not about one card.
    expect(narrowed.asked).toEqual(
      expect.arrayContaining(["Mathematics", "English"]),
    );
  });

  it("sits below the name, the line and the squares", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: {
        note: "Getting quicker with fractions",
        topics: { done: 3, total: 8 },
        currentTopic: "Halves",
      },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    const note = footNote(maths)!;
    const squares = maths.querySelector("[data-topic-marks]")!;
    const line = within(maths).getByText("Working on Halves");
    expect(
      squares.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      line.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Its own block, not the line under the name.
    expect(line).not.toHaveTextContent(/quicker/);
  });

  it("draws no block at all where the backend wrote none", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = { Mathematics: { note: null } };

    render(<ProgressTab />);

    expect(footNote(card("Mathematics"))).toBeNull();
  });

  it("keeps the line for the concept names when there is a note", () => {
    state({ subjects: [subject("Mathematics", ["Fractions", "Decimals"])] });
    narrowed.bySubject = { Mathematics: { note: "A note about maths" } };

    render(<ProgressTab />);

    expect(screen.getByText("Fractions · Decimals")).toBeInTheDocument();
  });

  it("falls back to concept names when the subject's read fails", () => {
    // The names are already here and true; a failed read is not "no note".
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = { Mathematics: { note: null, failed: true } };

    render(<ProgressTab />);

    expect(screen.getByText("Fractions")).toBeInTheDocument();
    expect(footNote(card("Mathematics"))).toBeNull();
  });

  it("holds the line, and draws no note, while the subject is still being read", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: { note: "A note about maths", loading: true },
    };

    render(<ProgressTab />);

    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Fractions")).toBeNull();
    expect(footNote(card("Mathematics"))).toBeNull();
  });
});

/**
 * Backend B53, 5 Oct: the subject read carries `topicsDone`, `topicsTotal`
 * and `currentTopic`, and 33a draws them as a square per topic and "Working
 * on X". The total is topics this child has met.
 *
 * NEVER AS A NUMBER (design D119, 6 Oct): "No counts on a child's card, in
 * any form. '0 of 4' and '5 of 5' both read as a grade". 33a's lines for none
 * and all-done speak of topics SET, which the wire does not count, so they
 * are not drawn either; asked.
 */
describe("the topics on a subject card", () => {
  const card = (name: string) =>
    screen.getByRole("link", { name: new RegExp(name) }) as HTMLElement;
  const marks = (el: HTMLElement) =>
    [...el.querySelectorAll("[data-topic]")].map((m) =>
      m.getAttribute("data-topic"),
    );

  it("draws 33a's work-in-progress card as the frame does, less the count", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: {
        note: "A note about maths",
        topics: { done: 3, total: 8 },
        currentTopic: "Equivalent fractions",
      },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(within(maths).getByText("Working on Equivalent fractions")).toBeInTheDocument();
    expect(marks(maths)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "open",
      "open",
      "open",
      "open",
    ]);
    expect(maths.textContent).not.toMatch(/3 of 8|topics done/);
    // 33a's slot, redrawn on 8 Oct (851d58f) in words with no count.
    expect(within(maths).getByText("More topics to come")).toBeInTheDocument();
    // D120: the note no longer gives way to "Working on" - it has its own
    // place at the foot.
    expect(footNote(maths)).toHaveTextContent("A note about maths");
  });

  it.each([
    ["none of them done", { done: 0, total: 4 }, "Halves"],
    ["some of them done", { done: 3, total: 8 }, "Halves"],
    ["all of them done", { done: 5, total: 5 }, null],
    ["some done, no topic named", { done: 2, total: 6 }, null],
  ])(
    "prints no count of the topics met, with %s",
    (_, topics, currentTopic) => {
      state({ subjects: [subject("Mathematics", ["Fractions"])] });
      narrowed.bySubject = {
        Mathematics: { note: null, topics, currentTopic },
      };

      render(<ProgressTab />);

      const maths = card("Mathematics");
      expect(maths.querySelector("[data-topic-marks]")).not.toBeNull();
      expect(maths.textContent).not.toMatch(/\d/);
      // A count in words is still a count. "More topics to come" (8 Oct)
      // says none.
      expect(maths.textContent).not.toMatch(/topics (done|set|met)|of the topics/i);
    },
  );

  it("draws nothing of the topics when the backend counted none", () => {
    // Rule 5: 0 is the schema's default, so absent and 0 alike draw nothing.
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: { note: "A note about maths", topics: null },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(footNote(maths)).toHaveTextContent("A note about maths");
    expect(maths.querySelector("[data-topic-marks]")).toBeNull();
    expect(maths.textContent).not.toMatch(/topics|Working on/);
  });

  it("says no 'Working on' with nothing after it", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: { note: null, topics: { done: 3, total: 8 }, currentTopic: null },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(maths.textContent).not.toMatch(/Working on/);
    expect(within(maths).getByText("Fractions")).toBeInTheDocument();
    // And no square claims a topic is being worked on that nobody named.
    expect(marks(maths)).not.toContain("current");
  });

  it("claims nothing started when none of the topics met is done yet", () => {
    // 33a's line for that state speaks of topics set, which the wire does
    // not count. Asked of design.
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: {
        note: null,
        topics: { done: 0, total: 4 },
        currentTopic: "Halves",
      },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(within(maths).getByText("Working on Halves")).toBeInTheDocument();
    expect(maths.textContent).not.toMatch(/Nothing started|ready when you are/i);
    // A topic named as being worked on is 33a's progress state.
    expect(within(maths).getByText("More topics to come")).toBeInTheDocument();
    expect(marks(maths)).toEqual(["current", "open", "open", "open"]);
  });

  it("claims nothing set when every topic met is done", () => {
    state({ subjects: [subject("English", ["Verbs"])] });
    narrowed.bySubject = {
      English: { note: "A note about English", topics: { done: 5, total: 5 } },
    };

    render(<ProgressTab />);

    const english = card("English");
    // 33a's done line under the squares (851d58f), not its "Everything set
    // so far is done", which speaks of topics set.
    expect(
      within(english).getByText(
        "New topics appear here when your teacher adds them",
      ),
    ).toBeInTheDocument();
    expect(english.textContent).not.toMatch(/Everything set|More topics to come/);
    expect(marks(english)).toEqual(["done", "done", "done", "done", "done"]);
    expect(footNote(english)).toHaveTextContent("A note about English");
  });

  it("says Ready when you are under the squares when nothing is done and nothing is named", () => {
    // 33a's "none" state (851d58f). Not its "Nothing started yet", which
    // speaks of topics set; the line above stays the concept names.
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: { note: null, topics: { done: 0, total: 4 }, currentTopic: null },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(within(maths).getByText("Ready when you are")).toBeInTheDocument();
    expect(maths.textContent).not.toMatch(/More topics to come|Nothing started/);
  });

  it("holds the topics with the line while the subject is still being read", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: {
        note: null,
        loading: true,
        topics: { done: 3, total: 8 },
        currentTopic: "Equivalent fractions",
      },
    };

    render(<ProgressTab />);

    const maths = card("Mathematics");
    expect(maths.querySelector("[data-topic-marks]")).toBeNull();
    expect(maths.textContent).not.toMatch(/Working on/);
  });

  it("shows no percentage, anywhere", () => {
    state({ subjects: [subject("Mathematics", ["Fractions"])] });
    narrowed.bySubject = {
      Mathematics: { note: null, topics: { done: 3, total: 8 }, currentTopic: "Halves" },
    };

    const { container } = render(<ProgressTab />);

    expect(container.textContent).not.toMatch(/%/);
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
