import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useStudentLesson } from "./useStudentLesson";
import { clearSession, setSession } from "@/lib/auth/session";
import { FIRST_LESSON_ID } from "@/lib/mocks";
import { ApiError } from "@/lib/api/client";
import { saveLesson, savedLesson } from "@/lib/offline/savedLessons";

/**
 * The worst thing this hook could do, and did.
 *
 * The two authored lessons are the signed-out walkthrough. But `mock` was read
 * unconditionally and the flags were `failed && !mock`, so a SIGNED-IN child
 * whose lesson 404'd or whose read failed was handed the authored
 * photosynthesis lesson of the same id - a rich, multi-modal lesson that does
 * not exist in their school's library, shown at exactly the moment the backend
 * had failed them. `LessonRoute` wrapped it in `SampleRegion`, which is
 * `display: contents`: readable by a test, invisible to the child, their
 * teacher, or anyone watching a demo over their shoulder.
 *
 * So these tests are about who is allowed to see invented content. A signed-out
 * visitor: yes, that is the designed walkthrough. A signed-in child: never, and
 * least of all when something has gone wrong.
 */

const { detail, modules, dashboard, adaptation, accommodations } = vi.hoisted(
  () => ({
    detail: vi.fn(),
    modules: vi.fn(),
    dashboard: vi.fn(),
    adaptation: vi.fn(),
    accommodations: vi.fn(),
  }),
);

vi.mock("@/lib/api/lessons", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  lessonsApi: { detail, modules },
}));
vi.mock("./useStudentDashboard", () => ({ useStudentDashboard: dashboard }));
vi.mock("./useAdaptation", () => ({ useAdaptation: adaptation }));
vi.mock("./useAccommodations", () => ({
  useAccommodationsState: accommodations,
}));

/** The shape the live-read test already proves `lessonFromContent` accepts. */
const LIVE_LESSON = {
  id: FIRST_LESSON_ID,
  title: "Fractions Lesson 3",
  confirmationSummary: null,
  segments: [
    {
      id: "seg-1",
      segmentKey: "s1",
      contentType: "explanatory_text",
      sequenceOrder: 1,
      title: "Numerators",
      body: "The number on top.",
      availableModalities: ["text"],
      comprehensionCheckpoints: [],
      textVariant: null,
      visualVariant: null,
      audioVariant: null,
      interactiveVariant: null,
      calculationVariant: null,
      needsReview: false,
      reviewReasons: [],
    },
  ],
};

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  clearSession();
  modules.mockResolvedValue([]);
  dashboard.mockReturnValue({ data: null, loading: false, failed: false });
  // The engine has answered, with nothing to change - a settled read.
  adaptation.mockReturnValue({
    plan: { lessonId: FIRST_LESSON_ID, segments: [] },
    error: null,
  });
  accommodations.mockReturnValue({ active: null, settled: true });
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.clearAllMocks();
});

describe("useStudentLesson", () => {
  it("does not hand a signed-in child the fixture when their lesson is gone", async () => {
    signIn();
    detail.mockRejectedValue(new ApiError(404, "Not found"));

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    // The id IS one the mock registry holds. That used to be enough to paper
    // over a 404 with photosynthesis.
    expect(result.current.lesson).toBeNull();
    expect(result.current.missing).toBe(true);
  });

  it("does not hand a signed-in child the fixture when the read fails", async () => {
    signIn();
    detail.mockRejectedValue(new ApiError(500, "Server error"));

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.lesson).toBeNull();
  });

  it("does not lend a signed-in child an authored adaptation plan either", async () => {
    // The authored plan is richer than anything the engine returns, so it would
    // have made the failure look like an unusually good lesson.
    signIn();
    detail.mockRejectedValue(new ApiError(500, "Server error"));

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.plan).toBeNull();
  });

  it("still gives a signed-out visitor the designed walkthrough", async () => {
    // No session, no read, and the authored lesson is the whole point.
    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.live).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(detail).not.toHaveBeenCalled();
  });

  it("serves a signed-in child their school's lesson when the read works", async () => {
    signIn();
    detail.mockResolvedValue({
      id: FIRST_LESSON_ID,
      title: "Fractions Lesson 3",
      confirmationSummary: null,
      segments: [
        {
          id: "seg-1",
          segmentKey: "s1",
          contentType: "explanatory_text",
          sequenceOrder: 1,
          title: "Numerators",
          body: "The number on top.",
          availableModalities: ["text"],
          comprehensionCheckpoints: [],
          textVariant: null,
          visualVariant: null,
          audioVariant: null,
          interactiveVariant: null,
          calculationVariant: null,
          needsReview: false,
          reviewReasons: [],
        },
      ],
    });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.live).toBe(true);
    expect(result.current.lesson?.title).toBe("Fractions Lesson 3");
  });
  it("does not ask the engine to adapt when the caller says not to", async () => {
    /*
     * `useAdaptation` posts `mode: "lesson_load"`. The after-lesson screens read
     * the same lesson, and firing it from `/summary` would tell the engine a
     * child has just STARTED a lesson they have just finished - a fabricated
     * signal about a child's learning, which is the one kind this product must
     * never send.
     *
     * Gating on `live` is not enough: a real lesson's summary IS live. The
     * lesson id reaching `useAdaptation` as undefined is the whole mechanism,
     * so that is what this asserts.
     */
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({ data: null, loading: false, failed: false });

    const { result } = renderHook(() =>
      useStudentLesson(FIRST_LESSON_ID, { adapt: false }),
    );

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(adaptation).toHaveBeenCalled();
    expect(adaptation.mock.calls.at(-1)?.[0]).toBeUndefined();
  });

  it("adapts by default, so the player is untouched", async () => {
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({ data: null, loading: false, failed: false });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(adaptation.mock.calls.at(-1)?.[0]).toBe(FIRST_LESSON_ID);
  });
  it("does not open a lesson before the child's saved place has arrived", async () => {
    /*
     * THE RESUME RACE, and the reason losing it was worse than it sounds.
     *
     * The saved position lives on the DASHBOARD read; the lesson is a separate
     * request racing it. Rendering on the lesson alone opened the player at
     * segment 0 - and the player's position effect then wrote
     * `in_progress, segment 0` over the place the child had actually reached.
     * The saved position was not merely ignored; it was destroyed by the act of
     * ignoring it.
     *
     * So the hook must report `loading` until BOTH have answered.
     */
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    modules.mockResolvedValue([]);
    // The lesson has landed; the dashboard has not.
    dashboard.mockReturnValue({ data: null, loading: true, failed: false });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.loading).toBe(true);
  });

  it("opens it once both reads have answered", async () => {
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({
      data: { assignments: [], recentProgress: [] },
      loading: false,
      failed: false,
    });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lesson).not.toBeNull();
  });

  it("hands back the saved place once it has it", async () => {
    signIn();
    // Five segments, because `resumeAt` is CLAMPED to the lesson's length - a
    // one-segment fixture pins every saved position to 0 and the assertion
    // below would pass against a hook that ignored the saved place entirely.
    const seg = LIVE_LESSON.segments[0];
    detail.mockResolvedValue({
      ...LIVE_LESSON,
      segments: [0, 1, 2, 3, 4].map((i) => ({
        ...seg,
        id: `seg-${i}`,
        segmentKey: `s${i}`,
        sequenceOrder: i + 1,
      })),
    });
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({
      data: {
        assignments: [],
        recentProgress: [
          {
            lessonId: FIRST_LESSON_ID,
            status: "in_progress",
            segmentPosition: 3,
            updatedAt: "2026-09-14T10:00:00Z",
          },
        ],
      },
      loading: false,
      failed: false,
    });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resumeAt).toBe(3);
  });

  it("does not wait on the dashboard for the authored walkthrough", async () => {
    // A signed-out visitor never reads the dashboard, and the walkthrough has
    // no saved place to wait for. Blocking on it would hang that screen.
    dashboard.mockReturnValue({ data: null, loading: true, failed: false });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.loading).toBe(false);
  });

  it("shows a failed read as failed, rather than waiting on the dashboard", () => {
    /*
     * The `live &&` in the loading gate. Without it, a child whose LESSON read
     * failed would sit on a skeleton for as long as the dashboard took - and if
     * the dashboard never answered either, forever. A failure hidden behind a
     * spinner is the quietest way of never telling someone something went
     * wrong, which is the exact shape this file exists to prevent.
     */
    signIn();
    detail.mockRejectedValue(new Error("network"));
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({ data: null, loading: true, failed: false });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    return waitFor(() => {
      expect(result.current.failed).toBe(true);
      expect(result.current.loading).toBe(false);
    });
  });
});

/**
 * A lesson a teacher had called off played exactly like a live one.
 *
 * This is the "opens it, completes it" half of the defect, and the galling part
 * is that the answer was already in memory: this hook reads the dashboard for
 * the child's saved place, and the assignment row saying the lesson was
 * cancelled sat two lines away, unread. So the child worked through it and
 * `useLessonProgress` wrote their progress against it.
 *
 * `unavailable` is null for a lesson with NO assignment, and that is deliberate
 * rather than an oversight — see `isOpenToStudent`. A child can still open any
 * id their school's library holds; this acts only on what a teacher explicitly
 * said about a lesson they set.
 */
describe("a lesson the child is not meant to be doing", () => {
  const withAssignment = (over: Record<string, unknown>) => {
    detail.mockResolvedValue(LIVE_LESSON);
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({
      data: {
        assignments: [{ id: "a-1", lesson: { id: FIRST_LESSON_ID }, ...over }],
        recentProgress: [],
      },
      loading: false,
      failed: false,
    });
  };

  it("says a cancelled lesson is cancelled", async () => {
    signIn();
    withAssignment({ status: "cancelled", availableFrom: null });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toBe("cancelled");
  });

  it("says a lesson that opens on Friday is not yet open, and when", async () => {
    signIn();
    const opensAt = new Date(Date.now() + 86_400_000).toISOString();
    withAssignment({ status: "assigned", availableFrom: opensAt });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toBe("not_yet");
    expect(result.current.opensAt).toBe(opensAt);
  });

  it("does not block an ordinary assigned lesson", async () => {
    // Without this, a gate that blocked everything would pass both above.
    signIn();
    withAssignment({ status: "assigned", availableFrom: null });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toBeNull();
    expect(result.current.lesson).not.toBeNull();
  });

  it("does not block a lesson nothing was said about", async () => {
    /*
     * THE SCOPE LIMIT, and it needs its own test or the gate quietly grows into
     * "only assigned lessons may be opened" — a much larger product decision
     * about whether the school's library is browsable at all, which this fix
     * does not get to make.
     */
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    modules.mockResolvedValue([]);
    dashboard.mockReturnValue({
      data: { assignments: [], recentProgress: [] },
      loading: false,
      failed: false,
    });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toBeNull();
    expect(result.current.lesson).not.toBeNull();
  });
});

describe("what the first frame waits for", () => {
  /*
   * Loading waited for the lesson and the dashboard only, so the engine's
   * opening plan and the child's accommodations reshaped a segment that was
   * already showing (rules 6 and 7). Now the first frame waits for both - but
   * not for ever, since the client has no request timeout.
   */
  const ready = () => {
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    dashboard.mockReturnValue({
      data: { assignments: [], recentProgress: [] },
      loading: false,
      failed: false,
    });
  };

  afterEach(() => vi.useRealTimers());

  it("waits for the child's accommodations", async () => {
    ready();
    accommodations.mockReturnValue({ active: null, settled: false });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.loading).toBe(true);
  });

  it("waits for the engine's opening plan", async () => {
    ready();
    adaptation.mockReturnValue({ plan: null, error: null });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.loading).toBe(true);
  });

  it("does not wait on an engine that failed", async () => {
    ready();
    adaptation.mockReturnValue({ plan: null, error: "unreachable" });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("opens anyway once it has waited long enough", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    ready();
    adaptation.mockReturnValue({ plan: null, error: null });
    accommodations.mockReturnValue({ active: null, settled: false });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));
    await vi.waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.loading).toBe(false);
  });
});

describe("an accommodation when the engine does not answer", () => {
  it("is still applied, not dropped with the plan it would have ridden on", async () => {
    /*
     * They merged only onto a non-null plan, so a failed adapt call took a
     * delivered accommodation away for the whole lesson - while the teacher's
     * screen showed it active.
     */
    signIn();
    detail.mockResolvedValue(LIVE_LESSON);
    adaptation.mockReturnValue({ plan: null, error: "unreachable" });
    accommodations.mockReturnValue({
      active: { reading: true, attention: false, numerical: false },
      settled: true,
    });

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.plan?.accommodations?.reading).toBe(true);
  });
});

describe("a lesson the child saved for offline", () => {
  /*
   * With no connection the lesson read fails, and a child who saved the lesson
   * gets the copy they kept - built exactly as it would be online. Never for a
   * 404 (a lesson the school removed stays removed), and never another child's.
   */
  beforeEach(() => window.localStorage.clear());

  it("opens from the saved copy when the read cannot be made", async () => {
    signIn();
    saveLesson("student-1", LIVE_LESSON as never);
    detail.mockRejectedValue(new ApiError(0, "Network"));

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.failed).toBe(false);
    expect(result.current.lesson?.title).toBe("Fractions Lesson 3");
  });

  it("does not bring back a lesson the school removed", async () => {
    signIn();
    saveLesson("student-1", LIVE_LESSON as never);
    detail.mockRejectedValue(new ApiError(404, "Not Found"));

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.missing).toBe(true));
    expect(result.current.lesson).toBeNull();
  });

  it("does not open another child's saved copy", async () => {
    signIn();
    saveLesson("someone-else", LIVE_LESSON as never);
    detail.mockRejectedValue(new ApiError(0, "Network"));

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.failed).toBe(true));
  });

  it("keeps a saved copy as fresh as the last online open", async () => {
    signIn();
    saveLesson("student-1", { ...LIVE_LESSON, title: "Old title" } as never);
    detail.mockResolvedValue(LIVE_LESSON);

    const { result } = renderHook(() => useStudentLesson(FIRST_LESSON_ID));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(savedLesson("student-1", FIRST_LESSON_ID)?.title).toBe(
      "Fractions Lesson 3",
    );
  });
});
