import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_SAVED_LESSONS,
  refreshSavedLesson,
  removeSavedLesson,
  saveLesson,
  savedLesson,
  savedLessons,
} from "./savedLessons";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * The offline shelf. What matters: one child's shelf is never another's on a
 * shared tablet, a full shelf says so instead of dropping something the child
 * chose to keep, and nothing is saved that the child did not ask for.
 */

const detail = (id: string, title = `Lesson ${id}`) =>
  ({ id, title, segments: [] }) as unknown as LessonDetailResponse;

beforeEach(() => window.localStorage.clear());

describe("the offline shelf", () => {
  it("keeps what a child saved, for that child only", () => {
    expect(saveLesson("ada", detail("l1"))).toBe("saved");

    expect(savedLesson("ada", "l1")?.title).toBe("Lesson l1");
    expect(savedLesson("bayo", "l1")).toBeNull();
    expect(savedLessons("bayo")).toEqual([]);
  });

  it("says it is full rather than dropping a lesson the child chose to keep", () => {
    for (let i = 0; i < MAX_SAVED_LESSONS; i++) saveLesson("ada", detail(`l${i}`));

    expect(saveLesson("ada", detail("one-more"))).toBe("full");
    expect(savedLessons("ada")).toHaveLength(MAX_SAVED_LESSONS);
    expect(savedLesson("ada", "l0")).not.toBeNull();
  });

  it("re-saving a lesson it already holds is not blocked by a full shelf", () => {
    for (let i = 0; i < MAX_SAVED_LESSONS; i++) saveLesson("ada", detail(`l${i}`));

    expect(saveLesson("ada", detail("l3", "Renamed"))).toBe("saved");
    expect(savedLesson("ada", "l3")?.title).toBe("Renamed");
  });

  it("refreshes only a lesson that is already saved", () => {
    refreshSavedLesson("ada", detail("never-saved"));
    expect(savedLesson("ada", "never-saved")).toBeNull();

    saveLesson("ada", detail("l1", "Old title"));
    refreshSavedLesson("ada", detail("l1", "New title"));
    expect(savedLesson("ada", "l1")?.title).toBe("New title");
  });

  it("forgets a lesson the child removes", () => {
    saveLesson("ada", detail("l1"));
    removeSavedLesson("ada", "l1");

    expect(savedLesson("ada", "l1")).toBeNull();
  });
});
