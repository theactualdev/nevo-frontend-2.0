import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadLesson,
  formatSize,
  isLessonDetail,
  lessonFromPackage,
} from "./lessonPackage";
import { buildZip } from "./testZip";
import { ZipError, ZipUnsupported } from "./zip";

/**
 * Saving through the offline package. What matters: the lesson kept is the
 * one inside the package and only when it is a lesson the player can open;
 * the size and the word on media are the manifest's, never ours; and a
 * package that cannot be read is a failed save, not a broken lesson.
 */

const { download, offlinePackage, detail } = vi.hoisted(() => ({
  download: vi.fn(),
  offlinePackage: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({
  lessonsApi: { download, offlinePackage, detail },
}));

const ID = "7f9c2b1e-0000-4000-8000-000000000001";

const lesson = (over: Record<string, unknown> = {}) => ({
  id: ID,
  title: "Fractions",
  segments: [
    {
      id: "s1",
      segmentKey: "s1",
      sequenceOrder: 0,
      contentType: "explanatory_text",
      title: "Halves",
      body: "A half is one of two equal parts.",
      availableModalities: ["text"],
      comprehensionCheckpoints: [],
    },
  ],
  modules: [],
  ...over,
});

const pkg = (lessonJson: string) =>
  buildZip([
    { name: "lesson.json", data: lessonJson },
    { name: "manifest.json", data: '{"includesMedia":false}' },
  ]);

const manifest = (over: Record<string, unknown> = {}) => ({
  id: "download-1",
  manifest: {
    lessonId: ID,
    version: 1,
    segmentCount: 1,
    generatedAt: "2026-10-01T10:00:00Z",
    packageUrl: `/api/v1/lessons/${ID}/offline-package`,
    sizeBytes: 1_234_567,
    files: ["lesson.json", "manifest.json"],
    includesMedia: false,
    ...over,
  },
});

beforeEach(() => {
  download.mockReset();
  offlinePackage.mockReset();
  detail.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("the lesson inside a package", () => {
  it("is kept when it is a lesson this player can open", async () => {
    const kept = await lessonFromPackage(pkg(JSON.stringify(lesson())), ID);

    expect(kept?.title).toBe("Fractions");
    expect(kept?.segments[0].body).toBe("A half is one of two equal parts.");
  });

  it("is not kept when it belongs to another lesson", async () => {
    const other = JSON.stringify(lesson({ id: "someone-elses-lesson" }));

    expect(await lessonFromPackage(pkg(other), ID)).toBeNull();
  });

  it("is not kept when it is not a lesson's shape", async () => {
    const noSegments = JSON.stringify(lesson({ segments: undefined }));
    const flatSegment = JSON.stringify(
      lesson({ segments: [{ id: "s1", text: "A half" }] }),
    );

    expect(await lessonFromPackage(pkg(noSegments), ID)).toBeNull();
    expect(await lessonFromPackage(pkg(flatSegment), ID)).toBeNull();
    expect(await lessonFromPackage(pkg("not json"), ID)).toBeNull();
  });

  it("is not there when the package holds no lesson.json", async () => {
    const zip = buildZip([{ name: "manifest.json", data: "{}" }]);

    expect(await lessonFromPackage(zip, ID)).toBeNull();
  });

  it("is never read out of a damaged archive", async () => {
    const zip = buildZip([
      { name: "lesson.json", data: JSON.stringify(lesson()), method: 0, crc: 7 },
    ]);

    await expect(lessonFromPackage(zip, ID)).rejects.toBeInstanceOf(ZipError);
  });

  it("accepts a package without the teacher-facing fields", () => {
    // No status, counts, classes or confirmationSummary: nothing a child sees.
    expect(isLessonDetail(lesson(), ID)).toBe(true);
    expect(isLessonDetail(lesson({ modules: null, assessment: null }), ID)).toBe(
      true,
    );
    expect(isLessonDetail(lesson({ modules: "none" }), ID)).toBe(false);
  });
});

describe("saving a lesson through its package", () => {
  it("asks for the manifest, then the package, and keeps the lesson inside", async () => {
    download.mockResolvedValue(manifest());
    offlinePackage.mockResolvedValue(new Blob([pkg(JSON.stringify(lesson()))]));

    const saved = await downloadLesson(ID);

    expect(download).toHaveBeenCalledWith(ID);
    expect(offlinePackage).toHaveBeenCalledWith(ID);
    expect(detail).not.toHaveBeenCalled();
    expect(saved.detail.title).toBe("Fractions");
    expect(saved.sizeBytes).toBe(1_234_567);
    expect(saved.includesMedia).toBe(false);
  });

  it("keeps the detail read instead when lesson.json is not a lesson", async () => {
    download.mockResolvedValue(manifest());
    offlinePackage.mockResolvedValue(new Blob([pkg('{"lesson":{}}')]));
    detail.mockResolvedValue(lesson({ title: "From the detail read" }));

    const saved = await downloadLesson(ID);

    expect(detail).toHaveBeenCalledWith(ID);
    expect(saved.detail.title).toBe("From the detail read");
    expect(saved.includesMedia).toBe(false);
  });

  it("shows no size the manifest did not give", async () => {
    download.mockResolvedValue(manifest({ sizeBytes: 0, includesMedia: undefined }));
    offlinePackage.mockResolvedValue(new Blob([pkg(JSON.stringify(lesson()))]));

    const saved = await downloadLesson(ID);

    expect(saved.sizeBytes).toBeNull();
    expect(saved.includesMedia).toBeUndefined();
  });

  it("fails, and keeps nothing, when the package cannot be fetched", async () => {
    download.mockResolvedValue(manifest());
    offlinePackage.mockRejectedValue(new Error("offline"));

    await expect(downloadLesson(ID)).rejects.toThrow("offline");
    expect(detail).not.toHaveBeenCalled();
  });

  it("fails as unsupported on a device that cannot unpack it", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    download.mockResolvedValue(manifest());
    offlinePackage.mockResolvedValue(new Blob([pkg(JSON.stringify(lesson()))]));

    await expect(downloadLesson(ID)).rejects.toBeInstanceOf(ZipUnsupported);
    expect(detail).not.toHaveBeenCalled();
  });
});

describe("a size a child can read", () => {
  it.each([
    [1_234_567, "1.2 MB"],
    [6_000_000, "6 MB"],
    [12_400_000, "12 MB"],
    [48_200, "48 KB"],
    [999_600, "1 MB"],
    [300, "1 KB"],
  ])("%d bytes reads as %s", (size, shown) => {
    expect(formatSize(size)).toBe(shown);
  });

  it("is nothing at all when there is no size", () => {
    expect(formatSize(0)).toBeNull();
    expect(formatSize(undefined)).toBeNull();
    expect(formatSize(null)).toBeNull();
  });
});
