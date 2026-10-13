import { describe, expect, it } from "vitest";
import {
  __toActivityForTest as toActivity,
  __toPulseForTest as toPulse,
} from "./useTeacherHome";

/**
 * The class pulse, which is not drawn (Lydia, 13 Oct).
 *
 * Its three numbers used to leave here as "Above 75%", "50 to 75%" and
 * "Below 50%" - cutoffs of our own. Nothing replaces them until backend sends
 * its own words, so the numbers must not leave this hook in any form.
 */
describe("the class pulse", () => {
  it("carries the class and its headcount, and none of the engine's numbers", () => {
    expect(
      toPulse({
        classId: "c-1",
        className: "JSS 2A",
        studentCount: 28,
        engagement: 0.82,
        comprehension: 0.41,
        focus: 0.6,
      } as Parameters<typeof toPulse>[0]),
    ).toEqual({ classId: "c-1", className: "JSS 2A", studentCount: 28 });
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
