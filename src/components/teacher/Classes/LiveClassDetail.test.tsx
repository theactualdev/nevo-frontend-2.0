import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ClassStudent } from "@/lib/api/classes";

const { useClassRoster, useTeacherFlags, useClassLessons, clearPin } = vi.hoisted(() => ({
  useClassRoster: vi.fn(),
  useTeacherFlags: vi.fn(),
  useClassLessons: vi.fn(),
  clearPin: vi.fn(),
}));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, clearPin } };
});

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
  it("shows the login identifier, with the seat beside it", () => {
    // SCRUM-133: the identifier is how a child finds out their ID - they ask
    // their teacher. It used to give way to the seat, so a class with seats
    // showed nobody's ID.
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("amara.o · Seat 12")).toBeInTheDocument();
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
 * No class code (design, 30 Sep). A child signs in with the school code and
 * their own Student ID, and their roster row exists before they arrive, so a
 * class code joins nobody to anything. C12 and C18 were deleted that day.
 *
 * `klass` above still carries one, because the server still sends it: these
 * prove the screen does not show it.
 */
describe("the class code", () => {
  it("is not offered, even on a class that has one", () => {
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByRole("button", { name: /Class code/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/AB12/)).not.toBeInTheDocument();
  });

  it("is not what an empty roster tells a teacher to share", () => {
    useClassRoster.mockReturnValue({ students: [], loading: false, failed: false });
    render(<LiveClassDetail klass={klass} />);

    expect(
      screen.getByText("Your students will appear here as your school adds them."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/class code/i)).not.toBeInTheDocument();
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

/**
 * Clearing a forgotten PIN (SCRUM-216 / SCRUM-217, C05). A clear, never a PIN:
 * nothing here shows, accepts or generates one.
 */
describe("clearing a child's PIN", () => {
  beforeEach(() => {
    clearPin.mockReset().mockResolvedValue({ studentId: "s-1", clearedAt: "2026-10-06T09:00:00Z" });
  });

  const openMenu = (name = "Amara") =>
    fireEvent.click(screen.getByRole("button", { name: `More options for ${name}` }));

  it("offers the profile and Clear PIN from the row's menu", () => {
    render(<LiveClassDetail klass={klass} />);
    openMenu();

    expect(screen.getByRole("menuitem", { name: "View profile" })).toHaveAttribute(
      "href",
      "/teacher/students/s-1?class=c-1",
    );
    expect(screen.getByRole("menuitem", { name: "Clear PIN" })).toBeInTheDocument();
  });

  it("clears this child's PIN and says the child chooses the next one", async () => {
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));

    const dialog = await screen.findByRole("dialog", { name: "Amara’s PIN is cleared" });
    expect(clearPin).toHaveBeenCalledWith("s-1");
    expect(dialog).toHaveTextContent("Amara chooses a new PIN at the next sign-in.");
    // SCRUM-217: or a teacher goes looking for a PIN to read out.
    expect(dialog).toHaveTextContent("You won’t be able to see the new PIN. Only Amara will know it.");
    expect(dialog.textContent).not.toMatch(/\d{4}/);
  });

  it("marks the row once it is cleared, and closes on Done", async () => {
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/PIN cleared · new one not chosen yet/)).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("says so when the clear failed, and claims nothing", async () => {
    clearPin.mockRejectedValue(new Error("500"));
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t clear Amara’s PIN just now. Nothing has changed.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/PIN cleared/)).not.toBeInTheDocument();
  });

  it("holds the item while the clear is in flight", () => {
    clearPin.mockReturnValue(new Promise(() => {}));
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));

    expect(screen.getByRole("menuitem", { name: /Clearing/ })).toBeDisabled();
  });

  it("explains in place on a deactivated child, and clears nothing", () => {
    useClassRoster.mockReturnValue({
      students: [seg({ status: "deactivated" })],
      loading: false,
      failed: false,
    });
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));

    expect(
      screen.getByText(
        "Amara can’t sign in while the account is deactivated, so there’s no PIN to clear yet. Your admin manages access.",
      ),
    ).toBeInTheDocument();
    expect(clearPin).not.toHaveBeenCalled();
  });

  it("puts account access ahead of a cleared PIN on the row", async () => {
    useClassRoster.mockReturnValue({
      students: [seg({ status: "invited" })],
      loading: false,
      failed: false,
    });
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(screen.getByText("Invited")).toBeInTheDocument();
    expect(screen.queryByText(/PIN cleared · new one not chosen yet/)).not.toBeInTheDocument();
  });

  it("closes the menu on Escape and on a press elsewhere", () => {
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    openMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens one row's menu at a time", () => {
    useClassRoster.mockReturnValue({
      students: [seg(), seg({ studentId: "s-2", firstName: "Bello", lastName: "Ibrahim", displayName: "Bello Ibrahim" })],
      loading: false,
      failed: false,
    });
    render(<LiveClassDetail klass={klass} />);
    openMenu("Amara");
    openMenu("Bello");

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Options for Bello" })).toBeInTheDocument();
  });

  it("starts each opening clean", async () => {
    clearPin.mockRejectedValueOnce(new Error("500"));
    render(<LiveClassDetail klass={klass} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));
    await screen.findByRole("alert");
    openMenu();
    openMenu();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tells the teacher what Clear PIN does, over the rows", () => {
    render(<LiveClassDetail klass={klass} />);

    expect(
      screen.getByText(/If a child forgets their PIN, you can clear it and they choose a new one themselves/),
    ).toBeInTheDocument();
  });
});

/**
 * C05's status precedence: "account access first, then a forgotten PIN, then
 * attention. Each replaces the next rather than stacking."
 */
describe("what a row says about a child, in order", () => {
  const flagged = () =>
    useTeacherFlags.mockReturnValue({
      flags: [{ id: "f-1", studentId: "s-1", isSudden: false, note: "Slower on written work." }],
      live: true,
      failed: false,
    });

  it("shows the account state instead of the attention marker", () => {
    flagged();
    useClassRoster.mockReturnValue({ students: [seg({ status: "deactivated" })], loading: false, failed: false });
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Deactivated")).toBeInTheDocument();
    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
  });

  it("still shows the attention marker for an active child", () => {
    flagged();
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Worth a glance")).toBeInTheDocument();
  });

  it("puts a cleared PIN ahead of attention too", async () => {
    flagged();
    clearPin.mockReset().mockResolvedValue({ studentId: "s-1", clearedAt: "2026-10-06T09:00:00Z" });
    render(<LiveClassDetail klass={klass} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Amara" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(screen.getByText(/PIN cleared · new one not chosen yet/)).toBeInTheDocument();
    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
  });
});
