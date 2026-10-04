import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const { create, useTeacherClasses, useLessonLibrary, useStudentDirectory, useHasSession, push } =
  vi.hoisted(() => ({
    create: vi.fn(),
    useHasSession: vi.fn(),
    useTeacherClasses: vi.fn(),
    useLessonLibrary: vi.fn(),
    useStudentDirectory: vi.fn(),
    push: vi.fn(),
  }));

vi.mock("@/lib/api/assignments", () => ({ assignmentsApi: { create } }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useLessonLibrary", () => ({ useLessonLibrary }));
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
// Without this the wizard takes its signed-OUT path, where Confirm closes the
// demo rather than assigning - and `create` is never called, which looks
// exactly like a broken submit.
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, back: push, prefetch: vi.fn() }),
}));

import { AssignWizard } from "./AssignWizard";
import { SystemMessagesProvider } from "@/components/shared/SystemMessages";

/**
 * "Specific students", which the wizard refused to do on a reason that had
 * stopped being true.
 *
 * THE FALSE PREMISE. The guard read: "The API takes `studentIds`, but the live
 * class list carries no roster, so there are no real ids to send." True of the
 * class LIST - `AssignedClassResponse` carries none - and not true of the
 * product. `GET /api/v1/classes/{class_id}/students` returns `studentId` per
 * child; `useStudentDirectory` already fans the class list out across it for
 * the compose picker; `AssignmentCreate.studentIds` accepts up to 500. Three
 * pieces, all built, all tested, none joined up.
 *
 * The old picker also keyed its selection on `${classId}:${name}`, which is
 * what a screen does when it has no ids - and means two children sharing a name
 * shared a checkbox.
 */

const CLASSES = [
  { id: "c-1", name: "JSS 2A", joinCode: "AB12" },
  { id: "c-2", name: "JSS 2B", joinCode: "CD34" },
];

const DIRECTORY = [
  { studentId: "s-1", name: "Amara Okafor", initials: "AO", className: "JSS 2A" },
  { studentId: "s-2", name: "Chidi Nwosu", initials: "CN", className: "JSS 2A" },
  { studentId: "s-3", name: "Tunde Bakare", initials: "TB", className: "JSS 2B" },
];

/**
 * `kind` WAS MISSING HERE, and it is required on `LibraryCard`. The real hook
 * sets it on every card - both the live ones and its own fixtures - so a
 * fixture without it described a card that cannot exist, and the wizard only
 * stopped caring once it started filtering on it.
 */
const LESSONS = [
  { id: "l-1", title: "Fractions 3", meta: "Mathematics", kind: "normal" },
];

const directory = (over: Record<string, unknown> = {}) => ({
  students: DIRECTORY,
  loading: false,
  failed: false,
  ...over,
});

beforeEach(() => {
  create.mockReset();
  useTeacherClasses.mockReset();
  useLessonLibrary.mockReset();
  useStudentDirectory.mockReset();
  push.mockReset();

  create.mockResolvedValue({ createdCount: 1 });
  useTeacherClasses.mockReturnValue({
    options: CLASSES,
    classes: [],
    liveClasses: [],
    live: true,
    loading: false,
    sample: false,
  });
  useLessonLibrary.mockReturnValue({
    cards: LESSONS,
    live: true,
    sample: false,
    loading: false,
    slow: false,
  });
  useStudentDirectory.mockReturnValue(directory());
  useHasSession.mockReturnValue(true);
});

/** Walk to step 2 with a lesson chosen, then switch to the student picker. */
const toStudents = () => {
  render(<AssignWizard preselect="l-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Specific students" }));
};

describe("the student picker", () => {
  it("offers the teacher's real students, grouped by class", () => {
    toStudents();

    expect(screen.getByText("Amara Okafor")).toBeInTheDocument();
    expect(screen.getByText("Tunde Bakare")).toBeInTheDocument();
    expect(screen.getByText("JSS 2A")).toBeInTheDocument();
  });

  it("no longer refuses on a premise that stopped being true", () => {
    toStudents();

    expect(
      screen.queryByText(/isn’t connected yet|Assign to the whole class for now/i),
    ).not.toBeInTheDocument();
  });

  it("distinguishes a failed directory from classes with no students", () => {
    useStudentDirectory.mockReturnValue(directory({ students: [], failed: true }));
    toStudents();

    expect(screen.getByText(/couldn’t reach your classes/i)).toBeInTheDocument();
    expect(screen.queryByText(/no students in your classes yet/i)).not.toBeInTheDocument();
  });

  it("says a class is missing when the directory is only partial", () => {
    // A partial list is worth offering; a teacher must know it is partial.
    useStudentDirectory.mockReturnValue(directory({ failed: true }));
    toStudents();

    expect(screen.getByText(/some students may be missing/i)).toBeInTheDocument();
  });

  it("holds while the directory loads rather than claiming it is empty", () => {
    useStudentDirectory.mockReturnValue(
      directory({ students: [], loading: true }),
    );
    toStudents();

    expect(screen.getByText(/Finding your students/i)).toBeInTheDocument();
    expect(screen.queryByText(/no students in your classes yet/i)).not.toBeInTheDocument();
  });
});

describe("sending to specific students", () => {
  /** Step 2 to the end: two Continues, then the confirm at step 4. */
  const send = () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  };

  it("sends every chosen student in ONE request, keyed by id", async () => {
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tunde Bakare/ }));
    send();

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonIds: ["l-1"],
        studentIds: ["s-1", "s-3"],
      }),
    );
  });

  it("sends no classId when the teacher picked students", async () => {
    // A classId alongside studentIds would assign the whole class as well.
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].classId).toBeUndefined();
  });

  it("still sends one request per class for a whole-class pick", async () => {
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /JSS 2A/ }));
    fireEvent.click(screen.getByRole("button", { name: /JSS 2B/ }));
    send();

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0][0].studentIds).toBeUndefined();
  });

  it("will not let a teacher past step 2 with no student chosen", () => {
    // The guard is the disabled Continue, not a message at the end: there is
    // no way to reach Confirm without a selection, which is why this asserts
    // the control rather than driving to the last step.
    toStudents();

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("closes without assigning for a signed-out visitor walking the demo", async () => {
    useHasSession.mockReturnValue(false);
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * The approval gate (17 Sep).
 *
 * From this deploy a lesson cannot be assigned until a teacher has approved
 * every one of its segments, and BOTH assignment doors share the check, so the
 * refusal reaches this wizard whichever path the teacher took. It arrives as
 * `409 lesson_not_approved`.
 *
 * "Try again" is the one instruction that cannot work: the server is not
 * failing, it is declining, and the teacher has an action that fixes it. This
 * is the same mistake as telling a rate-limited teacher to retry, which this
 * console has already made once at the sign-in door.
 */
describe("a lesson that has not been approved", () => {
  /*
   * THE MESSAGE IS THE DOCUMENTED SHAPE NOW. This fixture said "2 segments
   * remain", written when nothing read the field - the contract states that
   * `detail.message` names each lesson and what is outstanding on it, so a
   * fixture that named no lesson described a response the server does not
   * send. The assertions below moved onto the lesson NAME, because being told
   * which lesson is the property that was missing.
   */
  const refuse = () =>
    create.mockRejectedValue(
      new ApiError(409, "conflict", {
        detail: {
          code: "lesson_not_approved",
          message: "Fractions 3 has 2 sections waiting for you.",
        },
      }),
    );

  const send = () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  };

  it("says what is actually wrong, not that something broke", async () => {
    refuse();
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    expect(
      await screen.findByText(/Fractions 3 has 2 sections/),
    ).toBeInTheDocument();
  });

  it("never tells the teacher to try again, which cannot work", async () => {
    refuse();
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    await screen.findByText(/Fractions 3 has 2 sections/);
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
  });

  it("still says try again for an ordinary failure", async () => {
    // The 409 branch must not swallow the generic one.
    create.mockRejectedValue(new ApiError(500, "server", undefined));
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    expect(await screen.findByText(/try again/i)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for you/i)).not.toBeInTheDocument();
  });

  it("NAMES NO PAGE THAT DOES NOT EXIST (SCRUM-153)", async () => {
    /*
     * This message used to read "Open it from My Lessons and approve each
     * section". There is no My Lessons - the sidebar has Library - and a
     * teacher whose lesson was refused went looking for a screen that is not
     * there. It is item 1 of the bug that stopped a demonstration on
     * 19 September, and I wrote the line.
     */
    refuse();
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    await screen.findByText(/Fractions 3 has 2 sections/);
    expect(screen.queryByText(/My Lessons/i)).not.toBeInTheDocument();
  });

  it("takes the teacher to the lesson in one click", async () => {
    // The rule the flow broke: if a message names a destination, that
    // destination is reachable in one click from the message.
    refuse();
    toStudents();
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    send();

    const link = await screen.findByRole("link", {
      name: /Open the lesson and check them/i,
    });
    expect(link).toHaveAttribute("href", "/teacher/lessons/l-1");
  });
});

/**
 * THE IN-FLIGHT WINDOW.
 *
 * `useTeacherClasses` serves the six fixture classes whenever `data` is null,
 * and that includes the whole time the read is in flight - not only after it
 * fails. Both the sample notice and the confirm guard keyed on `sample`, which
 * is true only once it HAS failed. So for as long as the class list took, a
 * signed-in teacher was shown invented classes with nothing saying so, and a
 * class picked in that window was a fixture id on its way to
 * `POST /api/v1/assignments`.
 *
 * Every existing test in this file sets `loading: false`, which is why none of
 * them saw it. These set it true.
 */
describe("while the class list is still loading", () => {
  const loadingClasses = () =>
    useTeacherClasses.mockReturnValue({
      // The shape the hook really returns mid-flight: fixtures present,
      // `sample` false because nothing has failed, `loading` true.
      options: CLASSES,
      classes: [],
      liveClasses: [],
      live: false,
      loading: true,
      sample: false,
    });

  it("offers no class to pick, so no fixture can be chosen", () => {
    // The fix. A fixture that is never offered cannot be picked, and a teacher
    // who never saw invented classes has nothing to un-choose.
    loadingClasses();
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    for (const c of CLASSES) {
      expect(screen.queryByRole("button", { name: new RegExp(c.name) })).not.toBeInTheDocument();
    }
  });

  it("does not claim these are samples, because nothing has failed", () => {
    // "Not back yet" and "never coming" are different sentences, and only the
    // second is a reason to say the data is invented.
    loadingClasses();
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.queryByText(/these are sample classes/i)).not.toBeInTheDocument();
  });

  it("cannot be driven to confirm at all, so nothing is sent", () => {
    /*
     * The assertion that replaced a worse one. I first wrote this as "confirm
     * shows the still-loading error", and it failed - because with skeletons in
     * the picker there is no class to select, the step-2 guard refuses to
     * advance, and confirm is never rendered.
     *
     * That is a stronger property than the error message, so it is the one
     * asserted: the flow cannot reach the backend mid-flight, rather than
     * reaching it and being turned away.
     *
     * The `classesLoading` check in `submit()` stays as a backstop and is
     * therefore NOT exercised by this test. It is unreachable through the UI by
     * construction; it is kept because the cost of a future refactor
     * reintroducing the path is a fixture id in a real school's assignments.
     */
    loadingClasses();
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.queryByRole("button", { name: "Confirm assignment" }),
    ).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("the lessons a teacher is offered", () => {
  it("offers none of the invented four while the library is still arriving", () => {
    /*
     * QA, 22 Sep: "fodder lessons flash before the real ones."
     *
     * `live` is false for the whole in-flight window, not just a failure, so
     * the fallback drew the frame's four at every signed-in teacher until
     * their library landed - and a lesson chosen in that window is a FIXTURE
     * ID on its way to `POST /api/v1/assignments`. The class list beside it
     * had the same hole, diagnosed in a comment forty lines up, and only the
     * class half was fixed.
     */
    useLessonLibrary.mockReturnValue({
      cards: [],
      live: false,
      sample: false,
      loading: true,
      slow: false,
    });

    render(<AssignWizard />);

    expect(
      screen.queryByText("Simplifying Algebraic Fractions"),
    ).not.toBeInTheDocument();
  });

  it("keeps the designed four for a visitor with no session", () => {
    // Signed out, `useLiveQuery` reports `loading: false` at once. The
    // walkthrough is the one place those four belong.
    useLessonLibrary.mockReturnValue({
      cards: [],
      live: false,
      sample: false,
      loading: false,
      slow: false,
    });
    useHasSession.mockReturnValue(false);

    render(<AssignWizard />);

    expect(
      screen.getByText("Simplifying Algebraic Fractions"),
    ).toBeInTheDocument();
  });

  /*
   * THIS TEST PINNED THE LEAK. It asserted that a signed-in teacher whose
   * library read failed was offered "Simplifying Algebraic Fractions" - one of
   * the frame's four invented lessons, pickable, unmarked, and refused only at
   * step 4 after classes and a time had been chosen for it. Inverted: the
   * teacher is told the read failed, in the sentence step 4 already used.
   */
  it("offers none of the invented four when the read failed", () => {
    useLessonLibrary.mockReturnValue({
      cards: [],
      live: false,
      sample: true,
      loading: false,
      slow: false,
    });

    render(<AssignWizard />);

    expect(
      screen.queryByText("Simplifying Algebraic Fractions"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/We couldn.t load your lessons, so we can.t assign them/),
    ).toBeInTheDocument();
  });

  it("says nothing of the kind to a visitor with no session", () => {
    useLessonLibrary.mockReturnValue({
      cards: [],
      live: false,
      sample: false,
      loading: false,
      slow: false,
    });
    useHasSession.mockReturnValue(false);

    render(<AssignWizard />);

    expect(screen.queryByText(/couldn.t load your lessons/)).not.toBeInTheDocument();
  });
});

/**
 * A LESSON THAT CANNOT BE ASSIGNED, and for two weeks could be.
 *
 * `useLessonLibrary` returns three kinds - normal, parsing and failed - and
 * this list took all three, so the id of a lesson whose parse died went
 * straight to `POST /api/v1/assignments`.
 *
 * It stopped being hypothetical on 23 Sep: a failed parse leaves a lesson row
 * behind with zero segments, and the E2E tenant holds two of them. The Library
 * screen has always drawn one correctly - a non-clickable "This lesson
 * couldn't be processed." card - so this door was the only one missing it.
 */
describe("the lessons a teacher may actually send", () => {
  const withKinds = (...kinds: string[]) =>
    useLessonLibrary.mockReturnValue({
      cards: kinds.map((kind, i) => ({
        id: `l-${i + 1}`,
        title: `Lesson ${i + 1}`,
        meta: "Mathematics",
        kind,
      })),
      live: true,
      sample: false,
      loading: false,
      slow: false,
    });

  it("offers a lesson whose parse finished", () => {
    withKinds("normal");

    render(<AssignWizard />);

    expect(screen.getByText("Lesson 1")).toBeInTheDocument();
  });

  it("offers no lesson whose parse failed, because there is nothing in it", () => {
    withKinds("failed");

    render(<AssignWizard />);

    expect(screen.queryByText("Lesson 1")).not.toBeInTheDocument();
  });

  it("offers no lesson that is still being read", () => {
    // Not assignable YET, and this list has no way to say "not yet" about one
    // row. A disabled row is a state design has not drawn.
    withKinds("parsing");

    render(<AssignWizard />);

    expect(screen.queryByText("Lesson 1")).not.toBeInTheDocument();
  });

  it("keeps the finished one when it sits beside the other two", () => {
    withKinds("failed", "normal", "parsing");

    render(<AssignWizard />);

    expect(screen.queryByText("Lesson 1")).not.toBeInTheDocument();
    expect(screen.getByText("Lesson 2")).toBeInTheDocument();
    expect(screen.queryByText("Lesson 3")).not.toBeInTheDocument();
  });
});

/**
 * WHY NOTHING WAS ASSIGNED - and the screen only knew one of the two reasons.
 *
 * `createdCount: 0` happens when a class has nobody in it, and when a class
 * already has the lesson. This said the first over both, so a teacher
 * re-assigning to a full class was told it "may have no students enrolled
 * yet". The server had been saying which all along, in `duplicateCount`, and
 * the field was named nowhere in the client.
 */
describe("when the students already have the lesson", () => {
  const sendToClass = () => {
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /JSS 2A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  };

  it("says they already have it, not that the class may be empty", async () => {
    create.mockResolvedValue({
      assignmentIds: [],
      createdCount: 0,
      duplicateCount: 30,
    });

    sendToClass();

    expect(await screen.findByText(/already have this lesson/i)).toBeInTheDocument();
    expect(screen.queryByText(/no students enrolled/i)).not.toBeInTheDocument();
  });

  it("counts one student as one student", async () => {
    create.mockResolvedValue({
      assignmentIds: [],
      createdCount: 0,
      duplicateCount: 1,
    });

    sendToClass();

    expect(
      await screen.findByText(/That student already has this lesson/i),
    ).toBeInTheDocument();
  });

  it("still blames enrolment when the server named no duplicates", async () => {
    // An older deployment sends no `duplicateCount`, and absent must not read
    // as "and none of them were duplicates" - that is a claim, not a default.
    create.mockResolvedValue({ assignmentIds: [], createdCount: 0 });

    sendToClass();

    expect(await screen.findByText(/no students enrolled/i)).toBeInTheDocument();
  });
});

/**
 * THE SENTENCE THE SERVER WRITES FOR THIS REFUSAL, which we were discarding.
 *
 * The 409 is documented as of 24 Sep: `detail.code` is `lesson_not_approved`
 * and `detail.message` NAMES EACH LESSON and what is outstanding on it. Our
 * own copy could not name anything, because we had nothing to name them with -
 * so a teacher who picked four lessons read "ONE of these lessons still has
 * sections waiting for you" and had to open all four to find out which.
 *
 * Every test here drives a real refusal rather than asserting on a string in
 * isolation, because the thing that broke before was the wiring and not the
 * wording: the old code composed its message without ever reading the body.
 */
describe("a 409 that names the lessons", () => {
  const refuse = (message?: string) =>
    new ApiError(409, "Conflict", {
      detail: { code: "lesson_not_approved", ...(message ? { message } : {}) },
    });

  /** One lesson, one class: the branch that also gets a link. */
  const sendOne = () => {
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /JSS 2A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  };

  /**
   * TWO LESSONS, which is the case with nowhere to link to.
   *
   * Two CLASSES is not it, and that was the first draft of these tests: the
   * link is offered when one LESSON was chosen, however many classes it was
   * going to, because one lesson has a page and four do not.
   */
  const sendTwoLessons = () => {
    useLessonLibrary.mockReturnValue({
      cards: [
        { id: "l-1", title: "Fractions 3", meta: "Mathematics", kind: "normal" },
        { id: "l-2", title: "Angles", meta: "Mathematics", kind: "normal" },
      ],
      live: true,
      sample: false,
      loading: false,
      slow: false,
    });
    render(<AssignWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Fractions 3/ }));
    fireEvent.click(screen.getByRole("button", { name: /Angles/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /JSS 2A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  };

  it("still offers the link to the one lesson it is about", async () => {
    create.mockRejectedValue(refuse("Fractions 3 has 2 sections waiting."));

    sendOne();

    await screen.findByText(/Fractions 3 has 2 sections waiting/);
    expect(
      screen.getByRole("link", { name: /Open the lesson and check them/i }),
    ).toHaveAttribute("href", "/teacher/lessons/l-1");
  });

  it("adds no such clause when there IS one lesson to link to", async () => {
    /*
     * A mutation run found this unguarded: handing the single case the same
     * clause changed nothing any test could see. It would say "Open THEM from
     * your Library" about one lesson, directly above a link to that lesson.
     */
    create.mockRejectedValue(refuse("Fractions 3 has 2 sections waiting."));

    sendOne();

    await screen.findByText(/Fractions 3 has 2 sections waiting/);
    expect(
      screen.queryByText(/Open them from your Library/),
    ).not.toBeInTheDocument();
  });

  it("adds where to go when there is no one lesson to link to", async () => {
    // Two classes means no single lesson id to point at, so the clause that
    // says where to go has to be in the text.
    create.mockRejectedValue(refuse("Fractions 3 has 2 sections waiting."));

    sendTwoLessons();

    expect(
      await screen.findByText(/Open them from your Library and check them/),
    ).toBeInTheDocument();
  });

  it("does not run two sentences together when the server left no full stop", async () => {
    create.mockRejectedValue(refuse("Fractions 3 has 2 sections waiting"));

    sendTwoLessons();

    expect(
      await screen.findByText(/waiting\. Open them from your Library/),
    ).toBeInTheDocument();
  });

  it("keeps our own sentence when the server sent no message", async () => {
    // An older deployment documents the code and not the prose. Falling back
    // is the point: rendering nothing, or "undefined", would be worse than the
    // sentence that names nothing.
    create.mockRejectedValue(refuse());

    sendOne();

    expect(
      await screen.findByText(/This lesson still has sections waiting for you/),
    ).toBeInTheDocument();
  });

  it("says nothing of the sort for a refusal that is not this one", async () => {
    // A 409 with another code, or none, is not this state - and must not
    // borrow its sentence or its link.
    create.mockRejectedValue(new ApiError(409, "Conflict", { detail: {} }));

    sendOne();

    expect(await screen.findByText(/try again/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open the lesson/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * WHAT A TEACHER IS TOLD AFTER ASSIGNING - nothing, until 26 Sep.
 *
 * QA: the SCRUM-152 bar fires on lesson review but this wizard never raised it,
 * so a teacher assigned a lesson and got no sign anything had happened.
 *
 * The wording is design's, not ours. Two of SM-01's own examples in
 * `43 System Messages` are assignments - "Adding Fractions assigned to JSS 2A."
 * and "Simplifying Algebraic Fractions assigned to JSS 2A." - so the line is
 * that shape, filled with the names step 4 already shows.
 *
 * These render inside the REAL provider, so they assert on the bar itself
 * rather than on a call that might never reach the screen.
 */
describe("what a teacher is told once it is assigned", () => {
  const inShell = (preselect = "l-1") =>
    render(
      <SystemMessagesProvider>
        <AssignWizard preselect={preselect} />
      </SystemMessagesProvider>,
    );

  /** Step 1 to confirm, for whichever classes are named. */
  const toClasses = (...names: RegExp[]) => {
    inShell();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    for (const n of names) fireEvent.click(screen.getByRole("button", { name: n }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
  };

  it("says design's own sentence for one lesson and one class", async () => {
    toClasses(/JSS 2A/);

    expect(
      await screen.findByText("Fractions 3 assigned to JSS 2A."),
    ).toBeInTheDocument();
  });

  it("names every class it went to", async () => {
    toClasses(/JSS 2A/, /JSS 2B/);

    expect(
      await screen.findByText("Fractions 3 assigned to JSS 2A and JSS 2B."),
    ).toBeInTheDocument();
  });

  it("names the children the way step 4 did, when they were picked one by one", async () => {
    inShell();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Specific students" }));
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    fireEvent.click(screen.getByRole("button", { name: /Chidi Nwosu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    expect(
      await screen.findByText("Fractions 3 assigned to 2 students in JSS 2A."),
    ).toBeInTheDocument();
  });

  it("says it before handing over to the Library, where it stays on screen", async () => {
    // The bar's provider is in the teacher layout, which outlives this route,
    // so a line raised before the hand-over is still there when the Library
    // arrives. What this pins is the ORDER: said, then gone.
    toClasses(/JSS 2A/);

    await screen.findByText("Fractions 3 assigned to JSS 2A.");
    expect(push).toHaveBeenCalledWith("/teacher/lessons");
  });

  it("never says 'success', which SM-01 rules out by name", async () => {
    toClasses(/JSS 2A/);

    await screen.findByText("Fractions 3 assigned to JSS 2A.");
    expect(screen.queryByText(/success/i)).not.toBeInTheDocument();
  });

  it("is a confirmation, not a failure wearing the same words", async () => {
    /*
     * A mutation run found the tests read the words and not the KIND: the same
     * line raised as `failed` passed every one. On screen they are not alike.
     * A failure stays until someone dismisses it and carries the control to do
     * so; a confirmation carries none, because SM-01's rule is that it
     * "leaves on its own".
     */
    toClasses(/JSS 2A/);

    await screen.findByText("Fractions 3 assigned to JSS 2A.");
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("leaves on its own, as SM-01 says a confirmation does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      toClasses(/JSS 2A/);
      await screen.findByText("Fractions 3 assigned to JSS 2A.");

      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      expect(screen.queryByText("Fractions 3 assigned to JSS 2A.")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing when nothing was assigned", async () => {
    // Every child already had it: the wizard stays open and says why instead.
    create.mockResolvedValue({ assignmentIds: [], createdCount: 0, duplicateCount: 28 });
    toClasses(/JSS 2A/);

    expect(await screen.findByText(/already have this lesson/i)).toBeInTheDocument();
    expect(screen.queryByText(/assigned to JSS 2A\./)).not.toBeInTheDocument();
  });

  it("says nothing when the server refused it", async () => {
    create.mockRejectedValue(
      new ApiError(409, "conflict", {
        detail: { code: "lesson_not_approved", message: "Fractions 3 has 2 sections waiting for you." },
      }),
    );
    toClasses(/JSS 2A/);

    await screen.findByText(/Fractions 3 has 2 sections waiting for you/);
    expect(screen.queryByText(/assigned to JSS 2A\./)).not.toBeInTheDocument();
  });

  it("does not announce an assignment that only half happened", async () => {
    // One class landed, one did not. The wizard names the one that failed and
    // stays open - a confirmation here would call the whole thing done.
    create
      .mockResolvedValueOnce({ assignmentIds: ["a-1"], createdCount: 1 })
      .mockRejectedValueOnce(new ApiError(500, "server", undefined));
    toClasses(/JSS 2A/, /JSS 2B/);

    expect(await screen.findByText(/didn.t go through/i)).toBeInTheDocument();
    expect(screen.queryByText(/assigned to JSS 2A/)).not.toBeInTheDocument();
  });

  it("says nothing on the signed-out walkthrough, where nothing is sent", async () => {
    useHasSession.mockReturnValue(false);
    toClasses(/JSS 2A/);

    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByText(/assigned to/)).not.toBeInTheDocument();
  });
});

/**
 * THE SAMPLE LESSONS AND CLASSES CARRY THE MARK NOW.
 *
 * Neither did, so the signed-in end-to-end check - which counts
 * `data-nevo-sample` - could not see either, and does not visit this route.
 */
describe("what is marked as a sample", () => {
  const regions = () =>
    Array.from(document.querySelectorAll("[data-nevo-sample]")).map((e) =>
      e.getAttribute("data-nevo-sample"),
    );

  it("marks the walkthrough's lessons", () => {
    useLessonLibrary.mockReturnValue({
      cards: [],
      live: false,
      sample: false,
      loading: false,
      slow: false,
    });
    useHasSession.mockReturnValue(false);

    render(<AssignWizard />);

    expect(regions()).toContain("teacher:assign-lessons");
  });

  it("marks the sample classes a failed class read stands in with", () => {
    useTeacherClasses.mockReturnValue({
      options: CLASSES,
      classes: [],
      liveClasses: [],
      live: false,
      loading: false,
      sample: true,
    });
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(regions()).toContain("teacher:assign-classes");
  });

  it("marks nothing when the lessons and classes are the teacher's own", () => {
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(regions()).toEqual([]);
  });
});

/**
 * NOTHING TO ASSIGN, SAID. An empty library or no classes left a heading over
 * nothing and a Continue that would not go - with no reason anywhere.
 */
describe("a teacher with nothing to pick from", () => {
  it("says the library is empty", () => {
    useLessonLibrary.mockReturnValue({
      cards: [],
      live: true,
      sample: false,
      loading: false,
      slow: false,
    });
    render(<AssignWizard />);

    expect(screen.getByText(/Your library is empty, so there is nothing to assign yet/)).toBeInTheDocument();
  });

  it("says nothing of the kind over a library with lessons in it", () => {
    render(<AssignWizard />);

    expect(screen.queryByText(/library is empty/)).not.toBeInTheDocument();
  });

  it("says the teacher has no classes yet", () => {
    useTeacherClasses.mockReturnValue({
      options: [],
      classes: [],
      liveClasses: [],
      live: true,
      loading: false,
      sample: false,
    });
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText(/You don.t have any classes yet/)).toBeInTheDocument();
  });

  it("says nothing of the kind while the classes are still loading", () => {
    useTeacherClasses.mockReturnValue({
      options: [],
      classes: [],
      liveClasses: [],
      live: false,
      loading: true,
      sample: false,
    });
    render(<AssignWizard preselect="l-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.queryByText(/any classes yet/)).not.toBeInTheDocument();
  });
});
