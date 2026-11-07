import { describe, expect, it } from "vitest";
import { asOfflineMarked, isMarkingKeyVersion, markingKeyFor } from "./offlineMark";
import { detailFromPackage } from "@/lib/offline/lessonPackage";
import { lessonFromContent } from "./fromContent";

/**
 * 9B: an answer the device marked from the package's key goes up flagged,
 * with the version of the key it was marked against - and only then. The
 * keys are the server's own (`_offline_package_payload`, Teslim 41c2f83).
 */

const V1 = "a".repeat(64);
const V2 = "0123456789abcdef".repeat(4);

describe("the package's key for an answer", () => {
  it("is the server's, for each kind of answer", () => {
    expect(
      markingKeyFor({ source: "assessment", problemId: "q-1" }),
    ).toBe("assessment::q-1");
    expect(
      markingKeyFor({ source: "checkpoint", problemId: "cp-1", segmentId: "seg-1" }),
    ).toBe("checkpoint:seg-1:cp-1");
    // A step, a mini-step and the solved calculation alike.
    expect(
      markingKeyFor({ source: "calculation", problemId: "s2", segmentId: "seg-1" }),
    ).toBe("calculation:seg-1:s2");
    expect(
      markingKeyFor({ source: "calculation", problemId: "mini-ab12", segmentId: "seg-1" }),
    ).toBe("calculation:seg-1:mini-ab12");
  });

  it("is nothing for an answer with no segment to name", () => {
    expect(markingKeyFor({ source: "checkpoint", problemId: "cp-1" })).toBeNull();
    expect(markingKeyFor({ source: "calculation", problemId: "s2", segmentId: null })).toBeNull();
  });
});

describe("a held answer", () => {
  const answer = {
    source: "checkpoint" as const,
    problemId: "cp-1",
    segmentId: "seg-1",
    clientAttemptId: "c-1",
    answer: "a",
  };

  it("says it was marked on the device, with its key's version, where the package gave one", () => {
    expect(asOfflineMarked(answer, { "checkpoint:seg-1:cp-1": V1 })).toEqual({
      ...answer,
      offlineMarked: true,
      markingKeyVersion: V1,
    });
  });

  it("goes up plain where there is no version for it: a lesson opened online, or another question's", () => {
    expect(asOfflineMarked(answer, undefined)).toBe(answer);
    expect(asOfflineMarked(answer, { "checkpoint:seg-2:cp-1": V1 })).toBe(answer);
  });

  it("is never half-flagged: no attempt id, or a version the server would not take, is no flag", () => {
    expect(
      asOfflineMarked({ ...answer, clientAttemptId: undefined }, { "checkpoint:seg-1:cp-1": V1 }),
    ).not.toHaveProperty("offlineMarked");
    expect(
      asOfflineMarked(answer, { "checkpoint:seg-1:cp-1": "short" }),
    ).not.toHaveProperty("offlineMarked");
    expect(isMarkingKeyVersion(V2)).toBe(true);
    expect(isMarkingKeyVersion(V1.toUpperCase())).toBe(false);
    expect(isMarkingKeyVersion(`${V1}0`)).toBe(false);
  });
});

describe("a saved lesson's key versions", () => {
  const pkg = (versions?: unknown) => ({
    id: "lesson-1",
    title: "Fractions",
    segments: [
      {
        id: "seg-1",
        key: "halves",
        sequenceOrder: 1,
        contentType: "explanatory_text",
        title: "Halves",
        body: "A half is one of two equal parts.",
        availableModalities: ["text"],
        modalityVariants: {
          text: null,
          visual: null,
          audio: null,
          interactive: null,
          calculation: null,
        },
        depthVariants: null,
        comprehensionCheckpoints: [],
      },
    ],
    ...(versions === undefined ? {} : { markingKeyVersions: versions }),
  });

  it("come from the package to the lesson the player opens", () => {
    const detail = detailFromPackage(
      pkg({ "checkpoint:seg-1:cp-1": V1, "assessment::q-1": V2 }) as never,
    );
    expect(detail.markingKeyVersions).toEqual({
      "checkpoint:seg-1:cp-1": V1,
      "assessment::q-1": V2,
    });
    expect(lessonFromContent(detail)?.markingKeyVersions).toEqual({
      "checkpoint:seg-1:cp-1": V1,
      "assessment::q-1": V2,
    });
  });

  it("keep only versions the server would take, and are absent where the package sent none", () => {
    const detail = detailFromPackage(
      pkg({ "checkpoint:seg-1:cp-1": V1, odd: 42, short: "abc" }) as never,
    );
    expect(detail.markingKeyVersions).toEqual({ "checkpoint:seg-1:cp-1": V1 });

    expect(detailFromPackage(pkg() as never)).not.toHaveProperty("markingKeyVersions");
    expect(
      detailFromPackage(pkg({ short: "abc" }) as never),
    ).not.toHaveProperty("markingKeyVersions");
    expect(
      lessonFromContent(detailFromPackage(pkg() as never)),
    ).not.toHaveProperty("markingKeyVersions");
  });
});
