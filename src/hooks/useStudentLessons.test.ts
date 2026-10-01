import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStudentLessons } from "./useStudentLessons";

/**
 * The child's whole lesson list showed work that was not theirs to do.
 *
 * This hook was a bare `data.assignments.map(...)` with no filter of any kind,
 * so every assignment the dashboard returned became a card: one a teacher had
 * cancelled, one that does not open until Friday, all of them.
 *
 * It matters more here than on Home, because the Lessons tab IS the child's
 * list. Its empty state — "nothing has been assigned yet" — is gated on this
 * array, so a child whose only assignment had been cancelled was never told
 * their list was empty. They were shown the cancelled lesson instead.
 */

const dashboard = vi.hoisted(() => vi.fn());
vi.mock("./useStudentDashboard", () => ({ useStudentDashboard: dashboard }));

const lesson = (id: string) => ({ id, title: `Lesson ${id}`, segmentCount: 4 });

const assignment = (
  id: string,
  over: Partial<{ status: string; availableFrom: string | null }> = {},
) => ({
  id: `a-${id}`,
  status: "assigned",
  availableFrom: null,
  lesson: lesson(id),
  ...over,
});

const read = (assignments: unknown[]) =>
  dashboard.mockReturnValue({
    data: { assignments, recentProgress: [] },
    loading: false,
    failed: false,
  });

const titles = (r: { current: { lessons: { lessonId: string }[] } }) =>
  r.current.lessons.map((l) => l.lessonId);

beforeEach(() => {
  dashboard.mockReset();
});

describe("which lessons reach a child's Lessons tab", () => {
  it("drops one the teacher cancelled", () => {
    // THE DEFECT.
    read([assignment("keep"), assignment("off", { status: "cancelled" })]);

    const { result } = renderHook(() => useStudentLessons());

    expect(titles(result)).toEqual(["keep"]);
  });

  it("drops one that has not opened yet", () => {
    read([
      assignment("keep"),
      assignment("friday", {
        availableFrom: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ]);

    const { result } = renderHook(() => useStudentLessons());

    expect(titles(result)).toEqual(["keep"]);
  });

  it("keeps one whose opening time has passed", () => {
    read([
      assignment("opened", {
        availableFrom: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    ]);

    const { result } = renderHook(() => useStudentLessons());

    expect(titles(result)).toEqual(["opened"]);
  });

  it("keeps an ordinary assignment with no opening time", () => {
    /*
     * The one that stops a filter from simply emptying the tab. `availableFrom`
     * is nullable and null means there is no opening time — if absence were
     * read as "later", every ordinary lesson would vanish and the child would
     * be told nothing had been assigned.
     */
    read([assignment("plain")]);

    const { result } = renderHook(() => useStudentLessons());

    expect(titles(result)).toEqual(["plain"]);
  });

  it("leaves the list genuinely empty when everything was cancelled", () => {
    // So the tab can honestly say nothing is waiting, which it could not do
    // while the cancelled lesson was still standing in the list.
    read([assignment("off", { status: "cancelled" })]);

    const { result } = renderHook(() => useStudentLessons());

    expect(titles(result)).toEqual([]);
    expect(result.current.live).toBe(true);
  });
});

describe("what the live row carries onto the card", () => {
  /**
   * THE HOOK'S OWN DOCBLOCK WAS OUT OF DATE, AND THE SCREEN BELIEVED IT.
   *
   * It said assignments carry no subject and no time estimate. Both had
   * shipped - `subject` on 31 Aug, `estimatedMinutes` on 1 Sep - and the
   * nested `LessonSummaryResponse` carries them, checked against the deployed
   * spec rather than against the comment. So a signed-in child's list was
   * ungrouped and read "4 sections" where the designed one reads "About 12
   * min", for no reason but a stale sentence.
   */
  const withLesson = (over: Record<string, unknown>) =>
    read([
      {
        id: "a-1",
        status: "assigned",
        availableFrom: null,
        lesson: { id: "l-1", title: "Adding Fractions", segmentCount: 4, ...over },
      },
    ]);

  const first = () => renderHook(() => useStudentLessons()).result.current.lessons[0];

  it("carries the subject the lesson was uploaded with", () => {
    withLesson({ subject: "Mathematics" });

    expect(first().subject).toBe("Mathematics");
  });

  it("carries no subject when the lesson has none", () => {
    // Only the staged upload routes can set one, so most lessons have none -
    // and a subject invented for them would name something nobody chose.
    withLesson({ subject: null });

    expect(first().subject).toBeUndefined();
  });

  it("treats a blank subject as no subject", () => {
    withLesson({ subject: "   " });

    expect(first().subject).toBeUndefined();
  });

  it("says about how long the lesson takes", () => {
    // "About" because it is estimated from word count at a school reading
    // pace - a planning figure, not a measurement of this child.
    withLesson({ estimatedMinutes: 12 });

    expect(first().timeEstimate).toBe("About 12 min");
  });

  it("falls back to the section count when nobody estimated one", () => {
    /*
     * ZERO AND ABSENT BOTH MEAN "NO ESTIMATE". `estimatedMinutes` is floored
     * per content type so a real lesson is never 0, which makes 0 - its schema
     * default - the unset case rather than a very short lesson. Neither may be
     * drawn as "0 min".
     */
    withLesson({ estimatedMinutes: 0 });
    expect(first().timeEstimate).toBe("4 sections");

    withLesson({});
    expect(first().timeEstimate).toBe("4 sections");
  });

  it("counts one section as a section", () => {
    withLesson({ segmentCount: 1 });

    expect(first().timeEstimate).toBe("1 section");
  });
});

describe("which piece of set work a card is", () => {
  it("carries the assignment, so opening it files progress there", () => {
    // The preview pushed the bare lesson URL, and the player reads
    // `?assignment=` only - so a lesson opened from this tab recorded
    // progress against no assignment and never showed the teacher's note.
    read([assignment("one")]);

    const { result } = renderHook(() => useStudentLessons());

    expect(result.current.lessons[0]?.assignmentId).toBe("a-one");
  });
});
