import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TeacherClasses } from "@/hooks/useTeacherClasses";

const { useTeacherClasses, useCurrentUser, useTeacherHome } = vi.hoisted(() => ({
  useTeacherClasses: vi.fn(),
  useCurrentUser: vi.fn(),
  useTeacherHome: vi.fn(),
}));

vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser }));
vi.mock("@/hooks/useTeacherHome", () => ({ useTeacherHome }));

import { ClassesList } from "./ClassesList";
import { SCHOOL_LINE, TEACHER_CLASSES } from "@/lib/mocks/teacherClasses";

/**
 * The school line under "My Classes", and the flash it used to show.
 *
 * `SCHOOL_LINE` is the fixture string "Corona Secondary School · Second term".
 * The header rendered it whenever `live` was false - and `live` is false for
 * the whole in-flight window, not only after a failure. So a real teacher at
 * a real school watched another school's name, and a term that is not
 * necessarily theirs, sit under their own heading for as long as the read took:
 * 1.0-5.6s on this backend.
 *
 * `useTeacherClasses.loading` was added precisely to separate "not back yet"
 * from "never coming" - its own doc comment says so - and this header was the
 * one consumer still reading `live` alone.
 *
 * THE TEST HAS TO MOCK THE HOOK'S REAL SHAPE. A previous test in this repo
 * mocked the signed-out shape of this same hook and thereby concealed a
 * live-path bug for a week, so `state()` below returns every field, and the
 * loading case is built by changing ONE flag from the failure case.
 */

/** The hook's shape when there is no live data - fixtures on screen. */
const state = (over: Partial<TeacherClasses> = {}): TeacherClasses => ({
  classes: TEACHER_CLASSES,
  liveClasses: [],
  options: [],
  live: false,
  loading: false,
  sample: false,
  ...over,
});

/**
 * The home read, which this list now also makes for the headcount.
 *
 * Only `pulse` is read. Defaulting to empty means every existing test below
 * exercises the no-headcount path, which is the one that has to keep the old
 * "Synced from your school" line.
 */
const pulse = (rows: Array<{ classId: string; studentCount: number }> = []) => {
  useTeacherHome.mockReturnValue({
    pulse: rows.map((r) => ({
      classId: r.classId,
      className: "JSS 2A",
      studentCount: r.studentCount,
      tiles: [],
      quiet: false,
    })),
  });
};

beforeEach(() => {
  useTeacherClasses.mockReset();
  useCurrentUser.mockReset();
  useTeacherHome.mockReset();
  useCurrentUser.mockReturnValue(null);
  pulse();
});

describe("the school line", () => {
  it("shows nothing at all while the read is still in flight", () => {
    // The failure case and this differ by one flag, which is the point: the
    // old code could not tell them apart.
    useTeacherClasses.mockReturnValue(state({ loading: true }));

    render(<ClassesList />);

    expect(screen.getByText("My Classes")).toBeInTheDocument();
    expect(screen.queryByText(SCHOOL_LINE)).not.toBeInTheDocument();
  });

  it("still backs the designed screen once the read has actually failed", () => {
    // Not back yet and never coming are different, and only the second is a
    // reason to put the designed screen on display.
    useTeacherClasses.mockReturnValue(state({ loading: false, sample: true }));

    render(<ClassesList />);

    expect(screen.getByText(SCHOOL_LINE)).toBeInTheDocument();
  });

  it("never shows the fixture school to someone whose own school is known", () => {
    useTeacherClasses.mockReturnValue(state({ loading: false }));
    useCurrentUser.mockReturnValue({ school: "E2E Probe School" });

    render(<ClassesList />);

    expect(screen.getByText("E2E Probe School")).toBeInTheDocument();
    expect(screen.queryByText(SCHOOL_LINE)).not.toBeInTheDocument();
  });

  it("shows the teacher's own school, not a fixture, once live data is in", () => {
    useTeacherClasses.mockReturnValue(
      state({
        classes: [],
        liveClasses: [
          { classId: "c-1", className: "E2E Probe Class", classCode: "ABC123" },
        ] as TeacherClasses["liveClasses"],
        live: true,
      }),
    );
    useCurrentUser.mockReturnValue({ school: "E2E Probe School" });

    render(<ClassesList />);

    expect(screen.getByText("E2E Probe School")).toBeInTheDocument();
    expect(screen.queryByText(SCHOOL_LINE)).not.toBeInTheDocument();
  });
});

/**
 * The headcount on a real class card.
 *
 * `AssignedClassResponse` carries no studentCount, so the live card read
 * "Synced from your school" while the SAMPLE card beside it said "28 students".
 * The live list was strictly poorer than the fallback, on the one number a
 * teacher opening this page is most likely to want.
 *
 * The count comes from `ClassLearningPulseResponse.studentCount` on the home
 * read, keyed by the same classId. It is required on that schema, so the only
 * absence worth handling is a class missing from the pulse altogether.
 */
describe("the headcount on a live class card", () => {
  const liveOnly = (classId: string) =>
    state({
      classes: [],
      liveClasses: [
        {
          assignmentId: "a-1",
          classId,
          className: "JSS 2A",
          classCode: "NEVO-2A",
          role: "primary",
          assignedAt: "2026-09-01T09:00:00Z",
        },
      ],
      live: true,
    });

  it("shows the count when the pulse knows this class", () => {
    useTeacherClasses.mockReturnValue(liveOnly("c-1"));
    pulse([{ classId: "c-1", studentCount: 28 }]);

    render(<ClassesList />);

    expect(screen.getAllByText("28 students").length).toBeGreaterThan(0);
    expect(screen.queryByText("Synced from your school")).not.toBeInTheDocument();
  });

  it("says student, not students, for a class of one", () => {
    useTeacherClasses.mockReturnValue(liveOnly("c-1"));
    pulse([{ classId: "c-1", studentCount: 1 }]);

    render(<ClassesList />);

    expect(screen.getAllByText("1 student").length).toBeGreaterThan(0);
  });

  it("keeps the old line when the pulse does not know this class", () => {
    // A wrong number is worse than no number: "0 students" for a class that
    // simply is not in the pulse reads as a roster that has been emptied.
    useTeacherClasses.mockReturnValue(liveOnly("c-1"));
    pulse([{ classId: "some-other-class", studentCount: 30 }]);

    render(<ClassesList />);

    expect(screen.getAllByText("Synced from your school").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 students/)).not.toBeInTheDocument();
  });

  it("keeps the old line when the home read failed entirely", () => {
    useTeacherClasses.mockReturnValue(liveOnly("c-1"));
    pulse([]);

    render(<ClassesList />);

    expect(screen.getAllByText("Synced from your school").length).toBeGreaterThan(0);
  });
});

/**
 * The sample mark, which this screen did not have.
 *
 * Every other teacher fallback is wrapped in `SampleRegion` - Home in four
 * places, class detail, insights, lesson detail, student profile - and this one
 * was not, though it renders three invented classes with invented headcounts
 * and flag counts. `e2e/teacher-signed-in.spec.ts` walks `/teacher/classes` and
 * asserts zero `data-nevo-sample` nodes, so that assertion was VACUOUS here: the
 * screen could degrade to fixtures in front of a signed-in teacher and pass.
 *
 * There is a visible "these are sample classes" banner, so this was a test
 * coverage hole rather than a silent lie. The mark is what makes the existing
 * assertion able to see it.
 */
describe("the sample mark", () => {
  it("leaves no fixture card outside a sample region, in either layout", () => {
    /**
     * Asserted per CARD, not once per screen.
     *
     * The first version of this test asked only whether SOME marked region
     * existed. This screen renders the fixture list TWICE - a desktop grid and
     * a tablet stack, both in the DOM under jsdom because the layouts are
     * chosen with CSS - so deleting the mark from one of them left the other
     * satisfying the assertion. A mutation run proved it: stripping the desktop
     * wrapper changed nothing and the test still passed.
     *
     * Walking up from each rendered fixture name is what actually encodes the
     * property, and it stays true if the layouts are ever restructured.
     */
    useTeacherClasses.mockReturnValue(state({ sample: true }));

    render(<ClassesList />);

    const names = TEACHER_CLASSES.flatMap((c) => screen.getAllByText(c.name));
    expect(names.length).toBeGreaterThanOrEqual(TEACHER_CLASSES.length * 2);

    for (const node of names) {
      expect(node.closest("[data-nevo-sample]")).not.toBeNull();
    }
  });

  it("marks nothing when the teacher is seeing their own classes", () => {
    // An empty marked wrapper would fail the E2E assertion on a screen that is
    // behaving correctly, which is how a mark like this gets deleted.
    useTeacherClasses.mockReturnValue(
      state({
        classes: [],
        liveClasses: [
          {
            assignmentId: "a-1",
            classId: "c-1",
            className: "JSS 2A",
            classCode: "NEVO-2A",
            role: "primary",
            assignedAt: "2026-09-01T09:00:00Z",
          },
        ],
        live: true,
      }),
    );

    const { container } = render(<ClassesList />);

    expect(container.querySelector("[data-nevo-sample]")).toBeNull();
  });

  it("marks nothing while the read is still in flight", () => {
    useTeacherClasses.mockReturnValue(state({ loading: true }));

    const { container } = render(<ClassesList />);

    expect(container.querySelector("[data-nevo-sample]")).toBeNull();
  });
});

/**
 * Design, 30 Sep: children sign in with the school code and their own Student
 * ID, so a class code joins nobody to anything. The server still sends one.
 */
describe("the class code on a live class card", () => {
  it("is not shown, on either layout", () => {
    useTeacherClasses.mockReturnValue(
      state({
        classes: [],
        liveClasses: [
          {
            assignmentId: "a-1",
            classId: "c-1",
            className: "JSS 2A",
            classCode: "NEVO-2A",
            role: "primary",
            assignedAt: "2026-09-01T09:00:00Z",
          },
        ],
        live: true,
      }),
    );

    render(<ClassesList />);

    expect(screen.getAllByText("JSS 2A")).toHaveLength(2);
    expect(screen.queryByText(/NEVO-2A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Class code/)).not.toBeInTheDocument();
  });
});
