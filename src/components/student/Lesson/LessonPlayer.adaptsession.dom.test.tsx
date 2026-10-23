import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { Lesson } from "@/lib/types";

/**
 * THE MID-LESSON READ WAITS FOR THE LESSON SESSION, AND NAMES IT.
 *
 * On the 20 Oct production run the player asked `in_lesson` as the child
 * arrived on the first segment, before `POST /session` had answered, and the
 * ask after the 201 was refused 409 `lesson_session_required` too. The engine
 * will not read a child mid-lesson without an open sitting on the lesson.
 *
 * Every other player suite stands the hook in wholesale, so this one runs the
 * real hook under the real player: only the network and the session open are
 * stood in for.
 */

const { getAdaptation, saveAttempt, progress } = vi.hoisted(() => ({
  getAdaptation: vi.fn(),
  saveAttempt: vi.fn(),
  progress: { sessionId: null as string | null },
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  intelligenceApi: { getAdaptation },
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: (...a: unknown[]) => saveAttempt(...a),
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: progress.sessionId, report: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

const LESSON = {
  id: "9c1e77aa-1111-4222-8333-444455556666",
  title: "Fractions",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Numerators", body: { default: "The top number." } },
    },
  ],
} as unknown as Lesson;
const SEGMENTS = [
  { id: "seg-1", segmentType: "explanation" as const, availableModalities: ["text"] },
];

const answer = {
  lessonId: LESSON.id,
  source: "rule_based",
  segments: [],
  breakSuggestion: { breakType: null, reason: null },
  proactiveAdjustment: null,
  modalitySuggestion: null,
};

const player = () => (
  <LessonPlayer lesson={LESSON} plan={null} live adaptSegments={SEGMENTS} />
);

afterEach(() => {
  cleanup();
  getAdaptation.mockReset();
  saveAttempt.mockReset();
  progress.sessionId = null;
});

describe("the mid-lesson read and the lesson session", () => {
  it("is not asked while POST /session has not answered, then asked under its id", async () => {
    getAdaptation.mockResolvedValue(answer);

    const { rerender } = render(player());
    // The hook builds its request a microtask after the commit.
    await act(async () => {});
    expect(getAdaptation).not.toHaveBeenCalled();

    // The 201 lands.
    progress.sessionId = "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff";
    rerender(player());

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));
    const [lessonId, , options] = getAdaptation.mock.calls[0]!;
    expect(lessonId).toBe(LESSON.id);
    expect(options).toMatchObject({
      mode: "in_lesson",
      sessionId: "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff",
      signals: { currentSegmentId: "seg-1" },
    });
  });
});

/*
 * SCRUM-275, the 21 Oct run: AFTER AN ANSWER, THE ASK GOES ONCE THAT ANSWER
 * IS STORED. The miss was written and counted in the same tap, and the count
 * changing asked at once, beside the write - while the engine reads its error
 * streak from the answers it has stored. So it could read one miss where
 * there were two, and hold the hint they earn. A write that fails still lets
 * the ask go: the engine is never left silent for it.
 */
describe("the mid-lesson read after an answer", () => {
  const SESSION = "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff";
  const CHECKED = {
    id: "9c1e77aa-1111-4222-8333-444455556666",
    title: "Fractions",
    segments: [
      {
        id: "seg-1",
        modalities: ["text"],
        text: { heading: "Numerators", body: { default: "The top number." } },
        quickCheck: {
          id: "cp-1",
          question: "Which number is on top?",
          options: [
            { id: "a", label: "The numerator", value: "a" },
            { id: "b", label: "The denominator", value: "b" },
          ],
          correctId: "a",
          correctNote: "Yes.",
          recoveryNote: "Not quite.",
        },
      },
      {
        id: "seg-2",
        modalities: ["text"],
        text: { heading: "Denominators", body: { default: "The bottom." } },
      },
    ],
  } as unknown as Lesson;
  const CHECKED_SEGMENTS = [
    { id: "seg-1", segmentType: "explanation" as const, availableModalities: ["text"] },
    { id: "seg-2", segmentType: "explanation" as const, availableModalities: ["text"] },
  ];
  const stored = {
    id: "att-1",
    lessonId: CHECKED.id,
    sessionId: SESSION,
    questionId: "cp-1",
    segmentId: "seg-1",
    source: "checkpoint",
    attemptNumber: 1,
    question: {},
    answer: "b",
    correct: false,
    submittedAt: "2026-10-21T10:00:00Z",
    resultState: "nothing_landed",
    handoffTo: null,
    guidedPrompts: [],
    advanceAfterHandoff: false,
  };

  /** Into the check, with the first ask already made, then a miss. */
  const missWhileWriting = async (order: string[]) => {
    let land!: () => void;
    let fail!: (e: unknown) => void;
    saveAttempt.mockImplementation(() =>
      new Promise<void>((res, rej) => {
        land = res;
        fail = rej;
      }).then(() => {
        order.push("written");
        return stored;
      }),
    );
    getAdaptation.mockImplementation(async () => {
      order.push("ask");
      return answer;
    });
    progress.sessionId = SESSION;
    render(
      <LessonPlayer
        lesson={CHECKED}
        plan={null}
        live
        adaptSegments={CHECKED_SEGMENTS}
      />,
    );
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /The denominator/ }),
    );
    expect(saveAttempt).toHaveBeenCalledTimes(1);
    // However long the write takes, the ask about the miss waits for it.
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(getAdaptation).toHaveBeenCalledTimes(1);
    return { land: () => land(), fail: (e: unknown) => fail(e) };
  };

  it("goes once the answer's write has landed, so the engine's count includes it", async () => {
    const order: string[] = [];
    const write = await missWhileWriting(order);

    write.land();

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(order).toEqual(["ask", "written", "ask"]);
    expect(getAdaptation.mock.calls[1]![2]).toMatchObject({
      mode: "in_lesson",
      sessionId: SESSION,
      signals: { currentSegmentId: "seg-1", consecutiveErrors: 1 },
    });
  });

  it("still goes when the write fails", async () => {
    const order: string[] = [];
    const write = await missWhileWriting(order);

    write.fail(new Error("offline"));

    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(2));
    expect(order).toEqual(["ask", "ask"]);
    expect(getAdaptation.mock.calls[1]![2]).toMatchObject({
      signals: { consecutiveErrors: 1 },
    });
  });
});
