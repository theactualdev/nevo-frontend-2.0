import type { Lesson, LessonModule } from "@/lib/types";

/**
 * Module-position math for SCRUM-101. Everything is derived from
 * `lesson.modules` + a segment index, so the player carries no module state of
 * its own and segment-only lessons short-circuit to `null` everywhere.
 */

export interface ModulePosition {
  /** 0-based index of the module holding this segment. */
  moduleIndex: number;
  moduleCount: number;
  /** 0-based position of the segment inside its module. */
  segmentIndexInModule: number;
  segmentCountInModule: number;
  module: LessonModule;
}

/** The lesson's modules, or null when it is segment-only. */
export function lessonModules(lesson: Lesson): LessonModule[] | null {
  return lesson.modules && lesson.modules.length > 0 ? lesson.modules : null;
}

/** Where a segment sits in the module structure; null for segment-only lessons. */
export function modulePositionFor(
  lesson: Lesson,
  segmentIndex: number,
): ModulePosition | null {
  const modules = lessonModules(lesson);
  const segmentId = lesson.segments[segmentIndex]?.id;
  if (!modules || !segmentId) return null;
  for (let m = 0; m < modules.length; m++) {
    const at = modules[m].segmentIds.indexOf(segmentId);
    if (at !== -1) {
      return {
        moduleIndex: m,
        moduleCount: modules.length,
        segmentIndexInModule: at,
        segmentCountInModule: modules[m].segmentIds.length,
        module: modules[m],
      };
    }
  }
  return null;
}

/**
 * The header position line: two-level for modular lessons, the familiar
 * one-level line otherwise (segment-only lessons render exactly as today).
 */
export function positionLine(
  lesson: Lesson,
  segmentIndex: number,
): string {
  const pos = modulePositionFor(lesson, segmentIndex);
  if (!pos) return `Segment ${segmentIndex + 1} of ${lesson.segments.length}`;
  return `Module ${pos.moduleIndex + 1} of ${pos.moduleCount} · Segment ${pos.segmentIndexInModule + 1} of ${pos.segmentCountInModule} in this module`;
}

/**
 * True when this segment opens a module other than the first - i.e. the player
 * shows the boundary screen before it, and the modality-suggestion engine stays
 * quiet on it (adaptation rate-limit: the student has just made a transition
 * decision; never stack an offer on top of it).
 */
export function opensLaterModule(lesson: Lesson, segmentIndex: number): boolean {
  const pos = modulePositionFor(lesson, segmentIndex);
  return pos !== null && pos.moduleIndex > 0 && pos.segmentIndexInModule === 0;
}

/**
 * A module's display name in running copy; position-based fallbacks.
 *
 * THE TITLE AS WRITTEN. It was lowercased to sit mid-sentence, which is right
 * for the frame's "introduction" and wrong for any real title with a name in
 * it: a teacher's "Lagos" or "Newton" is theirs, and is not rewritten.
 */
export function moduleName(
  module: LessonModule,
  kind: "done" | "next",
  isLast: boolean,
): string {
  if (module.title) return `the ${module.title}${kind === "next" ? " section" : ""}`;
  if (kind === "done") return "this section";
  return isLast ? "the last section" : "the next section";
}
