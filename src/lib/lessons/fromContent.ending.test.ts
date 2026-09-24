import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * A lesson finally has an ending.
 *
 * Nine built screens — the after-lesson assessment, Review Answers and the
 * Lesson Summary — had no data, because the content contract carried no recap
 * and no assessment. Backend added both on 14 September, on both detail reads,
 * and `assessment` is literally `ComprehensionCheckpoint[]` — the same type a
 * segment's inline check uses.
 *
 * So the adapter is `toQuickCheck`, which already refuses everything the sheet
 * cannot honestly draw. The tests below are about the cases where a mapping
 * quietly produces something WRONG rather than nothing: a question with no
 * right answer, an assessment with no questions, a card headed "what you
 * covered" with nothing under it.
 */

const checkpoint = (over: Record<string, unknown> = {}) =>
  ({
    id: "cp-1",
    conceptId: null,
    conceptName: null,
    prompt: "Which is larger?",
    answerType: "single_choice",
    options: [
      { value: "a", label: "Two-thirds" },
      { value: "b", label: "Three-fifths" },
    ],
    answerKey: "a",
    explanation: null,
    position: "after_segment",
    ...over,
  }) as never;

const segment = (over: Record<string, unknown> = {}) =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "text",
    sequenceOrder: 1,
    title: "Numerators",
    body: "The number on top.",
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    textVariant: { body: "The number on top." },
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    needsReview: false,
    reviewReasons: [],
    estimatedMinutes: 2,
    ...over,
  }) as never;

const lesson = (over: Record<string, unknown> = {}) =>
  ({
    id: "lesson-1",
    title: "Fractions Lesson 3",
    sourceType: "upload",
    status: "ready",
    segmentCount: 1,
    reviewSegmentCount: 0,
    subject: "Maths",
    assignmentCount: 0,
    estimatedMinutes: 8,
    createdById: "t1",
    createdByName: "Ms Adeyemi",
    createdAt: "2026-09-01T00:00:00Z",
    confirmationSummary: "Parsed with high confidence.",
    segments: [segment()],
    ...over,
  }) as unknown as LessonDetailResponse;

describe("the after-lesson assessment", () => {
  it("draws the questions the backend sent", () => {
    const out = lessonFromContent(lesson({ assessment: [checkpoint()] }));

    expect(out?.assessment?.questions).toEqual([
      {
        // The checkpoint's own id, carried since 24 Sep: it is the `problemId`
        // a scaffold attempt is keyed on. This assertion is a whole-shape
        // equality on purpose, so a field appearing here is a decision
        // somebody has to make rather than something that slips in.
        id: "cp-1",
        prompt: "Which is larger?",
        options: [
          { id: "a", label: "Two-thirds" },
          { id: "b", label: "Three-fifths" },
        ],
        correctId: "a",
      },
    ]);
  });

  it("marks against the option VALUE, not its position", () => {
    // `answerKey` is matched to `option.value`. Treating it as an index would
    // mark a child wrong for the right answer, which is the worst thing this
    // mapping can do and the reason it reuses the tested adapter.
    const out = lessonFromContent(
      lesson({ assessment: [checkpoint({ answerKey: "b" })] }),
    );

    expect(out?.assessment?.questions[0].correctId).toBe("b");
  });

  it("drops a question whose answer key matches none of its options", () => {
    // Content parsed before the checkpoint contract settled. Showing it would
    // be a question with no right answer to pick.
    const out = lessonFromContent(
      lesson({ assessment: [checkpoint({ answerKey: "zzz" })] }),
    );

    expect(out?.assessment).toBeUndefined();
  });

  it("drops a question with no answer key at all", () => {
    const out = lessonFromContent(
      lesson({ assessment: [checkpoint({ answerKey: null })] }),
    );

    expect(out?.assessment).toBeUndefined();
  });

  it("drops a multiple-choice question the sheet cannot express", () => {
    // The sheet takes one tap.
    const out = lessonFromContent(
      lesson({
        assessment: [
          checkpoint({ answerType: "multiple_choice", answerKey: ["a", "b"] }),
        ],
      }),
    );

    expect(out?.assessment).toBeUndefined();
  });

  it("keeps the questions it can draw and drops the ones it cannot", () => {
    const out = lessonFromContent(
      lesson({
        assessment: [
          checkpoint({ id: "ok-1" }),
          checkpoint({ id: "bad", answerKey: null }),
          checkpoint({ id: "ok-2", answerKey: "b" }),
        ],
      }),
    );

    expect(out?.assessment?.questions).toHaveLength(2);
  });

  it("is ABSENT, not empty, when nothing survives", () => {
    // `{ questions: [] }` passes a truthiness gate, so the player would enter
    // the assessment phase and render a question list with nothing in it, at
    // the end of a lesson a child had just finished.
    const out = lessonFromContent(
      lesson({ assessment: [checkpoint({ answerKey: null })] }),
    );

    expect(out?.assessment).toBeUndefined();
    expect(out).not.toHaveProperty("assessment");
  });

  it("is absent when the backend sends an empty array", () => {
    // Exactly what the contract's own default delivers.
    const out = lessonFromContent(lesson({ assessment: [] }));

    expect(out).not.toHaveProperty("assessment");
  });

  it("is absent on a deployment that sends no assessment field at all", () => {
    const out = lessonFromContent(lesson());

    expect(out).not.toHaveProperty("assessment");
  });
});

describe("the lesson summary", () => {
  it("carries the recap written for the child", () => {
    const out = lessonFromContent(
      lesson({ recap: "You explored what fractions are." }),
    );

    expect(out?.summary?.recap).toBe("You explored what fractions are.");
  });

  it("never uses confirmationSummary as a recap", () => {
    // That field is the parser telling a TEACHER how confident it is about its
    // own output. It is not addressed to a learner and must never reach one.
    const out = lessonFromContent(lesson());

    expect(out).not.toHaveProperty("summary");
  });

  it("builds 'what you covered' from the concepts the lesson actually checked", () => {
    const out = lessonFromContent(
      lesson({
        recap: "Good work.",
        assessment: [checkpoint({ conceptName: "Equivalence" })],
        segments: [
          segment({
            comprehensionCheckpoints: [
              checkpoint({ conceptName: "Numerators" }),
            ],
          }),
        ],
      }),
    );

    expect(out?.summary?.covered).toBe("Equivalence · Numerators");
  });

  it("does not repeat a concept named more than once", () => {
    const out = lessonFromContent(
      lesson({
        recap: "Good work.",
        assessment: [checkpoint({ conceptName: "Equivalence" })],
        segments: [
          segment({
            comprehensionCheckpoints: [
              checkpoint({ conceptName: "Equivalence" }),
            ],
          }),
        ],
      }),
    );

    expect(out?.summary?.covered).toBe("Equivalence");
  });

  it("omits 'what you covered' when the lesson names no concepts", () => {
    // Rather than a card headed WHAT YOU COVERED with an empty body — failure
    // rendered as emptiness, on the most prominent element of that screen.
    const out = lessonFromContent(lesson({ recap: "Good work." }));

    expect(out?.summary?.recap).toBe("Good work.");
    expect(out?.summary?.covered).toBeUndefined();
  });

  it("treats a blank recap as no recap", () => {
    // An empty string would light the "See summary" button and open a screen
    // that is a title and two buttons.
    const out = lessonFromContent(lesson({ recap: "   " }));

    expect(out).not.toHaveProperty("summary");
  });

  it("treats a null recap as no recap", () => {
    const out = lessonFromContent(lesson({ recap: null }));

    expect(out).not.toHaveProperty("summary");
  });
});
