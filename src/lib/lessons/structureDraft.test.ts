import { describe, expect, it } from "vitest";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import {
  draftFrom,
  foldIntoAbove,
  hasChanges,
  isStructural,
  missingNames,
  moveSection,
  moveSegment,
  moveSegmentAcross,
  segmentOrder,
  startSectionAfter,
  toPayload,
} from "./structureDraft";

/**
 * C07d for a committed lesson (Teslim d78756b), shipped reduced: rename,
 * reorder, move between sections, start a section, fold into the one above.
 * The segment set never changes.
 */
const seg = (n: number, title: string | null = `Part ${n}`) => ({
  id: `s-${n}`,
  segmentKey: `k-${n}`,
  sequenceOrder: n,
  title,
});

const lesson = (over: Record<string, unknown> = {}) =>
  ({
    id: "l-1",
    title: "Osmosis",
    status: "completed",
    segments: [seg(1), seg(2), seg(3), seg(4, null)],
    modules: [
      { id: "m-1", title: "Water", recap: "Water moves.", preview: null, sequenceOrder: 1, segmentIds: ["k-1", "k-2"], segmentRecordIds: ["s-1", "s-2"] },
      { id: "m-2", title: "Cells", recap: null, preview: "Next, cells.", sequenceOrder: 2, segmentIds: ["k-3", "k-4"], segmentRecordIds: ["s-3", "s-4"] },
    ],
    ...over,
  }) as unknown as LessonDetailResponse;

describe("draftFrom", () => {
  it("reads the sections by record id, in order, with each segment's title", () => {
    const d = draftFrom(lesson());

    expect(d.sections.map((s) => s.segmentIds)).toEqual([["s-1", "s-2"], ["s-3", "s-4"]]);
    expect(d.segmentTitles).toEqual({ "s-1": "Part 1", "s-2": "Part 2", "s-3": "Part 3", "s-4": "" });
  });

  it("falls back to the module's keys where the read carries no record ids", () => {
    const d = draftFrom(
      lesson({
        modules: [
          { id: "m-1", title: "Water", recap: null, preview: null, sequenceOrder: 1, segmentIds: ["k-1", "k-2", "k-3", "k-4"] },
        ],
      }),
    );

    expect(d.sections[0].segmentIds).toEqual(["s-1", "s-2", "s-3", "s-4"]);
  });

  it("puts a segment no section claims into the last one, which the route needs", () => {
    const d = draftFrom(
      lesson({
        modules: [
          { id: "m-1", title: "Water", recap: null, preview: null, sequenceOrder: 1, segmentIds: [], segmentRecordIds: ["s-1", "s-2", "s-3"] },
        ],
      }),
    );

    expect(d.sections[0].segmentIds).toEqual(["s-1", "s-2", "s-3", "s-4"]);
  });

  it("keeps a lesson with no sections as one ordered list", () => {
    const d = draftFrom(lesson({ modules: [] }));

    expect(d.sections).toEqual([]);
    expect(segmentOrder(d)).toEqual(["s-1", "s-2", "s-3", "s-4"]);
  });
});

describe("the moves the route allows", () => {
  it("moves a segment within its section, and a section within the lesson", () => {
    const d = draftFrom(lesson());

    expect(moveSegment(d, "s-2", -1).sections[0].segmentIds).toEqual(["s-2", "s-1"]);
    expect(moveSection(d, 1, -1).sections.map((s) => s.id)).toEqual(["m-2", "m-1"]);
  });

  it("does nothing past either end", () => {
    const d = draftFrom(lesson());

    expect(moveSegment(d, "s-1", -1)).toEqual(d);
    expect(moveSection(d, 1, 1)).toEqual(d);
  });

  it("moves a segment into the section above, to its end, or below, to its start", () => {
    const d = draftFrom(lesson());

    expect(moveSegmentAcross(d, "s-3", -1).sections.map((s) => s.segmentIds)).toEqual([
      ["s-1", "s-2", "s-3"],
      ["s-4"],
    ]);
    expect(moveSegmentAcross(d, "s-2", 1).sections.map((s) => s.segmentIds)).toEqual([
      ["s-1"],
      ["s-2", "s-3", "s-4"],
    ]);
  });

  it("drops a section a move empties, since the route refuses an empty one", () => {
    let d = draftFrom(lesson());
    d = moveSegmentAcross(d, "s-3", -1);
    d = moveSegmentAcross(d, "s-4", -1);

    expect(d.sections.map((s) => s.id)).toEqual(["m-1"]);
  });

  it("starts a new section after a segment, taking the rest of its section", () => {
    const d = startSectionAfter(draftFrom(lesson()), "s-1", "Section 3");

    expect(d.sections.map((s) => [s.id, s.title, s.segmentIds])).toEqual([
      ["m-1", "Water", ["s-1"]],
      [null, "Section 3", ["s-2"]],
      ["m-2", "Cells", ["s-3", "s-4"]],
    ]);
  });

  it("folds a section into the one above", () => {
    const d = foldIntoAbove(draftFrom(lesson()), 1);

    expect(d.sections.map((s) => [s.id, s.segmentIds])).toEqual([["m-1", ["s-1", "s-2", "s-3", "s-4"]]]);
  });
});

describe("what a change is", () => {
  it("calls a rename a change, but not a structural one", () => {
    const original = draftFrom(lesson());
    const renamed = { ...original, segmentTitles: { ...original.segmentTitles, "s-1": "Water in" } };

    expect(hasChanges(renamed, original)).toBe(true);
    expect(isStructural(renamed, original)).toBe(false);
  });

  it("calls a reorder or a new section structural", () => {
    const original = draftFrom(lesson());

    expect(isStructural(moveSegment(original, "s-2", -1), original)).toBe(true);
    expect(isStructural(startSectionAfter(original, "s-3", "New"), original)).toBe(true);
  });

  it("needs the lesson and every section named", () => {
    const d = draftFrom(lesson());

    expect(missingNames(d)).toBe(false);
    expect(missingNames({ ...d, title: "  " })).toBe(true);
    expect(missingNames({ ...d, sections: [{ ...d.sections[0], title: "" }, d.sections[1]] })).toBe(true);
  });
});

describe("toPayload", () => {
  it("sends every segment, each section's recap and preview back as read, and no id for a new one", () => {
    const d = startSectionAfter(draftFrom(lesson()), "s-1", "Section 3");

    expect(toPayload(d)).toEqual({
      title: "Osmosis",
      segments: [
        { id: "s-1", title: "Part 1" },
        { id: "s-2", title: "Part 2" },
        { id: "s-3", title: "Part 3" },
        // An untitled segment stays untitled.
        { id: "s-4", title: null },
      ],
      modules: [
        { id: "m-1", title: "Water", segmentRecordIds: ["s-1"], recap: "Water moves.", preview: null },
        { title: "Section 3", segmentRecordIds: ["s-2"], recap: null, preview: null },
        { id: "m-2", title: "Cells", segmentRecordIds: ["s-3", "s-4"], recap: null, preview: "Next, cells." },
      ],
    });
  });
});
