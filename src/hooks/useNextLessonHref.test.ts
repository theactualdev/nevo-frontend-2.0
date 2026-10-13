import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useNextLessonHref } from "./useNextLessonHref";
import { clearSession, setSession } from "@/lib/auth/session";
import { FIRST_LESSON_ID } from "@/lib/mocks";

/**
 * The defect this pins: a signed-in child was handed the mock photosynthesis
 * lesson for the whole time their dashboard read was in flight.
 *
 * Both hand-offs read `assigned ? real : dashboard ? "/student/lessons" :
 * FIRST_LESSON_ID`, meaning to say "signed out gets the demo lesson". But
 * `dashboard` is a live read's `data`, and `data === null` covers IN FLIGHT as
 * well as signed out - and one of the two screens fires the instant an account
 * is created, when the read has had no time at all.
 *
 * So the case that matters is the middle one: signed in, data still null. It
 * must not be the mock, and it must not wait.
 */

const dashboard = vi.hoisted(() => ({ useStudentDashboard: vi.fn() }));
vi.mock("./useStudentDashboard", () => dashboard);

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

const read = (data: unknown, loading = false) =>
  dashboard.useStudentDashboard.mockReturnValue({
    data,
    loading,
    failed: false,
  });

beforeEach(() => {
  dashboard.useStudentDashboard.mockReset();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("useNextLessonHref", () => {
  it("does not send a signed-in child to the demo lesson while the read is in flight", () => {
    signIn();
    read(null, true);

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).not.toContain(FIRST_LESSON_ID);
    expect(result.current).toBe("/student/lessons");
  });

  it("does not send a signed-in child to the demo lesson when the read failed", () => {
    signIn();
    read(null);

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).not.toContain(FIRST_LESSON_ID);
  });

  it("sends them to the lesson their teacher actually set", () => {
    signIn();
    read({
      assignments: [
        /*
         * WAS `status: "completed"`, a value `AssignmentStatus` does not
         * contain — the fixture mirrored the dead filter it was written
         * against, so it passed for a reason unrelated to the behaviour.
         * Cancelled is the real thing a teacher can do, and the one this has
         * to skip. `availableFrom` is required on the read, so it is here too.
         */
        { status: "cancelled", availableFrom: null, lesson: { id: "done-1" } },
        {
          id: "asg-9",
          status: "assigned",
          availableFrom: null,
          lesson: { id: "real-lesson" },
        },
      ],
      recentProgress: [],
    });

    const { result } = renderHook(() => useNextLessonHref());

    // With the assignment, or the player files the work under nothing and
    // never shows the teacher's note. "You're In" and the warm-up both land
    // here, so this is the first lesson many children ever open.
    expect(result.current).toBe("/student/lessons/real-lesson?assignment=asg-9");
  });

  it("sends a signed-in child with nothing set to their lessons list", () => {
    signIn();
    read({ assignments: [], recentProgress: [] });

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).toBe("/student/lessons");
  });

  it("keeps the demo lesson for the signed-out walkthrough", () => {
    // Onboarding IS the designed walkthrough when nobody is signed in, and the
    // demo lesson is the point of it - so this one is deliberate, not a leak.
    read(null);

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).toBe(`/student/lessons/${FIRST_LESSON_ID}`);
  });
});

/**
 * The button could hand a child into a lesson their teacher had called off.
 *
 * `.find((a) => a.status !== "completed")` filtered out finished work and
 * nothing else: a cancelled assignment, or one not open yet, passed it, so the
 * first unfinished assignment won whatever else was true of it. This is the
 * button at the end of onboarding and at the
 * end of the daily warm-up, so it is the first lesson many children ever open.
 */
describe("useNextLessonHref — what a teacher has actually set", () => {
  it("does not send a child into a cancelled lesson", () => {
    signIn();
    read({
      assignments: [
        { status: "cancelled", availableFrom: null, lesson: { id: "off-1" } },
      ],
      recentProgress: [],
    });

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).toBe("/student/lessons");
  });

  it("does not send a child into a lesson that opens on Friday", () => {
    signIn();
    read({
      assignments: [
        {
          status: "assigned",
          availableFrom: new Date(Date.now() + 86_400_000).toISOString(),
          lesson: { id: "friday-1" },
        },
      ],
      recentProgress: [],
    });

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).toBe("/student/lessons");
  });

  it("still takes one that has already opened", () => {
    // Without this, a filter that dropped everything would pass both above.
    signIn();
    read({
      assignments: [
        {
          status: "assigned",
          availableFrom: new Date(Date.now() - 86_400_000).toISOString(),
          lesson: { id: "open-1" },
        },
      ],
      recentProgress: [],
    });

    const { result } = renderHook(() => useNextLessonHref());

    expect(result.current).toBe("/student/lessons/open-1");
  });
});
