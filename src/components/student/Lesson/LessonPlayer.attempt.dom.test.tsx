import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { api } from "@/lib/api/client";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * What an after-lesson answer tells the engine.
 *
 * NO SCAFFOLD ATTEMPT ANY MORE. Each first answer used to post `POST
 * /api/intelligence/scaffolds/attempt` beside the lesson's own attempt. Since
 * Teslim's 19 Oct contract (d461b60) that write refuses every student without
 * persisted server evidence (422 `server_marked_attempt_required`), and
 * "normal lesson completion/answers already update these mechanisms" - so it
 * was a call that always failed, carrying a device verdict the server no
 * longer takes from a student. It is gone, and these tests say it stays gone.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getSession };
});

const lessonWith = (...questions: Record<string, unknown>[]): Lesson =>
  ({
    id: "photo-1",
    title: "Photosynthesis",
    segments: [
      {
        id: "seg-1",
        modalities: ["text"],
        text: { heading: "Inside a leaf", body: { default: "One idea here." } },
      },
    ],
    assessment: { questions },
  }) as unknown as Lesson;

const QUESTION = {
  id: "cp-7",
  conceptId: "c-1",
  prompt: "Which part catches the light?",
  options: [
    { id: "a", label: "Chloroplasts" },
    { id: "b", label: "Roots" },
  ],
  correctId: "a",
};

const PLAN: AdaptationPlan = { lessonId: "photo-1", segments: [] };

/**
 * Walk the single segment through to the assessment's first question.
 *
 * Two steps, not one: leaving the last segment enters the assessment PHASE,
 * which opens on its own intro rather than on a question.
 */
const reachAssessment = () => {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
};

/**
 * Pick an option and confirm it.
 *
 * The answer is not submitted by choosing - `onAnswer` fires on the confirm.
 * A correct answer advances; a wrong one reveals and the same button becomes
 * "Next question", which advances without confirming again.
 */
const answer = (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

/** Every write that left for the server, by path. */
const posted = () => post.mock.calls.map((c) => c[0]);
let post: MockInstance<typeof api.post>;

beforeEach(() => {
  trackEvent.mockReset();
  getSession.mockReturnValue({ userId: "s-1" });
  post = vi.spyOn(api, "post").mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  post.mockRestore();
});

describe("the scaffold attempt (d461b60)", () => {
  it("is not sent for an after-lesson answer, right or wrong", () => {
    const second = { ...QUESTION, id: "cp-8", correctId: "b" };
    render(
      <LessonPlayer lesson={lessonWith(QUESTION, second)} plan={PLAN} live />,
    );
    reachAssessment();

    answer("Chloroplasts");
    answer("Chloroplasts");

    expect(posted()).not.toContain("/api/intelligence/scaffolds/attempt");
  });

  it("is not sent for a signed-in child on a lesson with a real id either", () => {
    const LESSON_ID = "6f2c1d8e-4b3a-4c5d-9e8f-7a6b5c4d3e2f";
    const lesson = {
      ...lessonWith({
        ...QUESTION,
        options: [
          { id: "a", label: "Chloroplasts", value: "chloroplasts" },
          { id: "b", label: "Roots", value: "roots" },
        ],
      }),
      id: LESSON_ID,
    } as Lesson;
    render(<LessonPlayer lesson={lesson} plan={PLAN} live />);
    reachAssessment();

    answer("Roots");

    expect(posted()).not.toContain("/api/intelligence/scaffolds/attempt");
  });
});

describe("what an answer tells the engine", () => {
  it("names the checkpoint, and no segment the question never belonged to", () => {
    render(<LessonPlayer lesson={lessonWith(QUESTION)} plan={PLAN} live />);
    reachAssessment();

    answer("Roots");

    /*
     * The catalogue's `{ segmentId, questionId }`, as far as each is true. An
     * after-lesson question belongs to the lesson, so it names no segment.
     * Correctness is decided on the server against the stored answer, and the
     * pick goes up on the attempt the server marks - so `correct`, the pick
     * and its timing, which rode here under keys the catalogue does not take,
     * are not sent. `source` tells it from a quick check's (B90/B92, 8 Oct).
     */
    expect(trackEvent).toHaveBeenCalledWith("comprehension_response", {
      questionId: "cp-7",
      source: "assessment",
    });
  });
});
