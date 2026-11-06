import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import type {
  LessonDetailResponse,
  LessonModule as ContentModule,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * MODULES, BY THE SEGMENTS' RECORD IDS (audit, 2 Nov).
 *
 * On live lessons a module's `segmentIds` are the sections' KEYS, never their
 * ids, so the player dropped every module: no boundary between modules, no
 * recap, no "Module 2 of 3". `segmentRecordIds` are the ids, and are read
 * first.
 */

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const segment = (n: number): ContentSegment =>
  ({
    id: ID(n),
    segmentKey: `chunk-${n}-segment-${n}`,
    contentType: "text",
    sequenceOrder: n,
    title: `Section ${n}`,
    body: `Body ${n}.`,
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    needsReview: false,
    reviewReasons: [],
  }) as unknown as ContentSegment;

const lesson = (count: number): LessonDetailResponse =>
  ({
    id: "lesson-1",
    title: "Osmosis",
    confirmationSummary: null,
    segments: Array.from({ length: count }, (_, i) => segment(i + 1)),
  }) as unknown as LessonDetailResponse;

const mod = (
  n: number,
  over: Partial<ContentModule>,
): ContentModule => ({
  id: `module-${n}`,
  title: `Module ${n}`,
  recap: null,
  preview: null,
  sequenceOrder: n,
  segmentIds: [],
  ...over,
});

const members = (built: ReturnType<typeof lessonFromContent>) =>
  built?.modules?.map((m) => [m.id, m.segmentIds]);

describe("a lesson's modules", () => {
  it("are read by the segments' record ids, as the live lesson sends them", () => {
    const built = lessonFromContent(lesson(4), [
      mod(1, {
        segmentIds: ["chunk-1-segment-1", "chunk-2-segment-2"],
        segmentRecordIds: [ID(1), ID(2)],
      }),
      mod(2, {
        segmentIds: ["chunk-3-segment-3", "chunk-4-segment-4"],
        segmentRecordIds: [ID(3), ID(4)],
      }),
    ]);

    expect(members(built)).toEqual([
      ["module-1", [ID(1), ID(2)]],
      ["module-2", [ID(3), ID(4)]],
    ]);
  });

  it("read a payload's keys as the server matches them, where it has no record ids", () => {
    const built = lessonFromContent(lesson(3), [
      mod(1, { segmentIds: ["chunk-1-segment-1", ID(2)] }),
      mod(2, { segmentIds: ["chunk-3-segment-3"] }),
    ]);

    expect(members(built)).toEqual([
      ["module-1", [ID(1), ID(2)]],
      ["module-2", [ID(3)]],
    ]);
  });

  it("still drop a module whose sections are not in the lesson", () => {
    const built = lessonFromContent(lesson(2), [
      mod(1, { segmentRecordIds: [ID(1), ID(2)] }),
      mod(2, { segmentIds: ["gone"], segmentRecordIds: [ID(9)] }),
    ]);

    expect(members(built)).toEqual([["module-1", [ID(1), ID(2)]]]);
  });

  it("keep the server's order, by sequence", () => {
    const built = lessonFromContent(lesson(2), [
      mod(2, { segmentRecordIds: [ID(2)] }),
      mod(1, { segmentRecordIds: [ID(1)] }),
    ]);

    expect(built?.modules?.map((m) => m.id)).toEqual(["module-1", "module-2"]);
  });
});
