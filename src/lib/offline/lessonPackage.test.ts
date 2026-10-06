import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detailFromPackage,
  downloadLesson,
  formatSize,
  isOfflinePackage,
  lessonFromPackage,
} from "./lessonPackage";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import { buildZip } from "./testZip";
import { ZipError } from "./zip";

/**
 * Saving through the offline package. What matters: the lesson kept is the
 * one inside the package and only when it is a lesson the player can open;
 * the size and the word on media are the manifest's, never ours; and a
 * package that cannot be read is a failed save, not a broken lesson.
 *
 * `lesson.json` IS AN `OfflinePackage` (backend B60, 5 Oct), not a lesson
 * detail: variants nested under `modalityVariants`, a segment's key as
 * `key`, and no review or authorship fields. It was validated as a detail,
 * so a correct package was rejected every time and the detail read kept
 * instead. The fixture below is the published shape, not the detail's.
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

const segment = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  key: "halves",
  sequenceOrder: 1,
  contentType: "explanatory_text",
  title: "Halves",
  body: "A half is one of two equal parts.",
  availableModalities: ["text", "visual"],
  modalityVariants: {
    text: null,
    visual: {
      type: "diagram",
      imageUrl: "https://cdn.example/halves.png",
      storagePath: "lessons/halves.png",
      caption: "Two halves",
      qualityValidated: true,
      urlExpiresInSeconds: null,
    },
    audio: null,
    interactive: null,
    calculation: null,
  },
  depthVariants: null,
  comprehensionCheckpoints: [],
  ...over,
});

/** `OfflinePackage`, as the spec publishes it. */
const lesson = (over: Record<string, unknown> = {}) => ({
  id: ID,
  title: "Fractions",
  version: "3",
  segments: [segment()],
  ...over,
});

/** A lesson DETAIL - what the detail read returns, and what a package is not. */
const detailShaped = () => ({
  id: ID,
  title: "From the detail read",
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
      needsReview: false,
      reviewReasons: [],
      approved: true,
      approvedAt: null,
    },
  ],
  modules: [],
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

  it("is a correct package in the published shape, not a lesson detail", async () => {
    // THE DEFECT: this shape was rejected, because it was read as a detail.
    const kept = await lessonFromPackage(pkg(JSON.stringify(lesson())), ID);

    expect(kept).not.toBeNull();
    expect(kept?.segments[0].segmentKey).toBe("halves");
  });

  it("brings each nested variant out to where the player reads it", async () => {
    const kept = await lessonFromPackage(pkg(JSON.stringify(lesson())), ID);

    expect(kept?.segments[0].visualVariant).toMatchObject({
      imageUrl: "https://cdn.example/halves.png",
    });
    expect(kept?.segments[0].textVariant).toBeNull();
    // And it plays: the same builder a live open uses draws the picture.
    const built = lessonFromContent(kept!);
    expect(built?.segments[0].visual?.illustration?.src).toBe(
      "https://cdn.example/halves.png",
    );
    expect(JSON.stringify(built?.segments[0].text)).toMatch(
      /one of two equal parts/,
    );
  });

  it("adds none of the fields a package does not carry", () => {
    // No review, authorship or library fields - and none made up, such as an
    // `approved` nobody sent.
    const detail = detailFromPackage(lesson() as never);
    const seg = detail.segments[0] as unknown as Record<string, unknown>;

    expect(seg).not.toHaveProperty("approved");
    expect(seg).not.toHaveProperty("needsReview");
    expect(detail).not.toHaveProperty("status");
    expect(detail).not.toHaveProperty("modules");
  });

  it("fills a segment's missing lists and variants as the detail says none", async () => {
    const bare = segment({
      title: undefined,
      availableModalities: undefined,
      modalityVariants: undefined,
      depthVariants: undefined,
      comprehensionCheckpoints: undefined,
    });
    const kept = await lessonFromPackage(
      pkg(JSON.stringify(lesson({ segments: [bare] }))),
      ID,
    );

    expect(kept?.segments[0]).toMatchObject({
      title: null,
      availableModalities: [],
      comprehensionCheckpoints: [],
      visualVariant: null,
      depthVariants: null,
    });
  });

  it("is not kept when it belongs to another lesson", async () => {
    const other = JSON.stringify(lesson({ id: "someone-elses-lesson" }));

    expect(await lessonFromPackage(pkg(other), ID)).toBeNull();
  });

  it("is not kept when it is not a package's shape", async () => {
    const noSegments = JSON.stringify(lesson({ segments: undefined }));
    const flatSegment = JSON.stringify(
      lesson({ segments: [{ id: "s1", text: "A half" }] }),
    );
    const flatVariants = JSON.stringify(
      lesson({ segments: [segment({ modalityVariants: { visual: "pic" } })] }),
    );

    expect(await lessonFromPackage(pkg(noSegments), ID)).toBeNull();
    expect(await lessonFromPackage(pkg(flatSegment), ID)).toBeNull();
    expect(await lessonFromPackage(pkg(flatVariants), ID)).toBeNull();
    expect(await lessonFromPackage(pkg("not json"), ID)).toBeNull();
  });

  it("is not kept when there is nothing in it to play", async () => {
    const empty = JSON.stringify(lesson({ segments: [] }));

    expect(await lessonFromPackage(pkg(empty), ID)).toBeNull();
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

  it("accepts the published shape and refuses a lesson detail's", () => {
    expect(isOfflinePackage(lesson(), ID)).toBe(true);
    expect(isOfflinePackage(lesson({ version: null }), ID)).toBe(true);
    // A detail's segment has `segmentKey`, not `key`.
    expect(isOfflinePackage(detailShaped(), ID)).toBe(false);
    expect(isOfflinePackage(lesson({ id: "another" }), ID)).toBe(false);
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
    detail.mockResolvedValue(detailShaped());

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

  it("still saves on a device too old to unpack it, through the detail read", async () => {
    // Classroom tablets are often older than "deflate-raw", and could save
    // before the package existed. The package is not at fault.
    vi.stubGlobal("DecompressionStream", undefined);
    download.mockResolvedValue(manifest());
    offlinePackage.mockResolvedValue(new Blob([pkg(JSON.stringify(lesson()))]));
    detail.mockResolvedValue(detailShaped());

    const saved = await downloadLesson(ID);

    expect(detail).toHaveBeenCalledWith(ID);
    expect(saved.detail.id).toBe(ID);
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
