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
 * Where the child is, as the line above the player's bar writes it and as the
 * player's content group and the bar speak it: "Part 3 of 10", counted over
 * the whole lesson.
 *
 * A CHILD'S WORD (Lydia, 11 Nov addendum): "A child's screen says 'Part 3 of
 * 10', in the player and on the cards. Section and segment are our words for
 * a teacher looking at her own material, and a child should not have to learn
 * our taxonomy to find their place in a lesson." It said "Segment 3 of 10",
 * and in a lesson of several sections "Module 2 of 3 · Segment 1 of 4 in this
 * module" - a second count in a second word, whose number was not the one the
 * lesson's card says. One count now, the card's (`segmentPlace`): the same
 * place is "Part 6 of 10" on the card and in the lesson it opens. Where one
 * section ends and the next begins is still the boundary screen's to say.
 */
export function positionLine(lesson: Lesson, segmentIndex: number): string {
  return `Part ${segmentIndex + 1} of ${lesson.segments.length}`;
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
 * The finished module's name in the boundary's sentence, or "this section"
 * where it has no title.
 *
 * THE TITLE AS WRITTEN. It was lowercased to sit mid-sentence, which is right
 * for the frame's "introduction" and wrong for any real title with a name in
 * it: a teacher's "Lagos" or "Newton" is theirs, and is not rewritten.
 *
 * AND NOTHING ADDED TO IT (Lydia, D186, 13 Oct): "Drop the article before the
 * title ... since real titles are already noun phrases." It read "the What
 * plants need".
 */
export function moduleName(module: LessonModule): string {
  return module.title || "this section";
}
