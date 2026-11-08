import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * What the lesson was split into, in the structure step's own words: "3
 * sections · 7 segments", or "7 segments" with no sections (live test, 8 Nov).
 * `segmentCount` counts SEGMENTS - the finish screen said "7 sections" right
 * after the structure step had said "3 sections · 7 segments". The sections
 * are the lesson's `modules`.
 */
export function splitLine(lesson: Pick<LessonDetailResponse, "segmentCount" | "modules">): string {
  const sections = lesson.modules?.length ?? 0;
  const segments = `${lesson.segmentCount} ${lesson.segmentCount === 1 ? "segment" : "segments"}`;
  return sections > 0
    ? `${sections} ${sections === 1 ? "section" : "sections"} · ${segments}`
    : segments;
}
