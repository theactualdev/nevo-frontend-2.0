import { describe, expect, it } from "vitest";
import type { LessonSegment } from "@/lib/api/lessons";
import { segmentLabel } from "./reviewModel";

/**
 * An untitled segment is named by its place as a SEGMENT. It read "Section 4",
 * so the key points step said "Section 4 - no key point found." on a lesson
 * with no sections at all (Hub's live test, 9 Nov: the same class as #1077).
 */
describe("an untitled segment's name", () => {
  it("is its place, as a segment", () => {
    expect(segmentLabel(undefined, 3)).toBe("Segment 4");
    expect(segmentLabel({ title: "  " } as LessonSegment, 0)).toBe("Segment 1");
  });

  it("is its own title when the parse gave one", () => {
    expect(segmentLabel({ title: "Fractions of a whole" } as LessonSegment, 0)).toBe("Fractions of a whole");
  });
});
