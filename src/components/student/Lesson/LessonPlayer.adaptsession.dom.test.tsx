import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
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

const { getAdaptation, progress } = vi.hoisted(() => ({
  getAdaptation: vi.fn(),
  progress: { sessionId: null as string | null },
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  intelligenceApi: { getAdaptation },
}));
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
