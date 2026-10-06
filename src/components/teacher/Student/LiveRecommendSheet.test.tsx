import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { create, useLessonLibrary } = vi.hoisted(() => ({
  create: vi.fn(),
  useLessonLibrary: vi.fn(),
}));

vi.mock("@/lib/api/assignments", () => ({ assignmentsApi: { create } }));
vi.mock("@/hooks/useLessonLibrary", () => ({ useLessonLibrary }));

import { ApiError } from "@/lib/api/client";

import { LiveRecommendSheet } from "./LiveRecommendSheet";

/**
 * C08c Recommend a Lesson, on a real student.
 *
 * THE DEFECT THIS REPLACES. `RecommendSheet` next door has a send button that
 * reads `onClick={() => setSent(true)}` - no network call anywhere in the file,
 * which imports no API module at all - and then tells the teacher "That's sent
 * to Amara". It was also unreachable when signed in, because `StudentRoute`
 * dropped `recommendOpen` before rendering the live profile. So the most
 * prominent action C08c draws has never assigned a lesson, and said it had.
 *
 * So the assertion that matters is that a confirmation follows a WRITE. A test
 * that the success copy appears would have passed against the fixture sheet
 * throughout, which is exactly how this survived.
 */

const LESSONS = [
  { id: "l-1", title: "Fractions 3", meta: "Mathematics · 20 min", kind: "normal" },
  { id: "l-2", title: "Photosynthesis", meta: "Science · 25 min", kind: "normal" },
];

/** What `POST /api/v1/assignments` actually answers - not `{created: 1}`. */
const CREATED = { assignmentIds: ["a-1"], createdCount: 1, duplicateCount: 0 };

const show = (props: Record<string, unknown> = {}) =>
  render(
    <LiveRecommendSheet
      studentId="s-1"
      firstName="Amara"
      onClose={() => {}}
      {...props}
    />,
  );

const pick = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));

const sendIt = () =>
  fireEvent.click(screen.getByRole("button", { name: "Recommend this lesson" }));

beforeEach(() => {
  create.mockReset();
  useLessonLibrary.mockReset();
  useLessonLibrary.mockReturnValue({ cards: LESSONS, live: true, sample: false, loading: false });
  create.mockResolvedValue(CREATED);
});

describe("sending", () => {
  it("assigns the chosen lesson to this one student", () => {
    show();
    pick("Fractions 3");
    sendIt();

    // One lesson, one student. `AssignmentCreate.studentIds` takes up to 500,
    // which is why "recommend to one child" needed no new endpoint.
    expect(create).toHaveBeenCalledWith({
      lessonIds: ["l-1"],
      studentIds: ["s-1"],
    });
  });

  it("confirms only after the write resolves", async () => {
    let resolve: (v: unknown) => void = () => {};
    create.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    show();
    pick("Fractions 3");
    sendIt();

    // Mid-flight: nothing is confirmed yet. The fixture sheet confirmed here.
    expect(screen.queryByText(/That’s sent to Amara/)).not.toBeInTheDocument();

    resolve(CREATED);
    expect(await screen.findByText(/That’s sent to Amara/)).toBeInTheDocument();
  });

  it("never claims a send that failed", async () => {
    create.mockRejectedValueOnce(new Error("500"));
    show();
    pick("Fractions 3");
    sendIt();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing has changed/i);
    expect(screen.queryByText(/That’s sent to Amara/)).not.toBeInTheDocument();
  });

  it("will not send until a lesson is chosen", () => {
    show();

    expect(
      screen.getByRole("button", { name: "Recommend this lesson" }),
    ).toBeDisabled();
    sendIt();
    expect(create).not.toHaveBeenCalled();
  });

  it("names the lesson it actually sent, in the confirmation", async () => {
    // Awaits the confirmation FIRST and then reads within it. The first draft
    // asserted on /Photosynthesis/ straight after the click, which raced the
    // option list still being on screen - so it was asking a question with two
    // possible answers and no fixed moment.
    show();
    pick("Photosynthesis");
    sendIt();

    const done = await screen.findByText(/That’s sent to Amara/);
    const panel = done.parentElement!;
    expect(panel.textContent).toMatch(/Photosynthesis/);
    expect(panel.textContent).not.toMatch(/Fractions 3/);
  });
});

describe("the note", () => {
  // Built 15 Sep, when `note` landed on both creation contracts. Until then
  // this sheet deliberately had no box, because one that discarded what a
  // teacher wrote about a named child is worse than none.
  const write = (text: string) =>
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });

  it("sends what the teacher wrote, to this child", () => {
    show();
    pick("Fractions 3");
    write("I picked this because you liked the last one.");
    sendIt();

    expect(create).toHaveBeenCalledWith({
      lessonIds: ["l-1"],
      studentIds: ["s-1"],
      note: "I picked this because you liked the last one.",
    });
  });

  it("sends NO note key when the box was never touched", () => {
    // Optional means absent, not "". An empty note would render as an empty
    // bubble on her dashboard, saying her teacher wrote to her when they
    // did not.
    show();
    pick("Fractions 3");
    sendIt();

    expect(create).toHaveBeenCalledWith({
      lessonIds: ["l-1"],
      studentIds: ["s-1"],
    });
  });

  it("treats whitespace as no note", () => {
    show();
    pick("Fractions 3");
    write("   \n  ");
    sendIt();

    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ note: expect.anything() }),
    );
  });

  it("trims it", () => {
    show();
    pick("Fractions 3");
    write("  Have a go at this one.  ");
    sendIt();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ note: "Have a go at this one." }),
    );
  });

  it("tells the teacher the note is private to that child", async () => {
    /*
     * THIS PINNED A SMALLER SENTENCE FOR THREE DAYS, deliberately.
     *
     * C08c's line is "She'll see your note when she opens it", and the
     * confirmation would only say the note went WITH the lesson. Not because
     * the note failed to reach the child - it rides her own dashboard - but
     * because who the note was FOR had not been ruled, and the open question
     * was whether it was the teacher's own record or was meant for the parent.
     * Treating the transport as the answer was the reasoning the old test and
     * its comment existed to refuse.
     *
     * Design ruled on 23 Sep: it reaches the child, attributed, never adapted.
     * The student lane drew it the same day. So the promise is earned.
     *
     * DESIGN WROTE THE SENTENCE ON 24 SEP: *"Your note goes with this lesson
     * and only [student] sees it."* The version shipped that morning read
     * "They'll see your note when they open it" - true, and quieter than
     * design wanted. Theirs carries the part a teacher needs: the note is
     * private to that one child. Neither says "she" about a real child whose
     * pronouns nothing here knows.
     */
    show();
    pick("Fractions 3");
    write("Have a go at this one.");
    sendIt();

    const done = await screen.findByText(/That’s sent to Amara/);
    expect(done.parentElement?.textContent).toMatch(
      /Your note goes with this lesson and only Amara sees it/i,
    );
  });

  it("does not mention a note when none was written", async () => {
    show();
    pick("Fractions 3");
    sendIt();

    const done = await screen.findByText(/That’s sent to Amara/);
    expect(done.parentElement?.textContent).not.toMatch(/note/i);
  });

  it("promises nothing when the box held only whitespace", async () => {
    // The request already drops a whitespace note; this is the other half -
    // the confirmation must not promise a message that was never sent.
    show();
    pick("Fractions 3");
    write("   ");
    sendIt();

    const done = await screen.findByText(/That’s sent to Amara/);
    expect(done.parentElement?.textContent).not.toMatch(/your note/i);
  });
});

describe("what it does not promise", () => {
  it("marks nothing as Nevo's suggestion", () => {
    // `Recommendation` is prose with no lesson id, so nothing connects Nevo's
    // sentence to a row in the library. A badge would be a guess.
    show({ suggestion: "The listen-first version would suit her this week." });

    expect(screen.queryByText(/^Suggested$/i)).not.toBeInTheDocument();
  });

  it("shows Nevo's sentence as context when there is one", () => {
    show({ suggestion: "The listen-first version would suit her this week." });

    expect(screen.getByText("Nevo suggests")).toBeInTheDocument();
    expect(
      screen.getByText(/listen-first version would suit her/),
    ).toBeInTheDocument();
  });

  it("says nothing about a suggestion when Nevo has made none", () => {
    show({ suggestion: null });

    expect(screen.queryByText("Nevo suggests")).not.toBeInTheDocument();
  });
});

describe("an empty or unreachable library", () => {
  it("tells a teacher their library is empty, not that something broke", () => {
    useLessonLibrary.mockReturnValue({ cards: [], live: true, sample: false, loading: false });
    show();

    expect(screen.getByText(/library is empty/i)).toBeInTheDocument();
  });

  it("distinguishes a failed read from an empty library", () => {
    useLessonLibrary.mockReturnValue({ cards: [], live: false, sample: true, loading: false });
    show();

    expect(screen.getByText(/couldn’t reach your library/i)).toBeInTheDocument();
    expect(screen.queryByText(/library is empty/i)).not.toBeInTheDocument();
  });

  /**
   * THE SHAPE ABOVE IS ONE THE REAL HOOK NEVER RETURNS, which is how this bug
   * survived having a test that looked like it covered it.
   *
   * `useLessonLibrary` returns `{cards: FIXTURE_CARDS, live: false}` on a failed
   * read - eight invented lessons, not an empty array. The test above pairs
   * `live: false` with `cards: []`, so it exercised a state that cannot occur
   * and the honest-empty branch (`cards.length === 0`) passed for the wrong
   * reason. In the product a signed-in teacher was offered "Solving Linear
   * Equations" and seven more as though they were their own.
   *
   * These use the shape the hook actually produces.
   */
  it("offers no lessons at all when the read failed, fixtures included", () => {
    useLessonLibrary.mockReturnValue({
      cards: LESSONS,
      live: false,
      sample: true,
      loading: false,
    });
    show();

    for (const lesson of LESSONS) {
      expect(screen.queryByText(lesson.title)).not.toBeInTheDocument();
    }
    expect(screen.getByText(/couldn’t reach your library/i)).toBeInTheDocument();
  });

  it("shows no lesson a teacher could press while the read is in flight", () => {
    // `live` is false for the whole in-flight window too, and the hook is
    // serving fixtures throughout it.
    useLessonLibrary.mockReturnValue({
      cards: LESSONS,
      live: false,
      sample: false,
      loading: true,
    });
    show();

    for (const lesson of LESSONS) {
      expect(screen.queryByText(lesson.title)).not.toBeInTheDocument();
    }
    // Not the failure copy either: nothing has failed yet.
    expect(screen.queryByText(/couldn’t reach your library/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/library is empty/i)).not.toBeInTheDocument();
  });
});

/**
 * THE SIBLINGS OF THE ASSIGN WIZARD'S FIXES, on the other door to the same
 * endpoint. Each of these was fixed in the wizard between 22 and 24 Sep and
 * missed here.
 */
describe("only a lesson that can be sent", () => {
  const MIXED = [
    ...LESSONS,
    { id: "l-3", title: "Water Cycle", meta: "", kind: "failed" },
    { id: "l-4", title: "Rivers", meta: "", kind: "parsing" },
  ];

  it("is offered - not one whose parse failed, nor one still being read", () => {
    // A failed parse leaves a lesson with no sections; sending it sent a
    // child an empty lesson.
    useLessonLibrary.mockReturnValue({ cards: MIXED, live: true, sample: false, loading: false });
    show();

    expect(screen.getByRole("button", { name: /Fractions 3/ })).toBeInTheDocument();
    expect(screen.queryByText("Water Cycle")).not.toBeInTheDocument();
    expect(screen.queryByText("Rivers")).not.toBeInTheDocument();
  });
});

describe("a lesson that is not approved yet", () => {
  const refuse = (message?: string) =>
    create.mockRejectedValueOnce(
      new ApiError(409, "conflict", {
        detail: { code: "lesson_not_approved", ...(message ? { message } : {}) },
      }),
    );

  it("says what the server said is outstanding, not 'try again'", async () => {
    refuse("Fractions 3 has 2 sections waiting for you.");
    show();
    pick("Fractions 3");
    sendIt();

    const said = await screen.findByRole("alert");
    expect(said).toHaveTextContent("Fractions 3 has 2 sections waiting for you.");
    expect(said).not.toHaveTextContent(/try again/i);
  });

  it("points at the lesson that settles it", async () => {
    refuse("Fractions 3 has 2 sections waiting for you.");
    show();
    pick("Fractions 3");
    sendIt();

    expect(
      await screen.findByRole("link", { name: "Open the lesson and check them" }),
    ).toHaveAttribute("href", "/teacher/lessons/l-1");
  });

  it("keeps the wizard's sentence where the server gave none", async () => {
    refuse();
    show();
    pick("Fractions 3");
    sendIt();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This lesson still has sections waiting for you, so it cannot go to students yet.",
    );
  });

  it("offers no lesson link for an ordinary failure", async () => {
    create.mockRejectedValueOnce(new ApiError(500, "server"));
    show();
    pick("Fractions 3");
    sendIt();

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    expect(screen.queryByRole("link", { name: /Open the lesson/ })).not.toBeInTheDocument();
  });
});

describe("a send that created nothing", () => {
  it("says the child already has it, rather than 'That's sent'", async () => {
    create.mockResolvedValueOnce({ assignmentIds: [], createdCount: 0, duplicateCount: 1 });
    show();
    pick("Fractions 3");
    sendIt();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Amara already has this lesson, so nothing was sent again.",
    );
    expect(screen.queryByText(/That’s sent/)).not.toBeInTheDocument();
  });

  it("promises no note that nothing is holding", async () => {
    create.mockResolvedValueOnce({ assignmentIds: [], createdCount: 0, duplicateCount: 1 });
    show();
    pick("Fractions 3");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Have a go." } });
    sendIt();

    await screen.findByRole("alert");
    expect(screen.queryByText(/Your note goes with this lesson/)).not.toBeInTheDocument();
  });

  it("does not claim a duplicate the server did not report", async () => {
    // Absent is not a duplicate: an older deployment may not send the field.
    create.mockResolvedValueOnce({ assignmentIds: [], createdCount: 0 });
    show();
    pick("Fractions 3");
    sendIt();

    const said = await screen.findByRole("alert");
    expect(said).not.toHaveTextContent(/already has/);
    expect(screen.queryByText(/That’s sent/)).not.toBeInTheDocument();
  });
});

describe("the note box, when there is no lesson under it", () => {
  it("is not there while the library is loading", () => {
    useLessonLibrary.mockReturnValue({ cards: LESSONS, live: false, sample: false, loading: true });
    show();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("is not there when the library could not be reached", () => {
    useLessonLibrary.mockReturnValue({ cards: LESSONS, live: false, sample: true, loading: false });
    show();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("is there once there are lessons to send", () => {
    show();

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("a recommendation not yet sent", () => {
  it("makes the browser ask once a lesson is picked", () => {
    show();
    expect(leavingAsks()).toBe(false);

    pick("Fractions 3");
    expect(leavingAsks()).toBe(true);
  });
});
