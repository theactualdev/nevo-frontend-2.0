import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SubjectDetail } from "./SubjectDetail";
import { SUBJECT_DETAIL } from "./progressData";
import { textureFor } from "./ProgressTab";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Two things, both about a child being told something true and then given
 * nothing to do about it.
 *
 * 1. THE SPACED-RETRIEVAL LOOP HAD NO ENTRANCE. The route
 *    (`/student/lessons/<id>/review-session`), the player variant behind it and
 *    the schedule read (`useDueReviews`) all existed and all worked. Nothing
 *    linked them: the "Ready for another look" concepts rendered as plain
 *    `<span>`s, and `useDueReviews.playable` - the hook's own map of which due
 *    concepts can actually be opened - had no reader anywhere in the tree. So a
 *    child was told a concept was ready and could not take another look at it.
 *
 * 2. The signed-in heading fell back to `subject`, which is documented one line
 *    above its own declaration as "the designed fixture, for the signed-out
 *    walkthrough". A signed-in render must not read the fixtures at all.
 */

const hooks = vi.hoisted(() => ({
  useStudentProgress: vi.fn(),
  useSubjectProgress: vi.fn(),
  useDueReviews: vi.fn(),
}));
vi.mock("@/hooks/useStudentProgress", async (orig) => ({
  // The real slug helpers: the page resolves a link by them.
  ...(await orig<typeof import("@/hooks/useStudentProgress")>()),
  useStudentProgress: hooks.useStudentProgress,
}));
vi.mock("@/hooks/useSubjectProgress", () => ({
  useSubjectProgress: hooks.useSubjectProgress,
}));
vi.mock("@/hooks/useDueReviews", () => ({
  useDueReviews: hooks.useDueReviews,
}));

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

const NOW = new Date().toISOString();

const CONCEPTS = [
  { conceptId: "c-frac", name: "Fractions" },
  { conceptId: "c-deci", name: "Decimals" },
];

beforeEach(() => {
  clearSession();
  hooks.useSubjectProgress.mockReturnValue({
    reflection: null,
    // THE SUBJECT'S OWN lessons, and the only source of them: the screen used
    // to list the whole student's history here, and `LessonProgress` carries
    // no subject to filter on.
    lessons: [],
    loading: false,
    failed: false,
  });
  hooks.useDueReviews.mockReturnValue({
    due: new Set<string>(),
    playable: new Map<string, string>(),
    loading: false,
    failed: false,
  });
  hooks.useStudentProgress.mockReturnValue({
    subjects: [
      { slug: "Mathematics", name: "Mathematics", concepts: CONCEPTS },
    ],
    lessons: [],
    reflection: null,
    highlights: [],
    loading: false,
    failed: false,
    live: true,
  });
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("SubjectDetail", () => {
  it("lets a child open a concept that is ready for another look", async () => {
    signIn();
    hooks.useDueReviews.mockReturnValue({
      due: new Set(["c-frac"]),
      playable: new Map([["c-frac", "lesson-42"]]),
      loading: false,
      failed: false,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    const link = await screen.findByRole("link", {
      name: /take another look at Fractions/i,
    });
    // The concept travels with the link. Without it the review session cannot
    // tell the scheduler which concept it was for, and every review outcome
    // was being discarded at the door.
    expect(link.getAttribute("href")).toBe(
      "/student/lessons/lesson-42/review-session?concept=c-frac",
    );
  });

  it("does not offer a link for a due concept with no lesson behind it", async () => {
    signIn();
    hooks.useDueReviews.mockReturnValue({
      due: new Set(["c-frac"]),
      // Due, but its schedule row carried no lessonId - openable by nothing.
      playable: new Map<string, string>(),
      loading: false,
      failed: false,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    await waitFor(() => expect(screen.getByText("Fractions")).toBeTruthy());
    // Present and named, but not a link to nowhere.
    expect(
      screen.queryByRole("link", { name: /take another look/i }),
    ).toBeNull();
  });

  it("titles a signed-in page from the slug, never from the designed fixture", async () => {
    signIn();
    hooks.useStudentProgress.mockReturnValue({
      // The live read knows no subject by this slug.
      subjects: [],
      lessons: [],
      reflection: null,
      highlights: [],
      loading: false,
      failed: false,
      live: true,
    });

    render(
      <SubjectDetail
        subject={{ slug: "mathematics", name: "FIXTURE NAME" } as never}
        slug="mathematics"
      />,
    );

    await waitFor(() => expect(screen.getByText("Mathematics")).toBeTruthy());
    expect(screen.queryByText("FIXTURE NAME")).toBeNull();
  });
});

describe("whose lessons are under this subject's heading", () => {
  /**
   * THE CHILD'S WHOLE HISTORY USED TO SIT UNDER ONE SUBJECT'S NAME.
   *
   * The screen already made a second, narrowed request - `progress/{subject}` -
   * and kept only its `reflection`, because the whole-student reflection would
   * have presented a sentence about everything as a sentence about maths. The
   * same reasoning applies to the lesson list and was not applied to it: a
   * child opening Maths was shown the English they had done.
   *
   * It was invisible while a library held one lesson, which is why it survived.
   *
   * `LessonProgress` carries no subject, so this cannot be filtered on the
   * client. The narrowed read is the only source.
   */
  it("lists the subject's own lessons, not the whole student's", async () => {
    signIn();
    hooks.useStudentProgress.mockReturnValue({
      subjects: [
        { slug: "Mathematics", name: "Mathematics", concepts: CONCEPTS },
      ],
      // What the child has done across EVERY subject.
      lessons: [
        { lessonId: "l-eng", title: "The Lighthouse", updatedAt: NOW },
        { lessonId: "l-math", title: "Adding Fractions", updatedAt: NOW },
      ],
      reflection: null,
      highlights: [],
      loading: false,
      failed: false,
      live: true,
    });
    hooks.useSubjectProgress.mockReturnValue({
      reflection: null,
      lessons: [{ lessonId: "l-math", title: "Adding Fractions", updatedAt: NOW }],
      loading: false,
      failed: false,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    await waitFor(() =>
      expect(screen.getByText("Adding Fractions")).toBeTruthy(),
    );
    expect(screen.queryByText("The Lighthouse")).toBeNull();
  });

  it("lists nothing rather than everything when the narrowed read fails", async () => {
    // Rule 5. A list of other subjects' lessons under this heading is a false
    // claim about what the child did here; an absent section claims nothing.
    signIn();
    hooks.useStudentProgress.mockReturnValue({
      subjects: [
        { slug: "Mathematics", name: "Mathematics", concepts: CONCEPTS },
      ],
      lessons: [{ lessonId: "l-eng", title: "The Lighthouse", updatedAt: NOW }],
      reflection: null,
      highlights: [],
      loading: false,
      failed: false,
      live: true,
    });
    hooks.useSubjectProgress.mockReturnValue({
      reflection: null,
      lessons: [],
      loading: false,
      failed: true,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    await waitFor(() => expect(screen.getByText("Mathematics")).toBeTruthy());
    expect(screen.queryByText("The Lighthouse")).toBeNull();
  });
});

describe("which subject a link opens", () => {
  /*
   * The slug used to be the name lowercased with everything outside a-z0-9
   * dashed out, so "Mathematics" and "mathematics" - two subjects, grouped
   * apart - shared one link, and "Yorùbá" became "yor-b-". The link carries
   * the name now, and the page matches on it.
   */
  const two = () =>
    hooks.useStudentProgress.mockReturnValue({
      subjects: [
        {
          slug: "Mathematics",
          name: "Mathematics",
          concepts: [{ conceptId: "c-upper", name: "Upper concept" }],
        },
        {
          slug: "mathematics",
          name: "mathematics",
          concepts: [{ conceptId: "c-lower", name: "Lower concept" }],
        },
        {
          slug: encodeURIComponent("Yorùbá"),
          name: "Yorùbá",
          concepts: [{ conceptId: "c-yo", name: "Greetings" }],
        },
      ],
      lessons: [],
      reflection: null,
      highlights: [],
      loading: false,
      failed: false,
      live: true,
    });

  it("opens the subject whose case it carries, not its namesake", async () => {
    signIn();
    two();

    render(<SubjectDetail subject={null} slug="mathematics" />);

    await waitFor(() =>
      expect(screen.getByText("Lower concept")).toBeTruthy(),
    );
    expect(screen.queryByText("Upper concept")).toBeNull();
  });

  it("finds a name with accents, decoded or not", async () => {
    signIn();
    two();

    const { unmount } = render(
      <SubjectDetail subject={null} slug={encodeURIComponent("Yorùbá")} />,
    );
    await waitFor(() => expect(screen.getByText("Greetings")).toBeTruthy());
    unmount();

    render(<SubjectDetail subject={null} slug="Yorùbá" />);
    await waitFor(() => expect(screen.getByText("Greetings")).toBeTruthy());
  });
});

describe("the subject's lesson list", () => {
  it("is headed with the frame's words, which claim nothing is done", async () => {
    signIn();
    hooks.useSubjectProgress.mockReturnValue({
      reflection: null,
      lessons: [{ lessonId: "l-1", title: "Adding Fractions", updatedAt: NOW }],
      loading: false,
      failed: false,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    await waitFor(() =>
      expect(screen.getByText("What you've been learning")).toBeTruthy(),
    );
    expect(screen.queryByText(/Lessons you've done/)).toBeNull();
  });

  it("says it could not be loaded, rather than that there is nothing", async () => {
    /*
     * A failed narrowed read used to leave no section at all - and with no
     * concepts either, the screen said "Nothing here yet". The lessons exist;
     * we could not fetch them.
     */
    signIn();
    hooks.useStudentProgress.mockReturnValue({
      subjects: [{ slug: "Mathematics", name: "Mathematics", concepts: [] }],
      lessons: [],
      reflection: null,
      highlights: [],
      loading: false,
      failed: false,
      live: true,
    });
    hooks.useSubjectProgress.mockReturnValue({
      reflection: null,
      lessons: [],
      loading: false,
      failed: true,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    await waitFor(() =>
      expect(
        screen.getByText(/We couldn.t load your lessons just now/),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText(/just getting started/)).toBeNull();
    expect(screen.queryByText(/Nothing here yet/)).toBeNull();
  });

  it("uses the frame's early line when there genuinely is nothing", async () => {
    signIn();
    hooks.useStudentProgress.mockReturnValue({
      subjects: [{ slug: "Mathematics", name: "Mathematics", concepts: [] }],
      lessons: [],
      reflection: null,
      highlights: [],
      loading: false,
      failed: false,
      live: true,
    });

    render(<SubjectDetail subject={null} slug="Mathematics" />);

    await waitFor(() =>
      expect(
        screen.getByText(
          /You're just getting started in Mathematics\. Check back after a few/,
        ),
      ).toBeTruthy(),
    );
  });
});

/**
 * Design D41, 1 Oct. The session markers sat on a smooth rising line - the
 * treatment SCRUM-144 took off the Progress cards on 15 Sep, surviving here
 * alone. No series over time supports any line, and an upward one tells every
 * child the subject is going up. The markers now sit level on the subject
 * card's own texture, chosen from the name.
 */
describe("the session markers", () => {
  const MATHS = SUBJECT_DETAIL.mathematics;

  it("draw no line through them", async () => {
    const { container } = render(
      <SubjectDetail subject={MATHS} slug="mathematics" />,
    );

    await waitFor(() =>
      expect(container.querySelector("[data-session-markers]")).not.toBeNull(),
    );
    const band = container.querySelector("[data-session-markers]")!;
    // The old curve was one `<path>` of cubic segments through the markers.
    expect(band.querySelector("path[d^='M ']")).toBeNull();
    expect(container.innerHTML).not.toMatch(/ C \d+ \d+, /);
  });

  it("sit on the subject card's own texture", async () => {
    const { container } = render(
      <SubjectDetail subject={MATHS} slug="mathematics" />,
    );

    await waitFor(() =>
      expect(container.querySelector("[data-session-markers]")).not.toBeNull(),
    );
    const t = textureFor(MATHS.name);
    expect(
      container
        .querySelector("[data-session-markers] [data-texture]")
        ?.getAttribute("data-texture"),
    ).toBe(`${t.motif}-${t.family}`);
  });

  it("are one per session, all level, and each opens its session", async () => {
    render(<SubjectDetail subject={MATHS} slug="mathematics" />);

    const markers = await screen.findAllByRole("button", {
      name: /^View session:/,
    });
    expect(markers).toHaveLength(MATHS.lessons.length);
    // Nothing places a marker higher or lower than another.
    for (const m of markers) expect(m.getAttribute("style") ?? "").not.toMatch(/top/);

    fireEvent.click(markers[markers.length - 1]);
    expect(
      await screen.findByRole("dialog", { name: MATHS.lessons[0].title }),
    ).toBeTruthy();
  });
});
