import { describe, expect, it } from "vitest";
import { adaptSegmentsFor, toAdaptationPlan } from "./adaptation";
import type { AdaptResponse } from "@/lib/api/intelligence";
import type { LessonSegment as ContentSegment } from "@/lib/api/lessons";
import type { Lesson } from "@/lib/types";

const segment = (estimatedMinutes?: number): ContentSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    title: null,
    body: "The top number is the numerator.",
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    ...(estimatedMinutes === undefined ? {} : { estimatedMinutes }),
  }) as unknown as ContentSegment;

/**
 * How long a segment is meant to take. Typed on the request and never sent,
 * so the engine pacing a lesson had no idea how long any of it was.
 */
describe("segment lengths on the adapt request", () => {
  it("sends the lesson's own estimate", () => {
    const [sent] = adaptSegmentsFor([segment(4)]);
    expect(sent.estimatedMinutes).toBe(4);
  });

  it("omits 'no estimate' rather than sending a 0 the contract refuses", () => {
    // `exclusiveMinimum: 0`: one zero would 422 the whole request.
    expect(adaptSegmentsFor([segment(0)])[0]).not.toHaveProperty(
      "estimatedMinutes",
    );
    expect(adaptSegmentsFor([segment()])[0]).not.toHaveProperty(
      "estimatedMinutes",
    );
  });
});

/**
 * ONE ENGINE SUGGESTION IS ONE OFFER. `modalitySuggestion` has no segment id;
 * copied onto every row, the player's one-per-segment, never-two-in-a-row
 * rule turned it into an offer on every other segment of the lesson.
 */
describe("the engine's modality suggestion", () => {
  const lesson = {
    id: "l-1",
    title: "Fractions",
    segments: [
      { id: "seg-1", modalities: ["text", "audio"] },
      { id: "seg-2", modalities: ["text", "audio"] },
      { id: "seg-3", modalities: ["text", "audio"] },
    ],
  } as unknown as Lesson;
  const res = {
    lessonId: "l-1",
    source: "rule_based",
    segments: lesson.segments.map((s) => ({
      segmentId: s.id,
      modality: "text",
      density: "medium",
      scaffolding: "light",
      priority: 1,
    })),
    breakSuggestion: null,
    proactiveAdjustment: null,
    modalitySuggestion: { suggested: "audio" },
  } as unknown as AdaptResponse;

  it("is carried once, for the lesson, and on no segment", () => {
    const plan = toAdaptationPlan(res, lesson);

    expect(plan.suggestModality).toBe("audio");
    expect(plan.segments.every((s) => !s.suggestModality)).toBe(true);
  });

  it("is absent when the engine made none", () => {
    const plan = toAdaptationPlan(
      { ...res, modalitySuggestion: null },
      lesson,
    );
    expect(plan).not.toHaveProperty("suggestModality");
  });
});
