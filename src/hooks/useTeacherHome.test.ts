import { describe, expect, it } from "vitest";
import {
  __toActivityForTest as toActivity,
  __toPulseForTest as toPulse,
} from "./useTeacherHome";

/**
 * The class pulse prints the engine's words and never its numbers.
 *
 * The numbers used to leave here as "Above 75%", "50 to 75%" and "Below 50%" -
 * cutoffs of our own, struck by Lydia on 13 Oct. Backend now sends a label per
 * metric (B-6, 14 Oct) and owns the boundaries, so the label is passed through
 * untouched and the number is not passed at all.
 */
describe("the class pulse", () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      classId: "c-1",
      className: "JSS 2A",
      studentCount: 28,
      engagement: 82,
      comprehension: 41,
      focus: 60,
      engagementLabel: "Steady",
      comprehensionLabel: "May benefit from support",
      focusLabel: "Mixed",
      ...over,
    }) as Parameters<typeof toPulse>[0];

  it("carries each metric's label exactly as backend sent it", () => {
    expect(toPulse(row()).tiles).toEqual([
      { head: "Engagement", label: "Steady" },
      { head: "Comprehension", label: "May benefit from support" },
      { head: "Focus", label: "Mixed" },
    ]);
  });

  it("does not decide anything from the numbers", () => {
    // Numbers that a cutoff of ours would have read the other way round.
    const flipped = toPulse(row({ engagement: 5, comprehension: 99, focus: 50 }));
    expect(flipped.tiles.map((t) => t.label)).toEqual([
      "Steady",
      "May benefit from support",
      "Mixed",
    ]);
    expect(JSON.stringify(flipped)).not.toMatch(/\b(5|99|50|82|41|60)\b/);
  });

  it("leaves out a metric backend sent no word for, rather than filling it in", () => {
    const pulse = toPulse(row({ comprehensionLabel: null, focusLabel: undefined }));
    expect(pulse.tiles).toEqual([{ head: "Engagement", label: "Steady" }]);
  });

  it("keeps the headcount, which My Classes shows", () => {
    expect(toPulse(row()).studentCount).toBe(28);
  });
});

/**
 * The activity mapper, where two delivered fields were being thrown away.
 *
 * `completedCount` and `totalCount` were missing from `ActivityRow`, so the
 * poll dropped them and Home's LIVE activity list showed a title and a date
 * where the SAMPLE list beside it drew a progress bar. Third instance of the
 * pattern - `note` on `Assignment` was the first.
 *
 * TESTED HERE AND NOT ON THE COMPONENT, deliberately. The component test mocks
 * this hook, so the mapper never runs under it: a mutation that deleted the
 * passthrough entirely failed nothing there. This is the only level at which
 * that mutation dies.
 */
describe("the activity mapper", () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: "a-1",
      activityType: "lesson_completed",
      occurredAt: "2026-09-17T09:00:00Z",
      title: "Fractions 3",
      detail: "JSS 2A",
      classId: "c-1",
      studentId: null,
      lessonId: "l-1",
      actionTarget: "/teacher/lessons/l-1",
      completedCount: 12,
      totalCount: 28,
      ...over,
    }) as Parameters<typeof toActivity>[0];

  it("carries both counts through", () => {
    const out = toActivity(row());

    expect(out.completedCount).toBe(12);
    expect(out.totalCount).toBe(28);
  });

  it("keeps null as null, never as zero", () => {
    // "We were not told" and "none of them" are different facts about a class's
    // week, and defaulting to 0 would state the second on the strength of the
    // first.
    const out = toActivity(row({ completedCount: null, totalCount: null }));

    expect(out.completedCount).toBeNull();
    expect(out.totalCount).toBeNull();
  });

  it("keeps a real zero as zero", () => {
    const out = toActivity(row({ completedCount: 0, totalCount: 28 }));

    expect(out.completedCount).toBe(0);
    expect(out.totalCount).toBe(28);
  });
});
