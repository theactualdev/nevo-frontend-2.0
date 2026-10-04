import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ClassStudent } from "@/lib/api/classes";

const { useClassRoster, useTeacherFlags, push, useClassLessons } = vi.hoisted(() => ({
  useClassRoster: vi.fn(),
  useTeacherFlags: vi.fn(),
  push: vi.fn(),
  useClassLessons: vi.fn(),
}));

// Added when "Show full screen" stopped being a local overlay and became a
// navigation to /teacher/classes/{id}/code. Without this every test in the file
// dies on "invariant expected app router to be mounted".
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
}));

vi.mock("@/hooks/useClassRoster", async (importOriginal) => ({
  // `studentName` and `lastSeenLine` are real: they are the row's own logic and
  // stubbing them would test a row that does not exist.
  ...(await importOriginal<typeof import("@/hooks/useClassRoster")>()),
  useClassRoster,
}));
vi.mock("@/hooks/useTeacherFlags", () => ({ useTeacherFlags }));
vi.mock("@/hooks/useClassLessons", () => ({ useClassLessons }));

import { LiveClassDetail } from "./LiveClassDetail";

/**
 * C16b Student Observations, on the class detail roster.
 *
 * WHAT WAS THROWN AWAY. `observations` and `seatContext` have arrived on every
 * roster row since 3 Sep, and nothing rendered either. The frame was drawn the
 * whole time. `observations` is `{pattern, count}` over a closed five-value
 * enum, and the wording for those five already existed in
 * `lib/constants/observations.ts` - written, Zero-Tag reviewed and tested - for
 * the SENCo view. So this screen was one import away from the drawn design and
 * nobody had made it.
 *
 * THE COPY IS IMPORTED, NEVER RESTATED. That file says so itself: it is the
 * only copy of these five strings, "so a second screen that grows an
 * observations row imports from here rather than writing a set that drifts from
 * this one." These assertions read the constants rather than hardcoding the
 * words, so a Zero-Tag revision there cannot leave this screen behind.
 */

const seg = (over: Partial<ClassStudent> = {}): ClassStudent =>
  ({
    studentId: "s-1",
    firstName: "Amara",
    lastName: "Okafor",
    displayName: "Amara Okafor",
    loginIdentifier: "amara.o",
    status: "active",
    profileStatus: "observed",
    latestSessionAt: "2026-09-14T08:00:00Z",
    observations: [],
    seatContext: "Seat 12",
    consent: null,
    ...over,
  }) as unknown as ClassStudent;

const klass = {
  classId: "c-1",
  className: "JSS 2B",
  classCode: "AB12",
  role: "primary_teacher",
} as never;

beforeEach(() => {
  useClassRoster.mockReset();
  useTeacherFlags.mockReset();
  useTeacherFlags.mockReturnValue({ flags: [], live: true, failed: false });
  useClassLessons.mockReset();
  useClassLessons.mockReturnValue({ lessons: [], loading: false, failed: false });
  useClassRoster.mockReturnValue({ students: [seg()], loading: false, failed: false });
});

describe("observation chips", () => {
  it("renders the approved wording for a pattern, not the raw enum token", async () => {
    const { OBSERVATION_COPY } = await import("@/lib/constants/observations");
    useClassRoster.mockReturnValue({
      students: [seg({ observations: [{ pattern: "revisited_content", count: 3 }] })],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(
      screen.getByText(new RegExp(OBSERVATION_COPY.revisited_content.title, "i")),
    ).toBeInTheDocument();
    expect(screen.queryByText(/revisited_content/)).not.toBeInTheDocument();
  });

  it("says how many times, when it was told", async () => {
    useClassRoster.mockReturnValue({
      students: [seg({ observations: [{ pattern: "completed_lessons", count: 3 }] })],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText(/3 times/)).toBeInTheDocument();
  });

  it("says nothing about a count it was not given", () => {
    // `count` is nullable on the contract. An earlier card printed "null
    // times"; absent means we were not told how many, which is not zero.
    useClassRoster.mockReturnValue({
      students: [seg({ observations: [{ pattern: "completed_lessons", count: null }] })],
      loading: false,
      failed: false,
    });

    const { container } = render(<LiveClassDetail klass={klass} />);

    expect(container.textContent).not.toMatch(/null|undefined|0 times|NaN/);
  });

  it("falls back to the profile line when there are no observations", () => {
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText(/Learning profile building/)).toBeInTheDocument();
  });

  it("ignores a pattern added to the enum after this shipped", () => {
    // The set is closed today; a sixth value must not render as `undefined`.
    useClassRoster.mockReturnValue({
      students: [
        seg({
          observations: [{ pattern: "some_future_pattern", count: 1 }] as never,
        }),
      ],
      loading: false,
      failed: false,
    });

    const { container } = render(<LiveClassDetail klass={klass} />);

    expect(container.textContent).not.toMatch(/undefined|some_future_pattern/);
  });
});

describe("seat context", () => {
  it("shows the seat rather than the login identifier", () => {
    // A teacher looking at their class wants the seat; the login identifier is
    // an account detail that belongs on the admin roster.
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Seat 12")).toBeInTheDocument();
    expect(screen.queryByText("amara.o")).not.toBeInTheDocument();
  });

  it("falls back to the login identifier when there is no seat", () => {
    useClassRoster.mockReturnValue({
      students: [seg({ seatContext: "" })],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("amara.o")).toBeInTheDocument();
  });
});

describe("the two markers", () => {
  it("says the words rather than relying on a colour", () => {
    // Violet already means "has a learning profile" on this row, and colour
    // alone excludes anyone who cannot separate the two.
    useTeacherFlags.mockReturnValue({
      flags: [{ id: "f-1", studentId: "s-1", name: "Amara", context: null, note: "", generatedAt: "", isSudden: false }],
      live: true,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Worth a glance")).toBeInTheDocument();
  });

  it("distinguishes a sudden change from an ordinary glance", () => {
    useTeacherFlags.mockReturnValue({
      flags: [{ id: "f-1", studentId: "s-1", name: "Amara", context: null, note: "", generatedAt: "", isSudden: true }],
      live: true,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Sudden change")).toBeInTheDocument();
    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
  });

  it("marks nobody when a flag belongs to a student in another class", () => {
    useTeacherFlags.mockReturnValue({
      flags: [{ id: "f-9", studentId: "SOMEONE-ELSE", name: "Chidi", context: null, note: "", generatedAt: "", isSudden: true }],
      live: true,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText("Sudden change")).not.toBeInTheDocument();
    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
  });
});

describe("the section copy", () => {
  it("dates nothing, because the route declares no window", () => {
    // C16b says "this week". The roster route declares no window and no cap, so
    // that is a claim the API has not made about a named child.
    const { container } = render(<LiveClassDetail klass={klass} />);

    expect(container.textContent).toMatch(/What Nevo has noticed about each student/);
    expect(container.textContent).not.toMatch(/this week|last 30 days|this month/i);
  });
});

describe("whether the child can get in", () => {
  /**
   * `status` arrived on every roster row from the start and was discarded at
   * render, so two rows looked identical whether or not the child could use
   * Nevo at all. Design's no-consent-column ruling rests on this being shown.
   */
  const roster = (...students: ReturnType<typeof seg>[]) =>
    useClassRoster.mockReturnValue({ students, loading: false, failed: false });

  it("marks a child whose account has been switched off", () => {
    roster(seg({ status: "deactivated" }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Deactivated")).toBeInTheDocument();
  });

  it("marks a child who has never opened their account", () => {
    roster(seg({ status: "invited" }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  it("marks nothing at all for an ordinary active child", () => {
    // The teacher is looking for the exception. A marker on every row is
    // decoration, and this row already carries four other signals.
    //
    // Asserting only that "Deactivated" and "Invited" are absent was too weak:
    // a mutation marking active rows "Active" passed, because neither of those
    // two words appears. The first fix was weak for a subtler reason - it read
    // `container.textContent` against /\bActive\b/, and textContent concatenates
    // adjacent elements with no separator, so the row renders as
    // "...profile buildingActiveHere yesterday" and the word boundary never
    // matches. An assertion that cannot fail is worse than none.
    //
    // `queryByText` matches per element, so it sees the marker's own span.
    roster(seg({ status: "active" }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText("Deactivated")).not.toBeInTheDocument();
    expect(screen.queryByText("Invited")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("does not call an unrecognised status deactivated", () => {
    // The whole row is rendered from an unvalidated payload. Saying a real
    // child has been switched off, because we did not recognise a value, is
    // the failure that matters here.
    roster(seg({ status: "pending" as never }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText("Deactivated")).not.toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  it("marks only the child it belongs to", () => {
    roster(
      seg({ studentId: "s-1", firstName: "Amara", status: "deactivated" }),
      seg({ studentId: "s-2", firstName: "Tunde", status: "active" }),
    );
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getAllByText("Deactivated")).toHaveLength(1);
  });

  it("gives no reason and never mentions consent", () => {
    // "No consent, no reason, just whether the child is active" is the ruling
    // this screen exists to satisfy. The consent payload IS on this response,
    // so its absence has to be asserted rather than assumed.
    roster(seg({ status: "deactivated" }));
    const { container } = render(<LiveClassDetail klass={klass} />);

    expect(container.textContent).not.toMatch(/consent|permission|guardian/i);
    expect(container.textContent).not.toMatch(/because|restore|reactivate/i);
  });

  it("says the word rather than relying on a colour", () => {
    // Violet already means "has a learning profile" on this row and navy means
    // "Sudden change". Admin draws this pill violet; here that would be a third
    // meaning on a colour carrying two.
    roster(seg({ status: "deactivated" }));
    render(<LiveClassDetail klass={klass} />);

    const mark = screen.getByText("Deactivated");
    expect(mark.className).not.toMatch(/violet|navy/);
  });
});

/**
 * Projecting the class code.
 *
 * "Show full screen" used to swap local state for an overlay with no URL, so a
 * teacher who closed it had to walk back through class detail and the dialog to
 * get it up again. Design's ruling for the standalone route is that teachers
 * "project it, read it aloud and RETURN TO IT", and the third of those is the
 * one an overlay cannot do.
 *
 * The route renders the same `ClassQrScreen`, so what is projected is unchanged.
 */
describe("projecting the class code", () => {
  it("navigates to the class code route rather than opening an overlay", async () => {
    render(<LiveClassDetail klass={klass} />);

    fireEvent.click(screen.getByRole("button", { name: /Class code/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Show full screen/i }));

    expect(push).toHaveBeenCalledWith("/teacher/classes/c-1/code");
  });

  it("still opens the dialog from the class header", () => {
    // The dialog is the in-console view and design kept it; only the
    // projection moved to a URL.
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByRole("button", { name: /Show full screen/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Class code/i }));

    expect(screen.getByRole("button", { name: /Show full screen/i })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

/**
 * The Lessons tab (design, 16 Sep).
 *
 * It ships because the library CANNOT be filtered by class - `GET
 * /api/content/lessons` takes `limit` and `scope` only, `LessonScope` is
 * `mine | school`, and `LessonSummaryResponse` carries no class - so without it
 * a teacher has no way to answer "what has this class been given", which design
 * notes they ask every week.
 *
 * Read-only by ruling: "No authoring on that surface. Library stays the only
 * place a lesson is created."
 */
describe("the Lessons tab", () => {
  const lesson = (over = {}) => ({
    lessonId: "l-1",
    title: "Fractions 3",
    studentCount: 28,
    cancelled: false,
    assignedAt: "2026-09-10T09:00:00Z",
    opensAt: null,
    ...over,
  });

  const openLessons = () =>
    fireEvent.click(screen.getByRole("tab", { name: /lessons/i }));

  it("offers Roster and Lessons, and no Activity tab", () => {
    // Design: a per-class activity feed "is a surveillance surface by default
    // and we have nothing that needs it."
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByRole("tab", { name: /roster/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /lessons/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /activity/i })).not.toBeInTheDocument();
  });

  it("lists what the class has been given", () => {
    useClassLessons.mockReturnValue({
      lessons: [lesson()],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);
    openLessons();

    expect(screen.getByText("Fractions 3")).toBeInTheDocument();
    expect(screen.getByText("28 students")).toBeInTheDocument();
  });

  it("carries no way to assign a lesson from this surface", () => {
    useClassLessons.mockReturnValue({
      lessons: [lesson()],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);
    openLessons();

    for (const label of [/assign/i, /add a lesson/i, /new lesson/i, /remove/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  it("says a lesson was called off rather than counting nobody", () => {
    useClassLessons.mockReturnValue({
      lessons: [lesson({ cancelled: true, studentCount: 0 })],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);
    openLessons();

    expect(screen.getByText("Called off")).toBeInTheDocument();
    expect(screen.queryByText(/0 students/)).not.toBeInTheDocument();
  });

  it("distinguishes an empty class from a failed read", () => {
    useClassLessons.mockReturnValue({ lessons: [], loading: false, failed: true });

    render(<LiveClassDetail klass={klass} />);
    openLessons();

    expect(screen.getByText(/couldn’t load what this class/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing has been set/i)).not.toBeInTheDocument();
  });

  it("tells a teacher nothing is set yet when the read succeeded and is empty", () => {
    useClassLessons.mockReturnValue({ lessons: [], loading: false, failed: false });

    render(<LiveClassDetail klass={klass} />);
    openLessons();

    expect(screen.getByText(/Nothing has been set for this class yet/i)).toBeInTheDocument();
  });

  it("shows the roster first, not the lessons", () => {
    useClassLessons.mockReturnValue({
      lessons: [lesson()],
      loading: false,
      failed: false,
    });

    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText("Fractions 3")).not.toBeInTheDocument();
  });
});

/**
 * WHEN A READ BEHIND THE ROSTER FAILED.
 *
 * The roster's failure card said "Try again in a moment" with nothing to
 * press, and a failed flags read removed every "Worth a glance" marker with
 * nothing saying so - a class with nothing worth a glance, as far as the
 * screen could tell anyone.
 */
describe("a roster read that failed", () => {
  it("offers the Try again it promises", () => {
    useClassRoster.mockReturnValue({ students: [], loading: false, failed: true });
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("offers no retry over a class nobody has joined yet", () => {
    useClassRoster.mockReturnValue({ students: [], loading: false, failed: false });
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("a flags read that failed", () => {
  it("says no one is marked because it could not check, not because nobody is", () => {
    useTeacherFlags.mockReturnValue({ flags: [], live: false, failed: true });
    render(<LiveClassDetail klass={klass} />);

    expect(
      screen.getByText(/couldn.t read what needs your attention just now, so no one below is marked/),
    ).toBeInTheDocument();
  });

  it("says nothing of the kind when the flags read landed", () => {
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText(/no one below is marked/)).not.toBeInTheDocument();
  });
});
