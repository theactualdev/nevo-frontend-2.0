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
 * SCRUM-272, 21 Oct: THE RECOMMENDATION IS EACH ROW'S, IN THE FORMAT GROUP.
 * The separate pill is gone, and `modalitySuggestion` with it - deprecated and
 * always null on the wire. A row's `availableFormats` and `recommendedFormat`
 * are carried so the group reads the fresher of these and the lesson's own.
 */
describe("the engine's formats and recommendation", () => {
  const lesson = {
    id: "l-1",
    title: "Fractions",
    segments: [
      { id: "seg-1", modalities: ["text", "audio"] },
      { id: "seg-2", modalities: ["text", "audio"] },
    ],
  } as unknown as Lesson;
  const row = (segmentId: string, extra: Record<string, unknown> = {}) => ({
    segmentId,
    modality: "text",
    density: "medium",
    scaffolding: "light",
    priority: 1,
    ...extra,
  });
  const res = (
    rows: ReturnType<typeof row>[],
    modalitySuggestion: unknown = null,
  ) =>
    ({
      lessonId: "l-1",
      source: "rule_based",
      segments: rows,
      breakSuggestion: null,
      proactiveAdjustment: null,
      modalitySuggestion,
    }) as unknown as AdaptResponse;

  it("are carried per row, in the engine's order", () => {
    const plan = toAdaptationPlan(
      res([
        row("seg-1", {
          availableFormats: ["audio", "text"],
          recommendedFormat: "audio",
        }),
        row("seg-2", { availableFormats: ["text"], recommendedFormat: null }),
      ]),
      lesson,
    );

    expect(plan.segments[0]).toMatchObject({
      formats: ["audio", "text"],
      recommendedFormat: "audio",
    });
    expect(plan.segments[1]).toMatchObject({
      formats: ["text"],
      recommendedFormat: null,
    });
  });

  it("carry no recommendation that is not one of the row's formats", () => {
    const plan = toAdaptationPlan(
      res([
        row("seg-1", { availableFormats: ["text"], recommendedFormat: "audio" }),
      ]),
      lesson,
    );

    expect(plan.segments[0].recommendedFormat).toBeNull();
  });

  it("leave the lesson's own standing where the answer had none", () => {
    const plan = toAdaptationPlan(res([row("seg-1")]), lesson);

    expect(plan.segments[0]).not.toHaveProperty("formats");
    expect(plan.segments[0]).not.toHaveProperty("recommendedFormat");
  });

  it("never read the retired `modalitySuggestion`", () => {
    const plan = toAdaptationPlan(
      res([row("seg-1")], { suggested: "audio" }),
      lesson,
    );

    expect(JSON.stringify(plan)).not.toContain("audio");
  });
});
