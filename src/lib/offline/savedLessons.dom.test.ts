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

  it("keeps the manifest's size and word on media beside the lesson", () => {
    saveLesson("ada", detail("l1"), { sizeBytes: 48_200, includesMedia: false });

    expect(savedLesson("ada", "l1")).toMatchObject({
      sizeBytes: 48_200,
      includesMedia: false,
    });
  });

  it("records no size or media word that no manifest gave", () => {
    saveLesson("ada", detail("l1"));
    saveLesson("ada", detail("l2"), { sizeBytes: null });

    expect(savedLesson("ada", "l1")).not.toHaveProperty("sizeBytes");
    expect(savedLesson("ada", "l1")).not.toHaveProperty("includesMedia");
    expect(savedLesson("ada", "l2")).not.toHaveProperty("sizeBytes");
  });

  it("keeps the size and media word through a refresh", () => {
    saveLesson("ada", detail("l1", "Old title"), {
      sizeBytes: 48_200,
      includesMedia: false,
    });
    refreshSavedLesson("ada", detail("l1", "New title"));

    expect(savedLesson("ada", "l1")).toMatchObject({
      title: "New title",
      sizeBytes: 48_200,
      includesMedia: false,
    });
  });

  it("forgets a lesson the child removes", () => {
    saveLesson("ada", detail("l1"));
    removeSavedLesson("ada", "l1");

    expect(savedLesson("ada", "l1")).toBeNull();
  });
});

/*
 * K4, Lydia 21 Oct: the child's chosen version is "held server-side rather
 * than in browser storage". A lesson read carries it per section since then,
 * with the engine's recommendation for the child - and the shelf holds school
 * content, not anything about the child.
 */
describe("what the child chose, and was recommended", () => {
  const withChoices = (id: string) =>
    ({
      id,
      title: `Lesson ${id}`,
      segments: [
        {
          id: "seg-1",
          body: "Water moves.",
          availableFormats: ["text", "audio"],
          recommendedFormat: "audio",
          deliveryPreference: { modality: "audio", slower: true },
          primaryModality: "audio",
        },
      ],
    }) as unknown as LessonDetailResponse;
  const stored = () => window.localStorage.getItem("nevo.offline.lessons.ada") ?? "";

  it("is never kept on the shelf, saved or refreshed", () => {
    saveLesson("ada", withChoices("l1"));
    expect(stored()).not.toMatch(/deliveryPreference|primaryModality|recommendedFormat/);

    refreshSavedLesson("ada", withChoices("l1"));
    expect(stored()).not.toMatch(/deliveryPreference|primaryModality|recommendedFormat/);
  });

  it("keeps what the section has, which is content", () => {
    saveLesson("ada", withChoices("l1"));

    expect(savedLesson("ada", "l1")?.detail.segments[0]).toMatchObject({
      body: "Water moves.",
      availableFormats: ["text", "audio"],
    });
  });

  it("is not read back from a copy kept before this", () => {
    window.localStorage.setItem(
      "nevo.offline.lessons.ada",
      JSON.stringify({
        l1: {
          lessonId: "l1",
          title: "Lesson l1",
          savedAt: "2026-10-21T09:00:00Z",
          detail: withChoices("l1"),
        },
      }),
    );

    const seg = savedLesson("ada", "l1")?.detail.segments[0];
    expect(seg).not.toHaveProperty("deliveryPreference");
    expect(seg).not.toHaveProperty("primaryModality");
    expect(seg).not.toHaveProperty("recommendedFormat");
  });
});
