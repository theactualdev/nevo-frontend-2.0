import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * The concept an assessment question is about.
 *
 * `ComprehensionCheckpoint` has carried `conceptId` for weeks and the adapter
 * dropped it, which is why `POST /api/scheduler/record-review` stayed unwired:
 * a review is spaced retrieval on ONE concept, and without the id there was no
 * way to tell which answers were evidence about it. The recorded reason for
 * leaving it unwired - "there is no question to ask" - expired when the library
 * gained an assessment.
 */

const checkpoint = (over: Record<string, unknown> = {}) =>
  ({
    id: "cp-1",
    prompt: "Which one is a like fraction?",
    answerType: "single_select",
    options: [
      { value: "a", label: "One quarter" },
      { value: "b", label: "One third" },
    ],
    answerKey: "a",
    explanation: "Like fractions share a denominator.",
    conceptId: "concept-fractions",
    conceptName: "Like fractions",
    position: "end",
    ...over,
  }) as unknown as never;

const lesson = (assessment: unknown[]): LessonDetailResponse =>
  ({
    id: "l-1",
    title: "Adding fractions",
    status: "completed",
    sourceType: "pdf",
    segmentCount: 1,
    reviewSegmentCount: 0,
    createdAt: "2026-09-17T09:00:00Z",
    confirmationSummary: null,
    recap: "You added like fractions.",
    assessment,
    modules: [],
    segments: [
      {
        id: "seg-1",
        segmentKey: "s1",
        contentType: "explanatory_text",
        sequenceOrder: 1,
        title: "Like fractions",
        body: "A like fraction shares its denominator.",
        availableModalities: ["text"],
        comprehensionCheckpoints: [],
        textVariant: null,
        visualVariant: null,
        audioVariant: null,
        interactiveVariant: null,
        calculationVariant: null,
        needsReview: false,
        reviewReasons: [],
      } as unknown as ContentSegment,
    ],
  }) as unknown as LessonDetailResponse;

const assessmentOf = (assessment: unknown[]) => {
  const built = lessonFromContent(lesson(assessment));
  if (!built) throw new Error("the adapter refused the lesson");
  return built.assessment;
};

describe("an assessment question's concept", () => {
  it("carries the concept the checkpoint named", () => {
    const assessment = assessmentOf([checkpoint()]);

    expect(assessment?.questions[0]?.conceptId).toBe("concept-fractions");
  });

  it("keeps each question's own concept when they differ", () => {
    // The case the review write depends on: only the questions about the
    // concept under review are evidence about it.
    const assessment = assessmentOf([
      checkpoint(),
      checkpoint({ id: "cp-2", conceptId: "concept-decimals" }),
    ]);

    expect(assessment?.questions.map((q) => q.conceptId)).toEqual([
      "concept-fractions",
      "concept-decimals",
    ]);
  });

  it("omits the key rather than carrying a null one", () => {
    // Absence is an instruction: a question with no concept cannot inform a
    // review, and every consumer tests for presence.
    const assessment = assessmentOf([checkpoint({ conceptId: null })]);

    expect(assessment?.questions[0]).not.toHaveProperty("conceptId");
  });

  it("still refuses a question it cannot mark, concept or not", () => {
    // Carrying the concept must not smuggle an unmarkable question through:
    // an answer key matching none of its options is still a locked door.
    const assessment = assessmentOf([checkpoint({ answerKey: "zzz" })]);

    expect(assessment).toBeUndefined();
  });
});

describe("the concept an inline check is about", () => {
  /*
   * A review session skips the after-lesson questions - its inline checks are
   * the recall - so a concept dropped here is a review whose outcome can never
   * be sent to the scheduler.
   */
  const withCheck = (over: Record<string, unknown> = {}) => {
    const base = lesson([]);
    base.segments[0] = {
      ...base.segments[0],
      comprehensionCheckpoints: [checkpoint(over)],
    } as unknown as ContentSegment;
    const built = lessonFromContent(base);
    if (!built) throw new Error("the adapter refused the lesson");
    return built.segments[0].quickCheck;
  };

  it("is carried from the checkpoint", () => {
    expect(withCheck()?.conceptId).toBe("concept-fractions");
  });

  it("is omitted, not nulled, when the checkpoint names none", () => {
    expect(withCheck({ conceptId: null })).not.toHaveProperty("conceptId");
  });
});
