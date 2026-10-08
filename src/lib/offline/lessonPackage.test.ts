import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detailFromPackage,
  downloadLesson,
  formatSize,
  isOfflinePackage,
  lessonFromPackage,
} from "./lessonPackage";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import { isPartialCopy } from "./savedLessons";
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

/** An after-lesson question, `ComprehensionCheckpoint` as the spec has it. */
const checkpoint = () => ({
  id: "cp-1",
  conceptId: null,
  conceptName: "Halves",
  prompt: "How many halves make a whole?",
  answerType: "single_choice",
  options: [
    { value: 2, label: "Two" },
    { value: 3, label: "Three" },
  ],
  answerKey: 2,
  explanation: null,
  position: "after_lesson",
});

/** What a package carries since backend B85 (8 Oct). */
const ending = () => ({
  modules: [
    {
      id: "m1",
      title: "Parts of a whole",
      recap: null,
      preview: "Splitting things fairly.",
      sequenceOrder: 0,
      segmentIds: ["s1"],
    },
  ],
  recap: "You split a whole into two equal halves.",
  assessment: [checkpoint()],
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
    // Nor an ending it left out: absent is not "none".
    expect(detail).not.toHaveProperty("modules");
    expect(detail).not.toHaveProperty("recap");
    expect(detail).not.toHaveProperty("assessment");
  });

  it("keeps the modules, recap and check it carries (B85)", async () => {
    const kept = await lessonFromPackage(
      pkg(JSON.stringify(lesson(ending()))),
      ID,
    );

    expect(kept).toMatchObject(ending());
    // And they play as the detail read's do: grouped, recapped and checked.
    const built = lessonFromContent(kept!, kept!.modules ?? []);
    expect(built?.modules?.[0]).toMatchObject({
      title: "Parts of a whole",
      segmentIds: ["s1"],
    });
    expect(built?.summary?.recap).toBe(
      "You split a whole into two equal halves.",
    );
    expect(built?.assessment?.questions[0].prompt).toBe(
      "How many halves make a whole?",
    );
  });

  it("keeps a null recap as sent, the lesson saying it has none", () => {
    const detail = detailFromPackage(
      lesson({ ...ending(), recap: null }) as never,
    );

    expect(detail).toHaveProperty("recap", null);
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
    expect(isOfflinePackage(lesson(ending()), ID)).toBe(true);
    // A detail's segment has `segmentKey`, not `key`.
    expect(isOfflinePackage(detailShaped(), ID)).toBe(false);
    expect(isOfflinePackage(lesson({ id: "another" }), ID)).toBe(false);
  });

  it("refuses an ending that is not the published shape", () => {
    const [mod] = ending().modules;
    const noSegmentIds = { ...mod, segmentIds: undefined };

    expect(isOfflinePackage(lesson({ recap: ["a"] }), ID)).toBe(false);
    expect(isOfflinePackage(lesson({ assessment: {} }), ID)).toBe(false);
    expect(isOfflinePackage(lesson({ modules: [noSegmentIds] }), ID)).toBe(
      false,
    );
    expect(isOfflinePackage(lesson({ modules: ["m1"] }), ID)).toBe(false);
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

describe("telling a partial copy from the whole lesson", () => {
  // Lydia, 6 Oct: a copy without its modules, recap and after-lesson check is
  // never recorded completed. Since B85 the package can carry all three, so
  // partial is what a copy is MISSING, not where it came from.
  it("knows a package copy without them, as every copy before 8 Oct is", async () => {
    const kept = await lessonFromPackage(pkg(JSON.stringify(lesson())), ID);

    expect(isPartialCopy(kept!)).toBe(true);
  });

  it("knows a package copy that carries all three is whole", async () => {
    const kept = await lessonFromPackage(
      pkg(JSON.stringify(lesson(ending()))),
      ID,
    );

    expect(isPartialCopy(kept!)).toBe(false);
  });

  it("takes an empty list and a null recap as sent, not missing", async () => {
    // A lesson with no modules, no recap and no check says so.
    const none = { modules: [], recap: null, assessment: [] };
    const kept = await lessonFromPackage(
      pkg(JSON.stringify(lesson(none))),
      ID,
    );

    expect(isPartialCopy(kept!)).toBe(false);
  });

  it.each(["modules", "recap", "assessment"])(
    "is partial when only %s is missing",
    async (missing) => {
      const sent: Record<string, unknown> = ending();
      delete sent[missing];
      const kept = await lessonFromPackage(
        pkg(JSON.stringify(lesson(sent))),
        ID,
      );

      expect(isPartialCopy(kept!)).toBe(true);
    },
  );

  it("knows the detail read, which carries all three", () => {
    expect(
      isPartialCopy({
        ...detailShaped(),
        recap: null,
        assessment: [],
      } as never),
    ).toBe(false);
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
