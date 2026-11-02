import type {
  CommittedStructureWrite,
  LessonDetailResponse,
  LessonModule,
} from "@/lib/api/lessons";

/**
 * C07d for a lesson already in the library (Teslim d78756b), as a draft the
 * teacher changes and then saves in one go.
 *
 * WHAT THE ROUTE CAN DO, AND SO ALL THIS DOES (the Hub, 28 Oct: "ship it
 * reduced"): rename the lesson, any section and any segment; reorder
 * segments and sections; move a segment into the section above or below;
 * start a new section after a segment; fold a section into the one above.
 * It cannot split, merge or remove a segment - the segment set must stay the
 * same - so none of those is offered.
 *
 * A section is a lesson MODULE; a segment is one of its parts, as step 1 of
 * the review names them.
 */

export interface DraftSection {
  /** The module's id, or null for one this draft started. */
  id: string | null;
  /** A stable key for the screen, since a new section has no id yet. */
  key: string;
  title: string;
  /** Sent back as read: the route writes them from the payload (d78756b). */
  recap: string | null;
  preview: string | null;
  segmentIds: string[];
}

export interface StructureDraft {
  title: string;
  /** Segment titles by id, as typed. */
  segmentTitles: Record<string, string>;
  /** The lesson's sections, in order. Empty for a lesson with none. */
  sections: DraftSection[];
  /** The segments in order, for a lesson with no sections. */
  order: string[];
}

let newKey = 0;
const keyFor = () => `new-${(newKey += 1)}`;

/**
 * The module's segments, by record id where the read carries them, else by
 * the module's own keys (a segment's key or id, as the server matches them).
 */
function membersOf(module: LessonModule, lesson: LessonDetailResponse): string[] {
  if (module.segmentRecordIds && module.segmentRecordIds.length > 0) return module.segmentRecordIds;
  const ordered = [...lesson.segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return ordered
    .filter((s) => module.segmentIds.includes(s.id) || module.segmentIds.includes(s.segmentKey))
    .map((s) => s.id);
}

export function draftFrom(lesson: LessonDetailResponse): StructureDraft {
  const ordered = [...lesson.segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const modules = [...(lesson.modules ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const sections: DraftSection[] = modules.map((m) => ({
    id: m.id,
    key: m.id,
    title: m.title,
    recap: m.recap,
    preview: m.preview,
    segmentIds: membersOf(m, lesson),
  }));
  // A segment no section claims still has to belong somewhere: the route
  // refuses a save that leaves one out. It joins the last section, which is
  // where the lesson page already shows such a segment, after the rest.
  if (sections.length > 0) {
    const claimed = new Set(sections.flatMap((s) => s.segmentIds));
    const left = ordered.filter((s) => !claimed.has(s.id)).map((s) => s.id);
    sections[sections.length - 1].segmentIds.push(...left);
  }
  return {
    title: lesson.title,
    segmentTitles: Object.fromEntries(ordered.map((s) => [s.id, s.title ?? ""])),
    sections,
    order: ordered.map((s) => s.id),
  };
}

/** Every segment, in the order the draft has them. */
export function segmentOrder(draft: StructureDraft): string[] {
  return draft.sections.length > 0 ? draft.sections.flatMap((s) => s.segmentIds) : draft.order;
}

const swap = <T,>(list: T[], i: number, j: number): T[] => {
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

export function moveSection(draft: StructureDraft, index: number, by: -1 | 1): StructureDraft {
  return { ...draft, sections: swap(draft.sections, index, index + by) };
}

/** Up or down within its own section, or within the lesson when there are none. */
export function moveSegment(draft: StructureDraft, segmentId: string, by: -1 | 1): StructureDraft {
  if (draft.sections.length === 0) {
    const i = draft.order.indexOf(segmentId);
    return { ...draft, order: swap(draft.order, i, i + by) };
  }
  return {
    ...draft,
    sections: draft.sections.map((s) => {
      const i = s.segmentIds.indexOf(segmentId);
      return i < 0 ? s : { ...s, segmentIds: swap(s.segmentIds, i, i + by) };
    }),
  };
}

/**
 * Into the section above (to its end) or below (to its start). A section the
 * move would empty goes with it: the route refuses a section with no
 * segments.
 */
export function moveSegmentAcross(
  draft: StructureDraft,
  segmentId: string,
  by: -1 | 1,
): StructureDraft {
  const from = draft.sections.findIndex((s) => s.segmentIds.includes(segmentId));
  const to = from + by;
  if (from < 0 || to < 0 || to >= draft.sections.length) return draft;
  const sections = draft.sections.map((s, i) =>
    i === from
      ? { ...s, segmentIds: s.segmentIds.filter((id) => id !== segmentId) }
      : i === to
        ? {
            ...s,
            segmentIds: by < 0 ? [...s.segmentIds, segmentId] : [segmentId, ...s.segmentIds],
          }
        : s,
  );
  return { ...draft, sections: sections.filter((s) => s.segmentIds.length > 0) };
}

/** A new section starting after this segment, taking the rest of its section. */
export function startSectionAfter(
  draft: StructureDraft,
  segmentId: string,
  title: string,
): StructureDraft {
  const at = draft.sections.findIndex((s) => s.segmentIds.includes(segmentId));
  if (at < 0) return draft;
  const section = draft.sections[at];
  const cut = section.segmentIds.indexOf(segmentId) + 1;
  if (cut >= section.segmentIds.length) return draft;
  const head = { ...section, segmentIds: section.segmentIds.slice(0, cut) };
  const tail: DraftSection = {
    id: null,
    key: keyFor(),
    title,
    recap: null,
    preview: null,
    segmentIds: section.segmentIds.slice(cut),
  };
  const sections = [...draft.sections];
  sections.splice(at, 1, head, tail);
  return { ...draft, sections };
}

/** Fold a section's segments into the one above, and drop the section. */
export function foldIntoAbove(draft: StructureDraft, index: number): StructureDraft {
  if (index <= 0 || index >= draft.sections.length) return draft;
  const sections = [...draft.sections];
  const above = sections[index - 1];
  sections[index - 1] = { ...above, segmentIds: [...above.segmentIds, ...sections[index].segmentIds] };
  sections.splice(index, 1);
  return { ...draft, sections };
}

/**
 * Whether the draft changes order, membership or the section set - the
 * changes the route refuses on an assigned lesson (409
 * `lesson_structure_in_use`), and the ones that mean the review is signed
 * again, since the review is read in section order.
 */
export function isStructural(draft: StructureDraft, original: StructureDraft): boolean {
  if (segmentOrder(draft).join() !== segmentOrder(original).join()) return true;
  if (draft.sections.length !== original.sections.length) return true;
  return draft.sections.some((s, i) => {
    const o = original.sections[i];
    return s.id !== o.id || s.segmentIds.join() !== o.segmentIds.join();
  });
}

/** Anything at all to save. */
export function hasChanges(draft: StructureDraft, original: StructureDraft): boolean {
  if (draft.title !== original.title) return true;
  if (isStructural(draft, original)) return true;
  if (draft.sections.some((s, i) => s.title !== original.sections[i]?.title)) return true;
  return Object.keys(draft.segmentTitles).some(
    (id) => draft.segmentTitles[id] !== original.segmentTitles[id],
  );
}

/** Every name the route requires is there: the lesson's and each section's. */
export function missingNames(draft: StructureDraft): boolean {
  return !draft.title.trim() || draft.sections.some((s) => !s.title.trim());
}

/** What PUT `/lessons/{id}/structure` takes. */
export function toPayload(draft: StructureDraft): CommittedStructureWrite {
  return {
    title: draft.title.trim(),
    segments: segmentOrder(draft).map((id) => ({
      id,
      title: draft.segmentTitles[id]?.trim() || null,
    })),
    modules: draft.sections.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      title: s.title.trim(),
      segmentRecordIds: s.segmentIds,
      recap: s.recap,
      preview: s.preview,
    })),
  };
}
