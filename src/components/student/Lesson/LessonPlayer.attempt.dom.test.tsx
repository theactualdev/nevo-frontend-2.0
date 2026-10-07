import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * One attempt per problem.
 *
 * The engine decides how much support a child gets on a concept from these, so
 * an attempt filed twice counts one answer twice, and one filed against the
 * wrong problem or concept teaches it something untrue about a child.
 *
 * **WHAT THIS FILE NO LONGER CLAIMS.** It opened with a test that answered
 * wrong, answered again, and said it proved the `firstAnswers` guard. It did
 * not: a wrong answer reveals and renames the confirm to "Next question",
 * whose onClick is `advance` rather than `confirm`, so `onAnswer` cannot fire
 * twice for one question. Removing the guard passed all seven tests. The guard
 * stays - it costs nothing and the scheduler write beside it shares the same
 * map - but it is defensive rather than load-bearing, and the tests say so.
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

const { attempt } = vi.hoisted(() => ({ attempt: vi.fn() }));
vi.mock("@/lib/api/scaffolds", () => ({ scaffoldsApi: { attempt } }));

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

beforeEach(() => {
  trackEvent.mockReset();
  attempt.mockReset();
  attempt.mockResolvedValue({});
  getSession.mockReturnValue({ userId: "s-1" });
});

afterEach(() => {
  cleanup();
});

describe("answering a question", () => {
  it("reports the attempt, keyed on the checkpoint and the concept", () => {
    render(<LessonPlayer lesson={lessonWith(QUESTION)} plan={PLAN} live />);
    reachAssessment();

    answer("Chloroplasts");

    expect(attempt).toHaveBeenCalledWith({
      studentId: "s-1",
      conceptId: "c-1",
      problemId: "cp-7",
      responseCorrect: true,
      // How long the question was in front of the child, measured. The attempt
      // never carried one, so the engine read every answer as untimed.
      responseTimeMs: expect.any(Number),
    });
  });

  it("carries the child's pick and the lesson it came from (B27)", () => {
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

    // The option's own value, not our id for it.
    expect(attempt).toHaveBeenCalledWith(
      expect.objectContaining({ answer: "roots", lessonId: LESSON_ID }),
    );
  });

  it("reports a wrong answer as wrong", () => {
    render(<LessonPlayer lesson={lessonWith(QUESTION)} plan={PLAN} live />);
    reachAssessment();

    answer("Roots");

    expect(attempt).toHaveBeenCalledWith(
      expect.objectContaining({ responseCorrect: false }),
    );
  });
});

describe("across a whole assessment", () => {
  it("reports one attempt per question, keyed on each one's own problem", () => {
    /*
     * The invariant that matters: the engine moves a support level on these,
     * so two attempts for one problem would count a single answer twice.
     *
     * **AND THE FIRST VERSION OF THIS TEST WAS A LIE.** It answered wrong,
     * answered again, and claimed to prove the `firstAnswers` guard. A wrong
     * answer reveals and renames the button to "Next question", whose onClick
     * is `advance` rather than `confirm` - so `onAnswer` cannot fire twice for
     * one question, the guard was never exercised, and removing it passed
     * every test. The guard stays because it costs nothing and the scheduler
     * write next to it relies on the same map; it is defensive, not
     * load-bearing, and this test no longer pretends otherwise.
     */
    const second = { ...QUESTION, id: "cp-8", correctId: "b" };
    render(
      <LessonPlayer
        lesson={lessonWith(QUESTION, second)}
        plan={PLAN}
        live
      />,
    );
    reachAssessment();

    answer("Chloroplasts");
    answer("Roots");

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt.mock.calls.map((c) => c[0].problemId)).toEqual([
      "cp-7",
      "cp-8",
    ]);
  });
});

describe("when there is nothing to report", () => {
  it("says nothing for a question with no checkpoint id", () => {
    // An authored mock. An id from the question's position would key the
    // engine's history to an array index.
    const { id, ...noId } = QUESTION;
    void id;
    render(<LessonPlayer lesson={lessonWith(noId)} plan={PLAN} live />);
    reachAssessment();

    answer("Chloroplasts");

    expect(attempt).not.toHaveBeenCalled();
  });

  it("says nothing for a question that resolves to no concept", () => {
    const { conceptId, ...noConcept } = QUESTION;
    void conceptId;
    render(<LessonPlayer lesson={lessonWith(noConcept)} plan={PLAN} live />);
    reachAssessment();

    answer("Chloroplasts");

    expect(attempt).not.toHaveBeenCalled();
  });

  it("says nothing for a signed-out visitor", () => {
    getSession.mockReturnValue(null);
    render(<LessonPlayer lesson={lessonWith(QUESTION)} plan={PLAN} />);
    reachAssessment();

    answer("Chloroplasts");

    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("what a failed report costs", () => {
  it("does not disturb the child", async () => {
    // Missing one attempt costs a slightly stale intensity. Telling a child
    // their answer did not count would be worse, and is not true.
    attempt.mockRejectedValue(new Error("network"));

    render(<LessonPlayer lesson={lessonWith(QUESTION)} plan={PLAN} live />);
    reachAssessment();

    answer("Chloroplasts");

    expect(document.body.textContent).not.toMatch(
      /couldn't|error|failed|try again/i,
    );
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
     * are not sent.
     */
    expect(trackEvent).toHaveBeenCalledWith("comprehension_response", {
      questionId: "cp-7",
    });
  });
});
