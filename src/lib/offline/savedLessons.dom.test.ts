import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SAVED_LESSONS,
  canOpenOffline,
  noteServerTime,
  refreshSavedLesson,
  removeSavedLesson,
  saveLesson,
  savedLesson,
  savedLessons,
} from "./savedLessons";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import { FRESH_DOWNLOAD } from "./testDownload";

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
    for (let i = 0; i < MAX_SAVED_LESSONS; i++)
      saveLesson("ada", detail(`l${i}`), FRESH_DOWNLOAD);

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

/**
 * SAFETY V2 (Teslim 9f4d763, 18 Nov): a copy opens offline only while it came
 * from a download the server can check, nothing holds it, and it is inside
 * its fourteen days - by a clock that a device wound back cannot fool once it
 * has seen a later time.
 */
describe("whether a copy can open offline", () => {
  afterEach(() => vi.useRealTimers());

  const kept = (pkg: object) => {
    saveLesson("ada", detail("l1"), pkg);
    return savedLesson("ada", "l1")!;
  };

  it("can, from a download the server issued and inside its expiry", () => {
    expect(canOpenOffline(kept(FRESH_DOWNLOAD))).toBe(true);
  });

  it("cannot, when it was kept before safety v2", () => {
    expect(canOpenOffline(kept({}))).toBe(false);
    expect(canOpenOffline(kept({ downloadId: "d1" }))).toBe(false);
  });

  it("cannot, past its expiry", () => {
    expect(
      canOpenOffline(kept({ ...FRESH_DOWNLOAD, expiresAt: "2020-01-01T00:00:00Z" })),
    ).toBe(false);
  });

  it("cannot, while something holds it", () => {
    expect(canOpenOffline({ ...kept(FRESH_DOWNLOAD), hold: "stale" })).toBe(false);
    expect(canOpenOffline({ ...kept(FRESH_DOWNLOAD), hold: "unchecked" })).toBe(
      false,
    );
  });

  it("cannot be reopened by winding the clock back past a time the device has seen", () => {
    vi.useFakeTimers();
    const copy = kept({ ...FRESH_DOWNLOAD, expiresAt: "2026-12-03T00:00:00Z" });
    vi.setSystemTime(new Date("2026-12-04T00:00:00Z"));
    expect(canOpenOffline(copy)).toBe(false);

    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));

    expect(canOpenOffline(copy)).toBe(false);
  });

  it("takes the server's clock over a device clock set ahead", () => {
    vi.useFakeTimers();
    const copy = kept({ ...FRESH_DOWNLOAD, expiresAt: "2026-12-03T00:00:00Z" });
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
    expect(canOpenOffline(copy)).toBe(false);

    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
    noteServerTime("2026-11-20T00:00:00Z");

    expect(canOpenOffline(copy)).toBe(true);
  });

  /*
   * THE LIMITATION, RECORDED (acceptance step 4): a clock wound back before
   * the device has seen a later time is not caught. Pinned, so a change that
   * claims to catch it has to say how.
   */
  it("cannot catch a clock wound back before the device has seen a later time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
    const copy = kept({ ...FRESH_DOWNLOAD, expiresAt: "2026-11-25T00:00:00Z" });

    expect(canOpenOffline(copy)).toBe(true);
  });
});

describe("a full shelf and copies that can no longer open", () => {
  it("makes room by dropping the oldest copy that cannot open", () => {
    saveLesson("ada", detail("dead"), {});
    for (let i = 1; i < MAX_SAVED_LESSONS; i++)
      saveLesson("ada", detail(`l${i}`), FRESH_DOWNLOAD);

    expect(saveLesson("ada", detail("one-more"), FRESH_DOWNLOAD)).toBe("saved");

    expect(savedLesson("ada", "dead")).toBeNull();
    expect(savedLesson("ada", "l1")).not.toBeNull();
    expect(savedLessons("ada")).toHaveLength(MAX_SAVED_LESSONS);
  });

  it("keeps the download and its expiry with the copy", () => {
    saveLesson("ada", detail("l1"), FRESH_DOWNLOAD);

    expect(savedLesson("ada", "l1")).toMatchObject(FRESH_DOWNLOAD);
  });
});
